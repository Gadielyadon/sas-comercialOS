// src/services/backup_auto.service.js
// Copias de seguridad AUTOMÁTICAS + subida cifrada a Google Drive.
//
//  · Todos los días a las 03:00 (hora de Argentina; se cambia con BACKUP_HORA en el .env):
//    1) copia de la base (misma técnica segura que el botón manual)
//    2) verifica que la copia no esté dañada
//    3) la comprime, la CIFRA y la sube a una carpeta de tu Google Drive
//    4) limpia las copias viejas (nunca toca las manuales)
//  · Antes de operaciones riesgosas (importar Excel, actualizar precios/IVA masivo) hace una copia "previa".
//  · Si algo falla, o pasan más de 26 hs sin copia, avisa en la campana del sistema.
//
// Conexión con Google: flujo "dispositivo" (se muestra un código y se aprueba desde el celular/PC).
// Permiso mínimo (drive.file): el sistema solo ve los archivos que él mismo sube.
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const backupSvc = require('./backup.service');
const { cifrarArchivo } = require('./backup_crypto');

const DATA_DIR    = process.env.AXSOFT_DATA_DIR || path.join(__dirname, '..', '..');
const TOKEN_FILE  = path.join(DATA_DIR, 'backup-drive.json');   // conexión con Drive (fuera de la base de datos)
const ESTADO_FILE = path.join(DATA_DIR, 'backup-estado.json');
const CARPETA_RAIZ = 'AxSoft Backups';
const MAX_SUBIDA_BYTES = 400 * 1024 * 1024;

const OAUTH = () => process.env.GOOGLE_OAUTH_BASE || 'https://oauth2.googleapis.com';
const DRIVE = () => process.env.GOOGLE_DRIVE_BASE || 'https://www.googleapis.com';
const HORA  = () => { const h = Number(process.env.BACKUP_HORA); return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 3; };
const clientId     = () => (process.env.GOOGLE_CLIENT_ID || '').trim();
const clientSecret = () => (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const claveCifrado = () => { const k = (process.env.BACKUP_ENCRYPTION_KEY || '').trim(); return /^[0-9a-fA-F]{64}$/.test(k) ? k : ''; };
const nombreCliente = () => (process.env.BACKUP_CLIENT_NAME || '').trim();

// ── Estado (archivo JSON chico, fuera de la base de datos) ───────────────
function leerJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } }
function escribirJson(file, obj, modo) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: modo || 0o644 });
  fs.renameSync(tmp, file);
}
const leerEstado = () => leerJson(ESTADO_FILE) || {};
function guardarEstado(cambios) { const e = { ...leerEstado(), ...cambios }; escribirJson(ESTADO_FILE, e); return e; }
const leerToken = () => leerJson(TOKEN_FILE);

// ── Retención ────────────────────────────────────────────────────────────
const RE_NOMBRE = /^(auto|previa)_(\d{4}-\d{2}-\d{2})_(\d{6})\.(sqlite|axbk)$/;
function parsearNombre(nombre) {
  const m = RE_NOMBRE.exec(nombre);
  return m ? { nombre, tipo: m[1], fecha: m[2], hora: m[3] } : null;
}
const claveOrden = it => it.fecha + it.hora;
function lunesDe(fecha) {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
// Conserva: la última de cada uno de los últimos N días, de las últimas N semanas y de los últimos N meses.
function seleccionarConservar(items, { diarias = 14, semanales = 8, mensuales = 6 } = {}) {
  const orden = [...items].sort((a, b) => claveOrden(b).localeCompare(claveOrden(a)));
  const conservar = new Set();
  const grupo = (clave, cuantos) => {
    const vistos = new Map();
    for (const it of orden) { const k = clave(it); if (!vistos.has(k)) vistos.set(k, it); }
    [...vistos.values()].slice(0, cuantos).forEach(it => conservar.add(it.nombre));
  };
  grupo(it => it.fecha, diarias);
  grupo(it => lunesDe(it.fecha), semanales);
  grupo(it => it.fecha.slice(0, 7), mensuales);
  return conservar;
}
function seleccionarBorrar(items, tipo) {
  const propios = items.filter(i => i.tipo === tipo);
  if (tipo === 'previa') {            // las previas: solo las últimas 10
    const orden = [...propios].sort((a, b) => claveOrden(b).localeCompare(claveOrden(a)));
    return orden.slice(10);
  }
  const conservar = seleccionarConservar(propios);
  return propios.filter(i => !conservar.has(i.nombre));
}

// `proteger`: nombre de una copia que NO se puede borrar (la que se acaba de crear y está por subirse)
function aplicarRetencionLocal(proteger) {
  const dir = backupSvc.BACKUPS_DIR;
  if (!fs.existsSync(dir)) return 0;
  const items = fs.readdirSync(dir).map(parsearNombre).filter(Boolean).filter(i => i.nombre.endsWith('.sqlite'));
  // En el servidor se guardan pocas (la historia larga queda en Drive): últimos 7 días y últimas 5 previas
  const auto = items.filter(i => i.tipo === 'auto').sort((a, b) => claveOrden(b).localeCompare(claveOrden(a)));
  const porDia = new Map(); for (const it of auto) if (!porDia.has(it.fecha)) porDia.set(it.fecha, it);
  const guardar = new Set([...porDia.values()].slice(0, 7).map(i => i.nombre));
  const previas = items.filter(i => i.tipo === 'previa').sort((a, b) => claveOrden(b).localeCompare(claveOrden(a))).slice(0, 5);
  previas.forEach(i => guardar.add(i.nombre));
  if (proteger) guardar.add(proteger);
  let borradas = 0;
  for (const it of items) if (!guardar.has(it.nombre)) { try { fs.unlinkSync(path.join(dir, it.nombre)); borradas++; } catch (_) {} }
  return borradas;
}

// ── Verificación de la copia ─────────────────────────────────────────────
function verificarIntegridad(ruta) {
  const fd = fs.openSync(ruta, 'r');
  const cab = Buffer.alloc(16);
  try { fs.readSync(fd, cab, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (cab.toString('latin1', 0, 15) !== 'SQLite format 3') return { ok: false, detalle: 'el archivo no es una base SQLite' };
  const Database = require('better-sqlite3');
  const d = new Database(ruta, { readonly: true });
  try {
    const rows = d.pragma('integrity_check');
    const valores = (Array.isArray(rows) ? rows : [rows]).map(r => String(typeof r === 'object' ? Object.values(r)[0] : r).toLowerCase());
    const ok = valores.length === 1 && valores[0] === 'ok';
    return { ok, detalle: ok ? 'ok' : valores.join('; ').slice(0, 200) };
  } finally { d.close(); }
}

// ── Google: conexión (flujo de dispositivo) ──────────────────────────────
function error(msg, extra) { return Object.assign(new Error(msg), extra || {}); }
async function pedirJson(url, opts, contexto) {
  let r;
  try { r = await fetch(url, { ...opts, signal: AbortSignal.timeout((opts && opts.timeout) || 60000) }); }
  catch (e) { throw error(`${contexto}: no se pudo conectar con Google (${e.cause?.code || e.message})`, { red: true }); }
  const texto = await r.text();
  let j = null; try { j = texto ? JSON.parse(texto) : null; } catch (_) {}
  if (!r.ok) {
    const msg = j?.error_description || j?.error?.message || (typeof j?.error === 'string' ? j.error : '') || texto.slice(0, 200) || `HTTP ${r.status}`;
    throw error(`${contexto}: ${msg}`, { status: r.status, codigo: typeof j?.error === 'string' ? j.error : (j?.error?.errors?.[0]?.reason || null) });
  }
  return j;
}
const form = obj => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(obj) });

let _conexion = null;   // conexión en curso: { device_code, user_code, verification_url, expira, intervalo, ultimoSondeo }
let _acc = null;        // acceso temporal a Drive en memoria

async function conectarIniciar() {
  if (!clientId() || !clientSecret()) throw error('Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el .env del servidor');
  const j = await pedirJson(OAUTH() + '/device/code', form({ client_id: clientId(), scope: 'https://www.googleapis.com/auth/drive.file' }), 'Iniciar conexión con Google');
  _conexion = {
    device_code: j.device_code, user_code: j.user_code,
    verification_url: j.verification_url || j.verification_uri || 'https://www.google.com/device',
    expira: Date.now() + (j.expires_in || 1800) * 1000, intervalo: Math.max(1, j.interval || 5), ultimoSondeo: 0,
  };
  return { user_code: _conexion.user_code, verification_url: _conexion.verification_url, expires_in: j.expires_in || 1800, interval: _conexion.intervalo };
}

async function conectarSondear() {
  if (!_conexion) return { estado: 'sin_inicio' };
  if (Date.now() > _conexion.expira) { _conexion = null; return { estado: 'expirado' }; }
  if (Date.now() - _conexion.ultimoSondeo < _conexion.intervalo * 1000 - 200) return { estado: 'pendiente' };
  _conexion.ultimoSondeo = Date.now();
  let j;
  try {
    j = await pedirJson(OAUTH() + '/token', form({
      client_id: clientId(), client_secret: clientSecret(), device_code: _conexion.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }), 'Confirmar conexión con Google');
  } catch (e) {
    if (e.codigo === 'authorization_pending') return { estado: 'pendiente' };
    if (e.codigo === 'slow_down') { _conexion.intervalo += 5; return { estado: 'pendiente' }; }
    if (e.codigo === 'access_denied') { _conexion = null; return { estado: 'denegado' }; }
    if (e.codigo === 'expired_token') { _conexion = null; return { estado: 'expirado' }; }
    throw e;
  }
  if (!j.refresh_token) throw error('Google no entregó el permiso permanente. Probá conectar de nuevo.');
  _conexion = null;
  _acc = { token: j.access_token, hasta: Date.now() + (j.expires_in || 3600) * 1000 };
  let email = null;
  try {
    const about = await pedirJson(`${DRIVE()}/drive/v3/about?fields=user(emailAddress,displayName)`, { headers: { Authorization: 'Bearer ' + j.access_token }, timeout: 15000 }, 'Datos de la cuenta');
    email = about?.user?.emailAddress || null;
  } catch (_) {}
  escribirJson(TOKEN_FILE, { refresh_token: j.refresh_token, email, conectado: new Date().toISOString() }, 0o600);
  guardarEstado({ driveRevocado: false, driveError: null });
  return { estado: 'conectado', email };
}

function desconectar() {
  try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
  _acc = null; _conexion = null;
  guardarEstado({ driveRevocado: false, driveError: null });
}

// ── Google Drive: subida y limpieza ──────────────────────────────────────
async function accessToken() {
  if (_acc && _acc.hasta > Date.now() + 60000) return _acc.token;
  const t = leerToken();
  if (!t || !t.refresh_token) throw error('Google Drive no está conectado');
  try {
    const j = await pedirJson(OAUTH() + '/token', form({
      client_id: clientId(), client_secret: clientSecret(), refresh_token: t.refresh_token, grant_type: 'refresh_token',
    }), 'Renovar acceso a Google');
    _acc = { token: j.access_token, hasta: Date.now() + (j.expires_in || 3600) * 1000 };
    return _acc.token;
  } catch (e) {
    if (e.codigo === 'invalid_grant') {
      guardarEstado({ driveRevocado: true });
      throw error('Google rechazó la conexión (se revocó el permiso o venció). Volvé a conectar Google Drive en Ajustes.');
    }
    throw e;
  }
}
const auth = token => ({ Authorization: 'Bearer ' + token });
const escQ = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function asegurarCarpeta(token, nombre, padre) {
  const q = `name='${escQ(nombre)}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (padre ? ` and '${padre}' in parents` : '');
  const lista = await pedirJson(`${DRIVE()}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&pageSize=10`, { headers: auth(token) }, 'Buscar carpeta en Drive');
  if (lista?.files?.length) return lista.files[0].id;
  const c = await pedirJson(`${DRIVE()}/drive/v3/files?fields=id`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', ...(padre ? { parents: [padre] } : {}) }),
  }, 'Crear carpeta en Drive');
  return c.id;
}
async function carpetaDelCliente(token) {
  const raiz = await asegurarCarpeta(token, CARPETA_RAIZ, null);
  return asegurarCarpeta(token, nombreCliente(), raiz);
}
async function listarCarpeta(token, carpetaId) {
  const out = []; let page = '';
  do {
    const q = `'${carpetaId}' in parents and trashed=false`;
    const j = await pedirJson(`${DRIVE()}/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,size,createdTime)&pageSize=1000&spaces=drive${page ? '&pageToken=' + encodeURIComponent(page) : ''}`,
      { headers: auth(token) }, 'Listar copias en Drive');
    out.push(...(j.files || [])); page = j.nextPageToken || '';
  } while (page);
  return out;
}
async function subirArchivo(token, carpetaId, rutaLocal, nombre) {
  const buf = await fs.promises.readFile(rutaLocal);
  if (buf.length > MAX_SUBIDA_BYTES) throw error('La copia es demasiado grande para subirla (más de 400 MB)');
  const ini = await fetch(`${DRIVE()}/upload/drive/v3/files?uploadType=resumable&fields=id,name`, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { ...auth(token), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(buf.length) },
    body: JSON.stringify({ name: nombre, parents: [carpetaId] }),
  });
  if (!ini.ok) throw error(`Subir a Drive: no se pudo iniciar la subida (HTTP ${ini.status})`, { status: ini.status });
  const url = ini.headers.get('location');
  if (!url) throw error('Subir a Drive: Google no devolvió la dirección de subida');
  const r = await fetch(url, { method: 'PUT', signal: AbortSignal.timeout(10 * 60 * 1000), headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buf.length) }, body: buf });
  const txt = await r.text();
  if (!r.ok) throw error(`Subir a Drive: falló la subida (HTTP ${r.status}) ${txt.slice(0, 150)}`, { status: r.status });
  let j = {}; try { j = JSON.parse(txt); } catch (_) {}
  return { id: j.id, nombre };
}
async function borrarDeDrive(token, id) {
  const r = await fetch(`${DRIVE()}/drive/v3/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(token), signal: AbortSignal.timeout(30000) });
  if (!r.ok && r.status !== 404) throw error(`Borrar copia vieja en Drive: HTTP ${r.status}`);
}

let _colaDrive = Promise.resolve();   // las subidas se hacen de a una
function subirCopiaADrive(rutaLocal) {
  const trabajo = _colaDrive.then(async () => {
    if (!claveCifrado()) throw error('Falta BACKUP_ENCRYPTION_KEY en el .env: no se sube nada a Drive sin cifrar');
    if (!nombreCliente()) throw error('Falta BACKUP_CLIENT_NAME en el .env (nombre de este cliente, para su carpeta en Drive)');
    const base = path.basename(rutaLocal, '.sqlite');
    const tmp = path.join(os.tmpdir(), `${base}-${process.pid}.axbk`);
    try {
      await cifrarArchivo(rutaLocal, tmp, claveCifrado());
      const subir = async () => {
        const token = await accessToken();
        const carpeta = await carpetaDelCliente(token);
        const sub = await subirArchivo(token, carpeta, tmp, base + '.axbk');
        // Limpieza de copias viejas en Drive (solo las que tienen nombre de copia automática o previa)
        try {
          const remotos = (await listarCarpeta(token, carpeta)).map(f => ({ ...parsearNombre(f.name), id: f.id })).filter(f => f.nombre);
          for (const t of ['auto', 'previa']) for (const v of seleccionarBorrar(remotos, t)) await borrarDeDrive(token, v.id);
        } catch (e) { console.error('[backup] limpieza en Drive:', e.message); }
        return sub;
      };
      try { return await subir(); }
      catch (e) {
        // 401 = el acceso temporal que teníamos guardado ya no sirve (vencido o revocado):
        // se descarta, se pide uno nuevo y se reintenta una vez. Si Google lo rechaza por revocación,
        // accessToken() avisa que hay que volver a conectar.
        if (e.status === 401) { _acc = null; return await subir(); }
        throw e;
      }
    } finally { try { fs.unlinkSync(tmp); } catch (_) {} }
  });
  _colaDrive = trabajo.catch(() => {});
  return trabajo;
}

// ── Estado hacia la pantalla / alertas ───────────────────────────────────
function driveEstado() {
  const t = leerToken(); const e = leerEstado();
  return {
    credencial: !!(clientId() && clientSecret()),
    clave: !!claveCifrado(),
    nombre: !!nombreCliente(),
    conectado: !!(t && t.refresh_token) && !e.driveRevocado,
    revocado: !!e.driveRevocado,
    email: t?.email || null,
    conectadoDesde: t?.conectado || null,
  };
}
const HORAS = 3600 * 1000;
function alerta() {
  const e = leerEstado(); const d = driveEstado();
  const ahora = Date.now();
  if (d.revocado) return { nivel: 'error', titulo: 'Google Drive se desconectó', detalle: 'Las copias ya no se están subiendo. Volvé a conectar Google Drive en Ajustes.' };
  const ref = e.ultimoExitoLocal ? Date.parse(e.ultimoExitoLocal) : (e.creado ? Date.parse(e.creado) : null);
  if (ref && ahora - ref > 26 * HORAS) {
    return { nivel: 'error', titulo: 'No hay copia de seguridad reciente', detalle: e.ultimoError ? `Última falla: ${e.ultimoError.mensaje}` : 'Pasaron más de 26 horas sin una copia automática.' };
  }
  if (d.conectado && e.ultimoAuto && e.ultimoAuto.drive?.estado === 'error') {
    return { nivel: 'aviso', titulo: 'La copia no se pudo subir a Google Drive', detalle: e.ultimoAuto.drive.error || 'Error desconocido' };
  }
  return null;
}
function estado() {
  const e = leerEstado(); const { fecha, hora } = backupSvc.ahoraAR(); const h = HORA();
  let proxima;
  if (e.ultimoAuto?.fechaDia === fecha && e.ultimoAuto.ok) proxima = `mañana ${String(h).padStart(2, '0')}:00`;
  else proxima = hora < h ? `hoy ${String(h).padStart(2, '0')}:00` : 'en breve';
  return {
    hora: h, proxima, drive: driveEstado(), cliente: nombreCliente() || null,
    ultimoAuto: e.ultimoAuto || null, ultimoExitoLocal: e.ultimoExitoLocal || null, ultimoExitoDrive: e.ultimoExitoDrive || null,
    ultimoError: e.ultimoError || null, corriendo: _corriendo, alerta: alerta(),
  };
}

// ── Ejecución ────────────────────────────────────────────────────────────
let _corriendo = false;
async function ejecutarAutomatico({ origen = 'programada' } = {}) {
  if (_corriendo) return { ok: false, ocupado: true, error: 'Ya hay una copia en curso' };
  _corriendo = true;
  const { fecha } = backupSvc.ahoraAR();
  const res = { at: new Date().toISOString(), fechaDia: fecha, origen, ok: false, localOk: false, archivo: null, tamano: null, integridad: null, drive: { estado: 'omitido', archivo: null, error: null } };
  try {
    const info = backupSvc.crearBackup('auto');
    res.archivo = info.filename; res.tamano = info.size;
    const ruta = path.join(backupSvc.BACKUPS_DIR, info.filename);
    const v = verificarIntegridad(ruta);
    res.integridad = v.ok ? 'ok' : v.detalle;
    if (!v.ok) { try { fs.renameSync(ruta, ruta.replace(/\.sqlite$/, '.DANADA')); } catch (_) {} throw error('La copia salió dañada y se descartó: ' + v.detalle); }
    res.localOk = true;
    aplicarRetencionLocal(info.filename);
    if (driveEstado().conectado) {
      try { const s = await subirCopiaADrive(ruta); res.drive = { estado: 'subido', archivo: s.nombre, error: null }; }
      catch (e) { res.drive = { estado: 'error', archivo: null, error: e.message }; }
    }
    res.ok = res.drive.estado !== 'error';
  } catch (e) {
    res.error = e.message;
  } finally {
    _corriendo = false;
  }
  const cambios = { ultimoAuto: res };
  if (res.localOk) cambios.ultimoExitoLocal = res.at;
  if (res.drive.estado === 'subido') cambios.ultimoExitoDrive = res.at;
  if (!res.ok) cambios.ultimoError = { at: res.at, mensaje: res.error || res.drive.error };
  else cambios.ultimoError = null;
  guardarEstado(cambios);
  if (!res.ok) console.error('[backup] falló:', res.error || res.drive.error);
  return res;
}

// Copia "previa" antes de una operación riesgosa (como mucho una cada 10 minutos).
function antesDeCambioGrande(motivo) {
  const e = leerEstado();
  if (e.ultimaPrevia && Date.now() - Date.parse(e.ultimaPrevia.at) < 10 * 60 * 1000) return { omitida: true };
  const info = backupSvc.crearBackup('previa');
  const ruta = path.join(backupSvc.BACKUPS_DIR, info.filename);
  guardarEstado({ ultimaPrevia: { at: new Date().toISOString(), archivo: info.filename, motivo: String(motivo || '').slice(0, 60) } });
  aplicarRetencionLocal(info.filename);
  if (driveEstado().conectado) {
    subirCopiaADrive(ruta).catch(err => { console.error('[backup] previa → Drive:', err.message); guardarEstado({ ultimoErrorPrevia: { at: new Date().toISOString(), mensaje: err.message } }); });
  }
  return { omitida: false, archivo: info.filename };
}

// ── Planificador ─────────────────────────────────────────────────────────
let _timer = null;
async function tick() {
  if (_corriendo) return;
  const e = leerEstado(); const { fecha, hora } = backupSvc.ahoraAR();
  if (hora < HORA()) return;
  const u = e.ultimoAuto;
  if (u && u.fechaDia === fecha) {
    if (u.ok) return;                                       // hoy ya salió bien
    if (Date.now() - Date.parse(u.at) < 60 * 60 * 1000) return;   // falló: se reintenta cada hora
  }
  await ejecutarAutomatico({ origen: 'programada' });
}
function iniciarPlanificador() {
  if (_timer) return;
  if (!leerEstado().creado) guardarEstado({ creado: new Date().toISOString() });
  _timer = setInterval(() => tick().catch(e => console.error('[backup] planificador:', e.message)), 60 * 1000);
  if (_timer.unref) _timer.unref();
  const t = setTimeout(() => tick().catch(() => {}), 30 * 1000);
  if (t.unref) t.unref();
  console.log(`✅  Copias automáticas: todos los días a las ${String(HORA()).padStart(2, '0')}:00 (hora Argentina)`);
}

module.exports = {
  iniciarPlanificador, ejecutarAutomatico, antesDeCambioGrande, estado, alerta,
  conectarIniciar, conectarSondear, desconectar, driveEstado,
  // expuestos para pruebas
  seleccionarConservar, seleccionarBorrar, parsearNombre, verificarIntegridad, tick,
};
