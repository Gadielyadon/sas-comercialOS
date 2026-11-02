// ============================================================
//  AxSoft — Cola de ventas sin internet
//  Guarda las ventas en el equipo cuando no hay conexión y las envía
//  solas al servidor cuando vuelve.
//
//  Garantías:
//   · Cada venta lleva un ID único (client_uuid): si el envío se corta a
//     mitad de camino y se reintenta, el servidor NO la duplica.
//   · Conserva la fecha y hora reales de la venta.
//   · Si la sesión venció, las ventas se conservan y se pide iniciar sesión.
//   · Si el servidor rechaza una venta, queda visible en rojo (no se pierde).
// ============================================================
(function () {
'use strict';

const OFFLINE_DB   = 'comercialos_offline';
const STORE_VENTAS = 'ventas_pendientes';
const DB_VERSION   = 1;
const LS_CONTADOR  = 'ax_pend'; // cantidad sin sincronizar (lo lee el cierre de caja)

let _sincronizando = false;
let _sesionVencida = false;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function nuevoUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// ── IndexedDB ────────────────────────────────────────────────
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_VENTAS)) {
        const store = db.createObjectStore(STORE_VENTAS, { keyPath: 'localId', autoIncrement: true });
        store.createIndex('estado', 'estado', { unique: false });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function todas() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_VENTAS, 'readonly').objectStore(STORE_VENTAS).getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

async function obtenerPorEstado(estado) {
  return (await todas()).filter(v => v.estado === estado);
}
const obtenerPendientes = () => obtenerPorEstado('pendiente');
const obtenerConError   = () => obtenerPorEstado('error');

async function _agregar(registro) {
  const db = await abrirDB();
  const localId = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE_VENTAS, 'readwrite').objectStore(STORE_VENTAS).add(registro);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
  await actualizarContador();
  return localId;
}

async function guardarVentaPendiente(datos) {
  const payload = { ...(datos.payload || datos) };
  payload.client_uuid = payload.client_uuid || nuevoUuid();
  payload.fecha_venta = payload.fecha_venta || new Date().toISOString();
  payload.offline     = 1;
  return _agregar({
    tipo:     'venta',
    payload,
    estado:   'pendiente',        // pendiente | sincronizando | error
    creadoEn: payload.fecha_venta,
    intentos: 0,
    errorMsg: null,
  });
}

// Ajuste de stock hecho sin internet (suma o resta). Se aplica como DIFERENCIA al volver la conexión,
// así no pisa lo que se vendió mientras tanto.
async function guardarAjusteStock({ sku, delta, client_uuid, fecha_ajuste }) {
  const payload = {
    sku: String(sku),
    delta: Number(delta),
    client_uuid: client_uuid || nuevoUuid(),
    fecha_ajuste: fecha_ajuste || new Date().toISOString(),
    offline: 1,
  };
  return _agregar({
    tipo:     'stock',
    payload,
    estado:   'pendiente',
    creadoEn: payload.fecha_ajuste,
    intentos: 0,
    errorMsg: null,
  });
}

async function actualizarVenta(localId, cambios) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_VENTAS, 'readwrite').objectStore(STORE_VENTAS);
    const get = store.get(localId);
    get.onsuccess = e => {
      if (!e.target.result) return resolve();
      const put = store.put({ ...e.target.result, ...cambios });
      put.onsuccess = () => resolve();
      put.onerror   = err => reject(err.target.error);
    };
    get.onerror = e => reject(e.target.error);
  });
}

async function eliminarVenta(localId) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_VENTAS, 'readwrite').objectStore(STORE_VENTAS).delete(localId);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

async function contarPendientes() { return (await obtenerPendientes()).length; }

async function actualizarContador() {
  try {
    const n = (await todas()).filter(v => v.tipo !== 'stock').length;   // solo ventas frenan el cierre de caja
    localStorage.setItem(LS_CONTADOR, String(n));
    return n;
  } catch (_) { return 0; }
}

// ── Stock local ──────────────────────────────────────────────
// Descuenta de la lista de productos lo que ya se vendió sin internet y todavía no
// llegó al servidor, así el sistema no ofrece stock que ya se vendió.
async function aplicarStockPendiente(productos) {
  try {
    const ventas = await todas();
    const neto = {};   // cambio de stock pendiente por producto
    for (const v of ventas) {
      if (v.tipo === 'stock') {
        neto[v.payload.sku] = (neto[v.payload.sku] || 0) + (Number(v.payload.delta) || 0);
      } else {
        for (const it of (v.payload?.items || [])) neto[it.sku] = (neto[it.sku] || 0) - (Number(it.qty) || 0);
      }
    }
    for (const p of productos || []) {
      if (neto[p.sku] && p.stock != null && !isNaN(Number(p.stock))) p.stock = Number(p.stock) + neto[p.sku];
    }
  } catch (_) {}
  return productos;
}

// ── Envío de una venta ───────────────────────────────────────
async function enviarVenta(payload, tipo) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  const esStock = tipo === 'stock';
  let r;
  try {
    r = await fetch(esStock ? `/api/products/${encodeURIComponent(payload.sku)}/stock` : '/api/sales', {
      method: esStock ? 'PATCH' : 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(esStock
        ? { delta: payload.delta, client_uuid: payload.client_uuid, fecha_ajuste: payload.fecha_ajuste, offline: 1 }
        : payload),
      signal: ctl.signal,
    });
  } catch (e) {
    return { tipo: 'red', msg: e.message };
  } finally { clearTimeout(t); }

  // Sesión vencida: el servidor manda al login (redirección o HTML) o responde 401.
  const ct = r.headers.get('content-type') || '';
  if (r.redirected || r.status === 401 || (r.ok && !ct.includes('json'))) return { tipo: 'sesion' };

  const data = await r.json().catch(() => ({}));
  if (r.ok && data && data.ok !== false) return { tipo: 'ok', data };
  if (r.status === 408 || r.status === 429 || r.status >= 500) return { tipo: 'temporal', msg: data.error || `HTTP ${r.status}` };
  return { tipo: 'rechazada', msg: data.error || `HTTP ${r.status}` }; // 400/403/404: reintentar no lo arregla
}

// ── Sincronización ───────────────────────────────────────────
async function _sincronizar() {
  // Si la pestaña se cerró en medio de un envío, esas ventas vuelven a la fila
  for (const v of await obtenerPorEstado('sincronizando')) await actualizarVenta(v.localId, { estado: 'pendiente' });

  const pendientes = await obtenerPendientes();
  let sincronizadas = 0, errores = 0, detenida = null;

  for (const venta of pendientes) {
    // Ventas guardadas con la versión anterior no tenían ID único: se les asigna ahora
    const payload = { ...venta.payload };
    if (!payload.client_uuid) payload.client_uuid = nuevoUuid();
    if (venta.tipo === 'stock') {
      if (!payload.fecha_ajuste) payload.fecha_ajuste = venta.creadoEn || new Date().toISOString();
    } else if (!payload.fecha_venta) payload.fecha_venta = venta.creadoEn || new Date().toISOString();
    payload.offline = 1;
    await actualizarVenta(venta.localId, { estado: 'sincronizando', payload });

    const res = await enviarVenta(payload, venta.tipo);

    if (res.tipo === 'ok') {
      await eliminarVenta(venta.localId);
      sincronizadas++;
      _sesionVencida = false;
    } else if (res.tipo === 'rechazada') {
      await actualizarVenta(venta.localId, { estado: 'error', intentos: (venta.intentos || 0) + 1, errorMsg: res.msg });
      errores++;
    } else {
      // red caída, sesión vencida o servidor con problemas: se frena y se conserva todo
      await actualizarVenta(venta.localId, {
        estado: 'pendiente',
        intentos: res.tipo === 'sesion' ? venta.intentos || 0 : (venta.intentos || 0) + 1,
        errorMsg: res.tipo === 'sesion' ? 'Sesión vencida' : res.msg,
      });
      detenida = res.tipo;
      break;
    }
  }

  if (detenida === 'sesion') _sesionVencida = true;
  return { sincronizadas, errores, detenida };
}

async function sincronizarPendientes() {
  if (_sincronizando) return { sincronizadas: 0, errores: 0, detenida: 'ocupado' };
  _sincronizando = true;
  try {
    const correr = () => _sincronizar();
    // Si hay varias pestañas abiertas, solo una sincroniza a la vez
    const r = navigator.locks
      ? await navigator.locks.request('axsoft-sync', { ifAvailable: true }, l => (l ? correr() : null))
      : await correr();
    return r || { sincronizadas: 0, errores: 0, detenida: 'ocupado' };
  } catch (e) {
    return { sincronizadas: 0, errores: 0, detenida: 'red' };
  } finally {
    _sincronizando = false;
  }
}

async function _despuesDeSincronizar(r, avisar) {
  await actualizarBadgeOffline();
  if (r.sincronizadas > 0) {
    mostrarToastOffline(`✓ ${r.sincronizadas} operación${r.sincronizadas > 1 ? 'es' : ''} sincronizada${r.sincronizadas > 1 ? 's' : ''}`, 'success');
    window.dispatchEvent(new CustomEvent('axsoft:sync', { detail: r })); // las pantallas refrescan su stock
  }
  if (r.errores > 0) mostrarToastOffline(`${r.errores} operación${r.errores > 1 ? 'es' : ''} rechazada${r.errores > 1 ? 's' : ''} por el servidor — tocá el aviso rojo`, 'error');
  if (avisar && r.detenida === 'red')  mostrarToastOffline('Todavía no hay conexión con el servidor', 'error');
}

// ── UI ───────────────────────────────────────────────────────
async function actualizarBadgeOffline() {
  const pend = await obtenerPendientes();
  const sinc = await obtenerPorEstado('sincronizando');
  const errs = await obtenerConError();
  await actualizarContador();

  // Aviso fijo de sesión vencida (las ventas están a salvo)
  let banner = document.getElementById('axSesionBanner');
  if (_sesionVencida && (pend.length + sinc.length) > 0) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'axSesionBanner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10001;background:#dc2626;color:#fff;padding:10px 16px;font-size:13px;font-weight:700;text-align:center;';
      document.body.appendChild(banner);
    }
    banner.innerHTML = `Tu sesión venció. ${pend.length + sinc.length} operación(es) guardadas en este equipo esperan para enviarse. <a href="/login" style="color:#fff;text-decoration:underline;margin-left:8px;">Iniciar sesión</a>`;
  } else if (banner) banner.remove();

  let badge = document.getElementById('offlineBadge');
  const hayCola = pend.length + sinc.length + errs.length > 0;
  const sinInternet = !navigator.onLine;
  if (!hayCola && !sinInternet) { if (badge) badge.remove(); return; }

  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'offlineBadge';
    badge.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;color:#fff;border-radius:12px;padding:10px 16px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;cursor:pointer;animation:slideUp .3s ease;';
    badge.onclick = () => mostrarModalOffline();
    document.body.appendChild(badge);
  }

  const n = pend.length + sinc.length;
  if (errs.length) {
    badge.style.background = '#dc2626'; badge.style.boxShadow = '0 4px 16px rgba(220,38,38,.4)';
    badge.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${errs.length} rechazada${errs.length > 1 ? 's' : ''} — revisar${n ? ` · ${n} pendiente${n > 1 ? 's' : ''}` : ''}`;
  } else if (n) {
    badge.style.background = '#f59e0b'; badge.style.boxShadow = '0 4px 16px rgba(245,158,11,.4)';
    badge.innerHTML = `<i class="bi bi-wifi-off"></i> ${n} pendiente${n > 1 ? 's' : ''} de sincronizar`;
  } else {
    badge.style.background = '#475569'; badge.style.boxShadow = '0 4px 16px rgba(71,85,105,.4)';
    badge.innerHTML = `<i class="bi bi-wifi-off"></i> Sin internet — podés seguir vendiendo`;
  }
}

async function mostrarModalOffline() {
  const lista = [...await obtenerConError(), ...await obtenerPendientes(), ...await obtenerPorEstado('sincronizando')];
  let modal = document.getElementById('offlineModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'offlineModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    document.body.appendChild(modal);
  }
  const fmt = n => '$' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const total = v => (v.payload.items || []).reduce((a, i) => a + Number(i.price) * Number(i.qty), 0);
  const esStock = v => v.tipo === 'stock';
  const signo = n => (Number(n) > 0 ? '+' : '') + Number(n);

  modal.innerHTML = `
    <div style="background:var(--bg-card,#fff);color:var(--text-primary,#111);border-radius:16px;width:500px;max-width:95vw;max-height:80vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.25);">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border-color,#e5e7eb);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:16px;font-weight:800;"><i class="bi bi-cloud-slash" style="color:#f59e0b;margin-right:6px;"></i>Pendientes de sincronizar</div>
          <div style="font-size:12px;color:var(--text-secondary,#6b7280);margin-top:2px;">Están guardadas en este equipo. Se envían solas cuando hay internet.</div>
        </div>
        <button onclick="document.getElementById('offlineModal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary,#6b7280);">✕</button>
      </div>
      <div style="padding:16px 24px;display:flex;flex-direction:column;gap:8px;">
        ${lista.length ? lista.map(v => `
          <div style="background:var(--bg-body,#f9fafb);border:1px solid ${v.estado === 'error' ? '#fca5a5' : 'var(--border-color,#e5e7eb)'};border-radius:10px;padding:12px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <div style="font-size:13px;font-weight:600;">${esStock(v) ? `Ajuste de stock · ${esc(v.payload.sku)} · ${esc(signo(v.payload.delta))}` : `${esc(v.payload.payment_method || 'Sin método')} · ${fmt(total(v))}`}</div>
              <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;${v.estado === 'error' ? 'background:rgba(220,38,38,.1);color:#dc2626;' : 'background:rgba(245,158,11,.1);color:#d97706;'}">${v.estado === 'error' ? 'RECHAZADA' : 'PENDIENTE'}</span>
            </div>
            <div style="font-size:11px;color:var(--text-secondary,#6b7280);margin-top:3px;">
              ${new Date(v.creadoEn).toLocaleString('es-AR')}${esStock(v) ? '' : ` · ${(v.payload.items || []).length} producto(s)`}
              ${v.intentos > 0 ? `· intentos: ${v.intentos}` : ''}
            </div>
            ${esStock(v) ? '' : `<div style="font-size:11px;color:var(--text-secondary,#6b7280);margin-top:2px;">${(v.payload.items || []).map(i => `${esc(i.qty)}× ${esc(i.name || i.sku)}`).join(', ')}</div>`}
            ${v.errorMsg ? `<div style="font-size:12px;color:#dc2626;margin-top:6px;font-weight:600;">${esc(v.errorMsg)}</div>` : ''}
            ${v.estado === 'error' ? `
              <div style="display:flex;gap:8px;margin-top:8px;">
                <button onclick="OfflineQueue.reintentar(${v.localId})" style="flex:1;padding:8px;border:0;border-radius:8px;background:#10b981;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">Reintentar</button>
                <button onclick="OfflineQueue.descartar(${v.localId})" style="flex:1;padding:8px;border:0;border-radius:8px;background:#e5e7eb;color:#111;font-weight:700;font-size:12px;cursor:pointer;">Descartar</button>
              </div>` : ''}
          </div>`).join('') : '<div style="text-align:center;color:var(--text-secondary,#6b7280);padding:16px;">No hay nada pendiente</div>'}
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--border-color,#e5e7eb);">
        <button onclick="OfflineQueue.sincronizarAhora()" style="width:100%;padding:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
          <i class="bi bi-cloud-upload"></i> Sincronizar ahora
        </button>
      </div>
    </div>`;
}

async function intentarSincronizarAhora() {
  document.getElementById('offlineModal')?.remove();
  const r = await sincronizarPendientes();
  await _despuesDeSincronizar(r, true);
}

async function reintentar(localId) {
  await actualizarVenta(localId, { estado: 'pendiente', errorMsg: null });
  document.getElementById('offlineModal')?.remove();
  await intentarSincronizarAhora();
}

async function descartar(localId) {
  if (!confirm('¿Descartar esto? No se va a registrar en el sistema y no se puede deshacer.')) return;
  await eliminarVenta(localId);
  await actualizarBadgeOffline();
  mostrarModalOffline();
}

function mostrarToastOffline(msg, tipo) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:20px;z-index:9998;background:${tipo === 'success' ? '#10b981' : '#ef4444'};color:#fff;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:slideUp .3s ease;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// El cierre de caja se calcula con las ventas ya registradas: no se puede cerrar con ventas sin enviar.
window.axConfirmarCierre = function () {
  const n = parseInt(localStorage.getItem(LS_CONTADOR) || '0', 10) || 0;
  if (n > 0) {
    alert(`No se puede cerrar la caja: hay ${n} venta(s) sin sincronizar en este equipo.\n\nConectate a internet, esperá a que se envíen y volvé a intentar.`);
    return false;
  }
  return confirm('¿Seguro que querés cerrar la caja?');
};

// ── Eventos ──────────────────────────────────────────────────
window.addEventListener('online', async () => {
  mostrarToastOffline('✓ Conexión restaurada — sincronizando...', 'success');
  await _despuesDeSincronizar(await sincronizarPendientes(), false);
});

window.addEventListener('offline', () => {
  mostrarToastOffline('⚠ Sin internet — podés seguir vendiendo, las ventas se guardan en este equipo', 'error');
  actualizarBadgeOffline();
});

document.addEventListener('DOMContentLoaded', async () => {
  await actualizarBadgeOffline();
  if (navigator.onLine) await _despuesDeSincronizar(await sincronizarPendientes(), false);
});

// "Hay conexión" según el navegador no siempre es cierto (router sin internet, señal débil).
// Mientras haya ventas pendientes se reintenta cada 30 segundos.
setInterval(async () => {
  if (!navigator.onLine || _sincronizando) return;
  try {
    if ((await obtenerPendientes()).length) await _despuesDeSincronizar(await sincronizarPendientes(), false);
  } catch (_) {}
}, 30000);

window.OfflineQueue = {
  nuevoUuid,
  guardarVentaPendiente,
  guardarAjusteStock,
  sincronizarPendientes,
  contarPendientes,
  actualizarBadgeOffline,
  mostrarToastOffline,
  aplicarStockPendiente,
  reintentar,
  descartar,
  sincronizarAhora: intentarSincronizarAhora,
  abrirDetalle: mostrarModalOffline,
};

})();
