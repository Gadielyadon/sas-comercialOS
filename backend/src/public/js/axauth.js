// ============================================================
//  AxSoft — Inicio de sesión sin internet
//
//  Cómo funciona:
//   · Al iniciar sesión CON internet, este equipo guarda una verificación de la contraseña
//     (PBKDF2-SHA256 con sal aleatoria — la contraseña en sí NUNCA se guarda).
//   · Sin internet, esa verificación permite volver a entrar, solo a usuarios que ya
//     iniciaron sesión con internet en este equipo.
//   · La sesión sin internet vale hasta la medianoche (igual que la normal) y vence a los
//     30 días sin conectarse (hay que iniciar sesión con internet para renovar).
//   · 5 contraseñas incorrectas seguidas bloquean el ingreso 1 minuto.
// ============================================================
(function () {
  'use strict';
  const DB = 'axsoft_auth', VER = 1;
  const ITER = 150000;
  const VENCE_MS = 30 * 24 * 3600 * 1000;

  function abrir() {
    return new Promise((res, rej) => {
      const q = indexedDB.open(DB, VER);
      q.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('usuarios')) db.createObjectStore('usuarios', { keyPath: 'username' });
        if (!db.objectStoreNames.contains('sesion'))   db.createObjectStore('sesion',   { keyPath: 'k' });
      };
      q.onsuccess = e => res(e.target.result);
      q.onerror   = e => rej(e.target.error);
    });
  }
  async function op(store, modo, fn) {
    const db = await abrir();
    return new Promise((res, rej) => {
      const r = fn(db.transaction(store, modo).objectStore(store));
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }
  const get = (s, k) => op(s, 'readonly',  st => st.get(k));
  const put = (s, v) => op(s, 'readwrite', st => st.put(v));
  const del = (s, k) => op(s, 'readwrite', st => st.delete(k));

  const b64   = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function derivar(password, salt, iter) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, k, 256));
  }
  function iguales(a, b) {           // comparación sin atajos (tiempo constante)
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }
  const medianoche = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); };
  const normalizar = u => String(u || '').trim().toLowerCase();

  // ── Pantalla de login normal (con internet): prepara la verificación antes de enviar el formulario ──
  async function prepararLogin(username, password) {
    if (!window.crypto || !crypto.subtle || !username || !password) return;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivar(password, salt, ITER);
    sessionStorage.setItem('ax_login_pend', JSON.stringify({
      username: normalizar(username), salt: b64(salt), iter: ITER, hash, ts: Date.now(),
    }));
  }

  // ── Ya con la sesión iniciada: se guarda la verificación solo si el login recién salió bien ──
  async function finalizarLogin() {
    try {
      const raw = sessionStorage.getItem('ax_login_pend');
      if (!raw) return;
      sessionStorage.removeItem('ax_login_pend');
      const p = JSON.parse(raw);
      if (Date.now() - p.ts > 3 * 60 * 1000) return;
      let ref = ''; try { ref = new URL(document.referrer).pathname; } catch (_) {}
      if (ref !== '/login') return;                         // solo si venimos directo de la pantalla de login
      const role = document.body.getAttribute('data-user-role');
      if (!role) return;
      const r = await fetch('/api/vendedor-activo', { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const u = await r.json();
      if (!u || u.id == null) return;
      await put('usuarios', {
        username: p.username, id: u.id, nombre: u.nombre, role,
        salt: p.salt, iter: p.iter, hash: p.hash, actualizado: Date.now(),
      });
    } catch (_) {}
  }

  // ── Bloqueo por intentos fallidos ──
  function segundosBloqueado() {
    try {
      const f = JSON.parse(localStorage.getItem('ax_login_fail') || 'null');
      if (f && f.hasta > Date.now()) return Math.ceil((f.hasta - Date.now()) / 1000);
    } catch (_) {}
    return 0;
  }
  function registrarFallo() {
    let f = { n: 0, hasta: 0 };
    try { f = JSON.parse(localStorage.getItem('ax_login_fail') || 'null') || f; } catch (_) {}
    f.n = (f.n || 0) + 1;
    if (f.n >= 5) { f.hasta = Date.now() + 60 * 1000; f.n = 0; }
    try { localStorage.setItem('ax_login_fail', JSON.stringify(f)); } catch (_) {}
  }
  const limpiarFallos = () => { try { localStorage.removeItem('ax_login_fail'); } catch (_) {} };

  // ── Ingreso sin internet ──
  // Devuelve { usuario } o { error: 'bloqueado' | 'desconocido' | 'vencido' | 'clave' | 'sin_soporte', segundos? }
  async function verificar(username, password) {
    if (!window.crypto || !crypto.subtle) return { error: 'sin_soporte' };
    const seg = segundosBloqueado();
    if (seg) return { error: 'bloqueado', segundos: seg };
    const u = await get('usuarios', normalizar(username));
    if (!u) { registrarFallo(); return { error: 'desconocido' }; }
    if (Date.now() - u.actualizado > VENCE_MS) return { error: 'vencido' };
    const hash = await derivar(password, deb64(u.salt), u.iter);
    if (!iguales(hash, u.hash)) { registrarFallo(); return { error: 'clave' }; }
    limpiarFallos();
    return { usuario: u };
  }

  async function iniciarSesionLocal(u) {
    await put('sesion', { k: 'actual', uid: String(u.id), username: u.username, nombre: u.nombre, hasta: medianoche() });
    try { localStorage.setItem('ax_vendedor', JSON.stringify({ id: u.id, nombre: u.nombre })); } catch (_) {}
  }
  async function sesionVigente() {
    try {
      const s = await get('sesion', 'actual');
      return s && s.hasta > Date.now() ? s : null;
    } catch (_) { return null; }
  }
  const cerrarSesionLocal = () => del('sesion', 'actual');

  window.AxAuth = {
    prepararLogin, finalizarLogin, verificar, iniciarSesionLocal, sesionVigente, cerrarSesionLocal,
    listarUsuarios: () => op('usuarios', 'readonly', st => st.getAll()),
  };
})();
