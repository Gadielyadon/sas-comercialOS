// Pruebas de las copias automáticas y la subida cifrada a Google Drive.
// Usa un "Google" simulado (servidor local): no toca internet ni tu Drive real.
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const http = require('http');

const { derivarClave, descifrarArchivo } = require('../src/services/backup_crypto');

// ── Proceso de pruebas "unitarias": base y carpetas propias (no tocan nada real) ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axbk-'));
const mk = n => { const d = path.join(tmp, n); fs.mkdirSync(d, { recursive: true }); return d; };
const U = { data: mk('u-data'), bk: mk('u-bk'), db: path.join(tmp, 'u.sqlite') };
Object.assign(process.env, { AXSOFT_DATA_DIR: U.data, BACKUPS_DIR: U.bk, DB_PATH: U.db, BACKUP_HORA: '0' });
const auto = require('../src/services/backup_auto.service');
const { iniciarServidor } = require('./helpers');

// ── Google simulado ──
const CLAVE = derivarClave('maestra-de-prueba', 'cliente-test');
const fake = { aprobado: false, revocado: false, files: [], subidas: [], sesiones: {}, n: 0, pedidos: [] };
const nuevoId = () => 'id' + (++fake.n);
function leer(req) { return new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); }); }
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

const googleSrv = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const body = await leer(req);
  fake.pedidos.push(`${req.method} ${url.pathname}`);
  const base = `http://127.0.0.1:${googleSrv.address().port}`;
  if (url.pathname === '/device/code') return json(res, 200, { device_code: 'DEV123', user_code: 'ABCD-EFGH', verification_url: 'https://www.google.com/device', expires_in: 600, interval: 1 });
  if (url.pathname === '/token') {
    const p = new URLSearchParams(body.toString());
    if (p.get('grant_type') === 'refresh_token') {
      if (fake.revocado || p.get('refresh_token') !== 'RT1') return json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      return json(res, 200, { access_token: 'AT-' + (++fake.n), expires_in: 30 });   // vence antes del margen: se renueva en cada uso
    }
    if (!fake.aprobado) return json(res, 428, { error: 'authorization_pending' });
    return json(res, 200, { access_token: 'AT0', refresh_token: 'RT1', expires_in: 3600 });
  }
  if (url.pathname.startsWith('/drive/') || url.pathname.startsWith('/upload/')) {
    // Al revocar el permiso, Google invalida también los accesos temporales que ya estaban entregados
    if (fake.revocado || !/^Bearer AT/.test(req.headers.authorization || '')) return json(res, 401, { error: { message: 'sin autorización' } });
    if (url.pathname === '/drive/v3/about') return json(res, 200, { user: { emailAddress: 'axsoft.backups@example.com' } });
    if (url.pathname === '/drive/v3/files' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const nombre = /name='((?:[^'\\]|\\.)*)'/.exec(q)?.[1];
      const padre = /'([^']+)' in parents/.exec(q)?.[1];
      const carpeta = q.includes('application/vnd.google-apps.folder');
      const out = fake.files.filter(f => (!nombre || f.name === nombre) && (!padre || f.parents.includes(padre)) && (!carpeta || f.mimeType === 'application/vnd.google-apps.folder'));
      return json(res, 200, { files: out.map(f => ({ id: f.id, name: f.name, size: String(f.data ? f.data.length : 0), createdTime: new Date().toISOString() })) });
    }
    if (url.pathname === '/drive/v3/files' && req.method === 'POST') {
      const m = JSON.parse(body.toString()); const f = { id: nuevoId(), name: m.name, mimeType: m.mimeType, parents: m.parents || [], data: null };
      fake.files.push(f); return json(res, 200, { id: f.id });
    }
    if (url.pathname === '/upload/drive/v3/files' && req.method === 'POST') {
      const m = JSON.parse(body.toString()); const sid = nuevoId(); fake.sesiones[sid] = m;
      res.writeHead(200, { Location: `${base}/upload-session/${sid}` }); return res.end();
    }
    if (req.method === 'DELETE') {
      const id = url.pathname.split('/').pop(); const i = fake.files.findIndex(f => f.id === id);
      if (i < 0) return json(res, 404, {}); fake.files.splice(i, 1); res.writeHead(204); return res.end();
    }
  }
  if (url.pathname.startsWith('/upload-session/') && req.method === 'PUT') {
    const m = fake.sesiones[url.pathname.split('/').pop()];
    const f = { id: nuevoId(), name: m.name, mimeType: 'application/octet-stream', parents: m.parents, data: body };
    fake.files.push(f); fake.subidas.push(f); return json(res, 200, { id: f.id, name: f.name });
  }
  json(res, 404, { error: 'no existe ' + url.pathname });
});

const S = { data: mk('s-data'), bk: mk('s-bk') };
let srv, api, googleBase;
const carpetaCliente = () => {
  const raiz = fake.files.find(f => f.name === 'AxSoft Backups' && !f.parents.length);
  return raiz && fake.files.find(f => f.name === 'cliente-test' && f.parents.includes(raiz.id));
};
const enCarpeta = () => { const c = carpetaCliente(); return c ? fake.files.filter(f => f.parents.includes(c.id)) : []; };
const esperar = ms => new Promise(r => setTimeout(r, ms));

test.before(async () => {
  await new Promise(r => googleSrv.listen(0, '127.0.0.1', r));
  googleBase = `http://127.0.0.1:${googleSrv.address().port}`;
  Object.assign(process.env, {
    AXSOFT_DATA_DIR: S.data, BACKUPS_DIR: S.bk, GOOGLE_OAUTH_BASE: googleBase, GOOGLE_DRIVE_BASE: googleBase,
    GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', BACKUP_CLIENT_NAME: 'cliente-test', BACKUP_ENCRYPTION_KEY: CLAVE,
  });
  srv = await iniciarServidor(); api = srv.api;
});
test.after(async () => { await srv.cerrar(); googleSrv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// ───────────────────────── Retención (lógica pura) ─────────────────────────
const dia = (n) => { const d = new Date(Date.UTC(2026, 9, 24) - n * 86400000); return d.toISOString().slice(0, 10); };
const items = tipo => Array.from({ length: 200 }, (_, n) => ({ nombre: `${tipo}_${dia(n)}_030000.axbk`, tipo, fecha: dia(n), hora: '030000' }));

test('retención: conserva 14 diarias + 8 semanales + 6 mensuales y siempre la más nueva', () => {
  const todos = items('auto');
  const borrar = auto.seleccionarBorrar(todos, 'auto');
  const quedan = todos.filter(i => !borrar.includes(i));
  assert.ok(quedan.length <= 14 + 8 + 6, `quedan ${quedan.length}`);
  assert.ok(quedan.length >= 14);
  for (let n = 0; n < 14; n++) assert.ok(quedan.some(i => i.fecha === dia(n)), 'falta el día ' + dia(n));   // últimos 14 días completos
  assert.ok(!quedan.some(i => i.fecha === dia(150)), 'una copia de hace 150 días no debería quedar');
  assert.ok(quedan.some(i => i.nombre === todos[0].nombre), 'la más nueva siempre queda');
});
test('retención: varias copias en un mismo día se reducen a la última de ese día', () => {
  const l = ['010000', '030000', '150000'].map(h => ({ nombre: `auto_${dia(0)}_${h}.axbk`, tipo: 'auto', fecha: dia(0), hora: h }));
  const borrar = auto.seleccionarBorrar(l, 'auto').map(i => i.hora);
  assert.deepEqual(borrar.sort(), ['010000', '030000']);
});
test('retención: las copias "previas" quedan en las últimas 10 y nunca se tocan las manuales ni otras', () => {
  const previas = items('previa').slice(0, 25);
  assert.equal(auto.seleccionarBorrar(previas, 'previa').length, 15);
  assert.equal(auto.parsearNombre('manual_2026-10-01_101010.sqlite'), null);
  assert.equal(auto.parsearNombre('database.sqlite'), null);
  assert.equal(auto.seleccionarBorrar([{ nombre: 'x', tipo: 'manual', fecha: dia(0), hora: '0' }], 'auto').length, 0);
});

// ───────────────────────── Planificador ─────────────────────────
test('el planificador hace UNA copia por día y no repite si ya salió bien', async () => {
  await auto.tick();
  const e1 = auto.estado().ultimoAuto;
  assert.ok(e1 && e1.ok && e1.localOk, JSON.stringify(e1));
  assert.equal(e1.integridad, 'ok');
  assert.ok(fs.readdirSync(U.bk).some(f => /^auto_\d{4}-\d{2}-\d{2}_\d{6}\.sqlite$/.test(f)));
  await auto.tick();
  assert.equal(auto.estado().ultimoAuto.at, e1.at, 'no debe correr dos veces el mismo día');
});

// ───────────────────────── Servidor real + Google simulado ─────────────────────────
test('sin Drive conectado: la copia automática se hace igual (solo en el servidor)', async () => {
  const est = await (await api.get('/api/backups/estado')).json();
  assert.equal(est.drive.conectado, false);
  assert.equal(est.drive.credencial, true);
  assert.equal(est.drive.clave, true);
  const r = await api.post('/api/backups/auto/ejecutar', {});
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.drive.estado, 'omitido');
  assert.equal(r.data.integridad, 'ok');
  assert.ok(fs.existsSync(path.join(S.bk, r.data.archivo)));
});

test('conectar Google Drive: código → pendiente → aprobado → conectado (token guardado con permisos 600)', async () => {
  const c = await api.post('/api/backups/drive/conectar', {});
  assert.equal(c.status, 200);
  assert.equal(c.data.user_code, 'ABCD-EFGH');
  assert.match(c.data.verification_url, /google\.com\/device/);
  let s = await (await api.get('/api/backups/drive/sondear')).json();
  assert.equal(s.estado, 'pendiente');
  fake.aprobado = true;
  await esperar(1100);
  s = await (await api.get('/api/backups/drive/sondear')).json();
  assert.equal(s.estado, 'conectado', JSON.stringify(s));
  assert.equal(s.email, 'axsoft.backups@example.com');
  const tokenFile = path.join(S.data, 'backup-drive.json');
  assert.ok(fs.existsSync(tokenFile));
  if (process.platform !== 'win32') assert.equal(fs.statSync(tokenFile).mode & 0o777, 0o600);
  const est = await (await api.get('/api/backups/estado')).json();
  assert.equal(est.drive.conectado, true);
});

test('la copia se sube CIFRADA a AxSoft Backups / <cliente> y se puede restaurar con la clave', async () => {
  const r = await api.post('/api/backups/auto/ejecutar', {});
  assert.equal(r.data.ok, true, JSON.stringify(r.data));
  assert.equal(r.data.drive.estado, 'subido');
  const sub = fake.subidas.at(-1);
  assert.match(sub.name, /^auto_\d{4}-\d{2}-\d{2}_\d{6}\.axbk$/);
  assert.ok(carpetaCliente(), 'debe existir la carpeta del cliente');
  assert.ok(!sub.data.includes(Buffer.from('SQLite format')), 'lo subido NO debe contener la base en texto plano');
  assert.ok(!sub.data.includes(Buffer.from('admin')), 'ni nombres de usuario legibles');

  const cif = path.join(tmp, 'bajada.axbk'), plano = path.join(tmp, 'restaurada.sqlite');
  fs.writeFileSync(cif, sub.data);
  await descifrarArchivo(cif, plano, CLAVE);
  assert.equal(fs.readFileSync(plano).subarray(0, 15).toString('latin1'), 'SQLite format 3');
  assert.equal(auto.verificarIntegridad(plano).ok, true);
  await assert.rejects(() => descifrarArchivo(cif, path.join(tmp, 'x.sqlite'), derivarClave('maestra-de-prueba', 'OTRO-cliente')), /clave no es correcta/);
});

test('limpieza en Drive: borra las copias viejas, respeta las recientes y NO toca archivos ajenos', async () => {
  const carpeta = carpetaCliente();
  for (let n = 30; n < 200; n++) fake.files.push({ id: nuevoId(), name: `auto_${dia(n)}_030000.axbk`, parents: [carpeta.id], data: Buffer.from('x') });
  fake.files.push({ id: nuevoId(), name: 'manual_importante.axbk', parents: [carpeta.id], data: Buffer.from('x') });
  fake.files.push({ id: nuevoId(), name: 'notas.txt', parents: [carpeta.id], data: Buffer.from('x') });
  const antes = enCarpeta().length;
  const r = await api.post('/api/backups/auto/ejecutar', {});
  assert.equal(r.data.drive.estado, 'subido');
  const nombres = enCarpeta().map(f => f.name);
  assert.ok(nombres.includes('manual_importante.axbk') && nombres.includes('notas.txt'), 'no se toca lo que no es una copia automática');
  assert.ok(!nombres.includes(`auto_${dia(190)}_030000.axbk`), 'una copia de hace 190 días se borra');
  assert.ok(enCarpeta().length < antes, 'se borró historia vieja');
  assert.ok(enCarpeta().filter(f => /^auto_/.test(f.name)).length <= 14 + 8 + 6 + 2);
});

test('copia "previa" antes de una operación riesgosa: se hace, se sube, y no se repite en 10 minutos', async () => {
  const n0 = fake.subidas.length;
  const r1 = await api.post('/api/backups/pre-cambio', { motivo: 'iva-masivo' });
  assert.equal(r1.data.ok, true);
  assert.equal(r1.data.omitida, false);
  assert.ok(fs.readdirSync(S.bk).some(f => f.startsWith('previa_')));
  for (let i = 0; i < 30 && fake.subidas.length === n0; i++) await esperar(100);
  assert.match(fake.subidas.at(-1).name, /^previa_/);
  const r2 = await api.post('/api/backups/pre-cambio', { motivo: 'iva-masivo' });
  assert.equal(r2.data.omitida, true);
});

test('un usuario que NO es admin: puede disparar la copia previa pero no ver ni manejar las copias', async () => {
  const u = await api.post('/api/users', { username: 'luis', password: 'clave-luis-1', nombre: 'Luis', role: 'empleado' });
  assert.equal(u.status, 201);
  const lr = await fetch(api.base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=luis&password=clave-luis-1' });
  const cookie = lr.headers.get('set-cookie').split(';')[0];
  const conCookie = (url, m = 'GET') => fetch(api.base + url, { method: m, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: m === 'POST' ? '{}' : undefined, redirect: 'manual' });
  assert.equal((await conCookie('/api/backups/pre-cambio', 'POST')).status, 200);
  for (const [url, m] of [['/api/backups/estado', 'GET'], ['/api/backups/auto/ejecutar', 'POST'], ['/api/backups/drive/conectar', 'POST'], ['/api/backups/drive/desconectar', 'POST'], ['/api/backups', 'GET']]) {
    const r = await conCookie(url, m);
    assert.ok(r.status === 403 || r.status === 302 || r.status === 401, `${m} ${url} → ${r.status}`);
  }
});

test('si Google revoca el permiso: la copia local sigue, se avisa a los admin (no a los demás) y se puede reconectar', async () => {
  fake.revocado = true;
  const r = await api.post('/api/backups/auto/ejecutar', {});
  assert.equal(r.data.localOk, true, 'la copia local no depende de Drive');
  assert.equal(r.data.drive.estado, 'error');
  assert.match(r.data.drive.error, /Volvé a conectar/);
  const est = await (await api.get('/api/backups/estado')).json();
  assert.equal(est.drive.revocado, true);
  assert.equal(est.drive.conectado, false);
  assert.equal(est.alerta.nivel, 'error');

  const admin = await (await api.get('/api/notificaciones')).json();
  assert.ok(admin.notifs.some(n => n.tipo === 'backup'), 'el admin ve el aviso en la campana');
  const lr = await fetch(api.base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=luis&password=clave-luis-1' });
  const cookie = lr.headers.get('set-cookie').split(';')[0];
  const luis = await (await fetch(api.base + '/api/notificaciones', { headers: { Cookie: cookie } })).json();
  assert.ok(!luis.notifs.some(n => n.tipo === 'backup'), 'un empleado NO ve avisos de copias');

  // Reconectar con un permiso nuevo
  fake.revocado = false;
  const c = await api.post('/api/backups/drive/conectar', {}); assert.equal(c.status, 200);
  await esperar(1100);
  const s = await (await api.get('/api/backups/drive/sondear')).json();
  assert.equal(s.estado, 'conectado');
  assert.equal((await api.post('/api/backups/auto/ejecutar', {})).data.drive.estado, 'subido');
});

test('desconectar Drive borra la conexión y las copias vuelven a ser solo locales', async () => {
  assert.equal((await api.post('/api/backups/drive/desconectar', {})).status, 200);
  assert.equal(fs.existsSync(path.join(S.data, 'backup-drive.json')), false);
  const est = await (await api.get('/api/backups/estado')).json();
  assert.equal(est.drive.conectado, false);
  const n0 = fake.subidas.length;
  const r = await api.post('/api/backups/auto/ejecutar', {});
  assert.equal(r.data.ok, true);
  assert.equal(fake.subidas.length, n0, 'no se sube nada si no está conectado');
});

test('SIN clave de cifrado configurada: NUNCA se sube nada a Drive', async () => {
  // Segundo servidor igual al anterior pero sin BACKUP_ENCRYPTION_KEY y ya "conectado"
  const dir2 = mk('s2-data'); const bk2 = mk('s2-bk');
  fs.writeFileSync(path.join(dir2, 'backup-drive.json'), JSON.stringify({ refresh_token: 'RT1', email: 'x@y.z', conectado: new Date().toISOString() }));
  const salvar = { ...process.env };
  Object.assign(process.env, { AXSOFT_DATA_DIR: dir2, BACKUPS_DIR: bk2 }); delete process.env.BACKUP_ENCRYPTION_KEY;
  const srv2 = await iniciarServidor();
  try {
    const n0 = fake.subidas.length, antes = fake.files.length;
    const r = await srv2.api.post('/api/backups/auto/ejecutar', {});
    assert.equal(r.data.localOk, true);
    assert.equal(r.data.drive.estado, 'error');
    assert.match(r.data.drive.error, /BACKUP_ENCRYPTION_KEY/);
    assert.equal(fake.subidas.length, n0, 'no se subió nada');
    assert.equal(fake.files.length, antes);
  } finally { await srv2.cerrar(); Object.assign(process.env, salvar); }
});

test('la copia manual de siempre sigue funcionando y las copias aparecen en la lista con su nombre', async () => {
  const m = await api.post('/api/backups', {});
  assert.equal(m.status, 200);
  assert.match(m.data.filename, /^manual_/);
  const lista = await (await api.get('/api/backups')).json();
  assert.ok(lista.some(b => b.filename.startsWith('manual_')));
  assert.ok(lista.some(b => b.filename.startsWith('auto_')));
});

test('las herramientas de restauración y de clave existen y no dependen del sistema', () => {
  const r = path.join(__dirname, '..', 'tools');
  const rest = fs.readFileSync(path.join(r, 'restaurar-backup.js'), 'utf8');
  assert.match(rest, /backup_crypto/);
  assert.doesNotMatch(rest, /services\/(backup_auto|backup\.service)|require\('\.\.\/src\/db/);
  assert.match(fs.readFileSync(path.join(r, 'clave-backup.js'), 'utf8'), /derivarClave/);
});

test('dos copias pedidas en el mismo segundo (doble clic) NO fallan: cada una queda con su nombre', async () => {
  const [a, b, c] = await Promise.all([api.post('/api/backups', {}), api.post('/api/backups', {}), api.post('/api/backups', {})]);
  for (const r of [a, b, c]) assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(new Set([a, b, c].map(r => r.data.filename)).size, 3, 'los tres nombres son distintos');
  for (const r of [a, b, c]) assert.ok(fs.existsSync(path.join(S.bk, r.data.filename)));
});

test('los nombres de copia siempre son posteriores a los anteriores (la limpieza nunca borra la nueva)', async () => {
  // Varias copias seguidas, algunas "empujadas" al segundo siguiente: el orden por nombre debe ser el de creación
  const nombres = [];
  for (let i = 0; i < 6; i++) nombres.push((await api.post('/api/backups', {})).data.filename);
  assert.deepEqual([...nombres].sort(), nombres, 'orden creciente por nombre');
  // Una copia automática justo después sigue existiendo aunque haya copias "adelantadas" en la carpeta
  const r = await api.post('/api/backups/auto/ejecutar', {});
  assert.equal(r.data.localOk, true);
  assert.ok(fs.existsSync(path.join(S.bk, r.data.archivo)), 'la copia recién creada NO se borra');
});
