// ============================================================
//  ComercialOS — Offline Queue Manager
//  Maneja ventas sin internet y sincroniza cuando vuelve
// ============================================================
'use strict';

const OFFLINE_DB   = 'comercialos_offline';
const STORE_VENTAS = 'ventas_pendientes';
const DB_VERSION   = 1;

// ── Abrir / inicializar IndexedDB ────────────────────────────
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

// ── Guardar venta pendiente ──────────────────────────────────
async function guardarVentaPendiente(payload) {
  const db    = await abrirDB();
  const venta = {
    ...payload,
    estado:     'pendiente',   // pendiente | sincronizando | error
    creadoEn:   new Date().toISOString(),
    intentos:   0,
    errorMsg:   null,
  };
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_VENTAS, 'readwrite');
    const req = tx.objectStore(STORE_VENTAS).add(venta);
    req.onsuccess = e => resolve(e.target.result);  // devuelve localId
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Obtener todas las ventas pendientes ──────────────────────
async function obtenerPendientes() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_VENTAS, 'readonly');
    const req   = tx.objectStore(STORE_VENTAS).index('estado').getAll('pendiente');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Actualizar estado de una venta ───────────────────────────
async function actualizarVenta(localId, cambios) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_VENTAS, 'readwrite');
    const store = tx.objectStore(STORE_VENTAS);
    const get   = store.get(localId);
    get.onsuccess = e => {
      const venta = { ...e.target.result, ...cambios };
      const put   = store.put(venta);
      put.onsuccess = () => resolve();
      put.onerror   = err => reject(err);
    };
    get.onerror = e => reject(e.target.error);
  });
}

// ── Eliminar venta sincronizada ──────────────────────────────
async function eliminarVenta(localId) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_VENTAS, 'readwrite');
    const req = tx.objectStore(STORE_VENTAS).delete(localId);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Contar pendientes ────────────────────────────────────────
async function contarPendientes() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_VENTAS, 'readonly');
    const req = tx.objectStore(STORE_VENTAS).index('estado').count('pendiente');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Sincronizar todas las pendientes ────────────────────────
async function sincronizarPendientes() {
  if (!navigator.onLine) return { sincronizadas: 0, errores: 0 };

  const pendientes = await obtenerPendientes();
  if (!pendientes.length) return { sincronizadas: 0, errores: 0 };

  let sincronizadas = 0, errores = 0;

  for (const venta of pendientes) {
    await actualizarVenta(venta.localId, { estado: 'sincronizando' });
    try {
      const r = await fetch('/api/sales', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(venta.payload),
      });
      if (r.ok) {
        await eliminarVenta(venta.localId);
        sincronizadas++;
      } else {
        const err = await r.json().catch(() => ({}));
        await actualizarVenta(venta.localId, {
          estado:   'pendiente',
          intentos: (venta.intentos || 0) + 1,
          errorMsg: err.error || `HTTP ${r.status}`,
        });
        errores++;
      }
    } catch (e) {
      await actualizarVenta(venta.localId, {
        estado:   'pendiente',
        intentos: (venta.intentos || 0) + 1,
        errorMsg: e.message,
      });
      errores++;
    }
  }

  return { sincronizadas, errores };
}

// ── UI: badge contador en el header ─────────────────────────
async function actualizarBadgeOffline() {
  const n     = await contarPendientes();
  let badge   = document.getElementById('offlineBadge');

  if (n === 0) {
    if (badge) badge.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'offlineBadge';
    badge.style.cssText = `
      position:fixed; bottom:20px; right:20px; z-index:9999;
      background:#f59e0b; color:#fff; border-radius:12px;
      padding:10px 16px; font-size:13px; font-weight:700;
      box-shadow:0 4px 16px rgba(245,158,11,.4);
      display:flex; align-items:center; gap:8px; cursor:pointer;
      animation:slideUp .3s ease;
    `;
    badge.onclick = () => mostrarModalOffline();
    document.body.appendChild(badge);
  }

  badge.innerHTML = `<i class="bi bi-wifi-off"></i> ${n} venta${n>1?'s':''} pendiente${n>1?'s':''} de sincronizar`;
}

// ── UI: modal con detalle de pendientes ──────────────────────
async function mostrarModalOffline() {
  const pendientes = await obtenerPendientes();
  let modal = document.getElementById('offlineModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'offlineModal';
    modal.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:10000;
      display:flex; align-items:center; justify-content:center;
      backdrop-filter:blur(3px);
    `;
    document.body.appendChild(modal);
  }

  const fmt = n => '$' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  modal.innerHTML = `
    <div style="background:var(--bg-card,#fff);border-radius:16px;width:460px;max-width:95vw;max-height:80vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.25);">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border-color,#e5e7eb);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text-primary,#111);">
            <i class="bi bi-cloud-slash" style="color:#f59e0b;margin-right:6px;"></i>Ventas sin sincronizar
          </div>
          <div style="font-size:12px;color:var(--text-secondary,#6b7280);margin-top:2px;">Se enviarán al servidor cuando haya internet</div>
        </div>
        <button onclick="document.getElementById('offlineModal').remove()"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary,#6b7280);">✕</button>
      </div>
      <div style="padding:16px 24px;display:flex;flex-direction:column;gap:8px;">
        ${pendientes.map(v => `
          <div style="background:var(--bg-body,#f9fafb);border:1px solid var(--border-color,#e5e7eb);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text-primary,#111);">
                ${v.payload.payment_method || 'Sin método'} · ${fmt(v.payload.items?.reduce((a,i)=>a+i.price*i.qty,0)||0)}
              </div>
              <div style="font-size:11px;color:var(--text-secondary,#6b7280);margin-top:2px;">
                ${new Date(v.creadoEn).toLocaleString('es-AR')} · ${v.payload.items?.length||0} producto(s)
                ${v.intentos > 0 ? `· <span style="color:#ef4444;">Intentos: ${v.intentos}</span>` : ''}
                ${v.errorMsg ? `· <span style="color:#ef4444;font-size:10px;">${v.errorMsg}</span>` : ''}
              </div>
            </div>
            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(245,158,11,.1);color:#d97706;">PENDIENTE</span>
          </div>
        `).join('')}
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--border-color,#e5e7eb);">
        <button onclick="intentarSincronizarAhora()"
          style="width:100%;padding:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
          <i class="bi bi-cloud-upload"></i> Sincronizar ahora
        </button>
      </div>
    </div>`;
}

async function intentarSincronizarAhora() {
  const modal = document.getElementById('offlineModal');
  if (modal) modal.remove();

  const result = await sincronizarPendientes();
  await actualizarBadgeOffline();

  if (result.sincronizadas > 0) {
    mostrarToastOffline(`✓ ${result.sincronizadas} venta${result.sincronizadas>1?'s':''} sincronizada${result.sincronizadas>1?'s':''}`, 'success');
  }
  if (result.errores > 0) {
    mostrarToastOffline(`${result.errores} venta${result.errores>1?'s':''} no se pudo sincronizar`, 'error');
  }
}

function mostrarToastOffline(msg, tipo) {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed; bottom:80px; right:20px; z-index:9998;
    background:${tipo==='success'?'#10b981':'#ef4444'}; color:#fff;
    border-radius:10px; padding:10px 16px; font-size:13px; font-weight:600;
    box-shadow:0 4px 16px rgba(0,0,0,.2); animation:slideUp .3s ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Escuchar cambios de conexión ─────────────────────────────
window.addEventListener('online', async () => {
  mostrarToastOffline('✓ Conexión restaurada — sincronizando...', 'success');
  const result = await sincronizarPendientes();
  await actualizarBadgeOffline();
  if (result.sincronizadas > 0) {
    mostrarToastOffline(`✓ ${result.sincronizadas} venta${result.sincronizadas>1?'s':''} sincronizada${result.sincronizadas>1?'s':''}`, 'success');
  }
});

window.addEventListener('offline', () => {
  mostrarToastOffline('⚠ Sin internet — las ventas se guardarán localmente', 'error');
  actualizarBadgeOffline();
});

// ── Sincronizar al cargar la página si hay pendientes ────────
document.addEventListener('DOMContentLoaded', async () => {
  await actualizarBadgeOffline();
  if (navigator.onLine) {
    const result = await sincronizarPendientes();
    if (result.sincronizadas > 0) {
      await actualizarBadgeOffline();
      mostrarToastOffline(`✓ ${result.sincronizadas} venta${result.sincronizadas>1?'s':''} sincronizada${result.sincronizadas>1?'s':''}`, 'success');
    }
  }
});

// ── Exportar para uso en ventas.ejs ─────────────────────────
window.OfflineQueue = {
  guardarVentaPendiente,
  sincronizarPendientes,
  contarPendientes,
  actualizarBadgeOffline,
  mostrarToastOffline,
};
