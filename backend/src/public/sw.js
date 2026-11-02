/* ============================================================
   AxSoft — Service Worker (modo sin internet)
   - Guarda en el equipo lo necesario para abrir Ventas, Stock e
     Inventario aunque no haya internet.
   - Las ventas hechas sin conexión las guarda offline.js (IndexedDB)
     y las envía solo cuando vuelve la conexión.
   Para forzar que todos los equipos bajen una versión nueva: subir VERSION.
   ============================================================ */
const VERSION   = 'v2';
const C_STATIC  = `axsoft-static-${VERSION}`;
const C_PAGES   = `axsoft-pages-${VERSION}`;
const C_API     = `axsoft-api-${VERSION}`;
const C_CDN     = `axsoft-cdn-${VERSION}`;
const CACHES_OK = [C_STATIC, C_PAGES, C_API, C_CDN];

// Pantallas que se pueden abrir sin internet (se guarda la última versión vista)
const PAGINAS_OFFLINE = ['/ventas', '/stock', '/inventario'];
// Datos (GET) que se guardan para que el punto de venta tenga catálogo sin internet
const API_OFFLINE = [
  '/api/products', '/api/clientes', '/api/payment-methods',
  '/api/config', '/api/vendedor-activo', '/api/empleados-activos',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Si el servidor no responde en este tiempo y hay copia guardada, se usa la copia.
// (Internet "colgado" es peor que internet cortado: el navegador cree que hay conexión.)
const TIMEOUT_PAGINA = 6000;
const TIMEOUT_API    = 8000;

const PRECACHE = ['/offline.html', '/offline-login.html', '/js/axauth.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(C_STATIC)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('axsoft-') && !CACHES_OK.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Sesión local (sin internet) ───────────────────────────────
// Se guarda en la misma base que usa axauth.js. Las pantallas y datos se guardan POR USUARIO.
function abrirAuth() {
  return new Promise((res, rej) => {
    const q = indexedDB.open('axsoft_auth', 1);
    q.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('usuarios')) db.createObjectStore('usuarios', { keyPath: 'username' });
      if (!db.objectStoreNames.contains('sesion'))   db.createObjectStore('sesion',   { keyPath: 'k' });
    };
    q.onsuccess = (e) => res(e.target.result);
    q.onerror   = (e) => rej(e.target.error);
  });
}
async function authOp(modo, fn) {
  const db = await abrirAuth();
  return new Promise((res, rej) => {
    const r = fn(db.transaction('sesion', modo).objectStore('sesion'));
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
const leerSesion   = () => authOp('readonly', (st) => st.get('actual')).catch(() => null);
const borrarSesion = () => authOp('readwrite', (st) => st.delete('actual')).catch(() => {});
function proximaMedianoche() { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
// Una respuesta autenticada del servidor trae X-AX-User: sabemos quién tiene la sesión abierta
const guardarSesion = (uid) => authOp('readwrite', (st) => st.put({ k: 'actual', uid: String(uid), hasta: proximaMedianoche() })).catch(() => {});
async function uidVigente() { const s = await leerSesion(); return s && s.hasta > Date.now() ? s.uid : null; }
// Clave de una copia guardada: separada por usuario
const clavePagina = (uid, pathname) => `/__u/${uid}${pathname}`;
const claveApi    = (uid, url) => `/__u/${uid}${url.pathname}${url.search}`;

const respuestaLoginOffline = async () =>
  (await caches.match('/offline-login.html')) ||
  (await caches.match('/offline.html')) ||
  new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

function fetchConTimeout(request, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(request, { signal: ctl.signal }).finally(() => clearTimeout(t));
}

const esApiOffline = (p) => API_OFFLINE.some((a) => p === a || p.startsWith(a + '/'));
const esEstatico = (url, req) =>
  /^\/(css|js|img|icons|uploads)\//.test(url.pathname) ||
  /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$/i.test(url.pathname) ||
  url.pathname === '/manifest.json' ||
  req.destination === 'image';

async function limpiarDatosDeUsuario() {
  await Promise.all([caches.delete(C_PAGES), caches.delete(C_API)]);
}

// ── Navegación (abrir una pantalla) ──────────────────────────
async function navegacion(event) {
  const req = event.request;
  const url = new URL(req.url);

  // Cerrar sesión: se pierde la sesión local (para volver a entrar hay que iniciar sesión).
  // Las copias guardadas quedan, protegidas por el inicio de sesión de cada usuario.
  if (url.pathname === '/logout') {
    try {
      const res = await fetchConTimeout(req, 10000);
      if (res.type === 'opaqueredirect' || res.ok) await borrarSesion();
      return res;
    } catch (_) {
      return new Response(
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="font-family:sans-serif;text-align:center;padding:48px 20px">' +
        '<h2>No se puede cerrar sesión sin internet</h2>' +
        '<p>Seguí vendiendo normalmente. Cuando vuelva la conexión podés cerrar sesión.</p>' +
        '<p><a href="/ventas">Volver a Ventas</a></p></body>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
  }

  const guardable = PAGINAS_OFFLINE.includes(url.pathname);
  try {
    const res = await fetchConTimeout(req, guardable ? TIMEOUT_PAGINA : 20000);
    // Solo se guarda una página real (200, sin redirección al login), a nombre de su usuario
    const uid = res.headers.get('X-AX-User');
    if (guardable && uid && res.ok && res.type === 'basic' && !res.redirected) {
      const copia = res.clone();
      event.waitUntil(Promise.all([
        caches.open(C_PAGES).then((c) => c.put(clavePagina(uid, url.pathname), copia)),
        guardarSesion(uid),
      ]));
    } else if (guardable && uid) {
      event.waitUntil(guardarSesion(uid));
    }
    return res;
  } catch (_) {
    // Sin conexión con el servidor
    if (guardable) {
      const uid = await uidVigente();
      if (uid) {
        const hit = await (await caches.open(C_PAGES)).match(clavePagina(uid, url.pathname));
        if (hit) return hit;
      }
      return respuestaLoginOffline();   // sin sesión vigente: pide usuario y contraseña (verificación local)
    }
    // Entrar al sistema sin internet: pantalla de ingreso (si ya hay sesión vigente, pasa directo a Ventas)
    if (['/login', '/', '/dashboard'].includes(url.pathname)) return respuestaLoginOffline();
    return (await caches.match('/offline.html')) ||
      new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// ── API (datos para el punto de venta) ───────────────────────
async function api(event) {
  const req = event.request;
  const url = new URL(req.url);
  const cache = await caches.open(C_API);

  const desdeCopia = async () => {
    const uid = (await leerSesion())?.uid || 'anon';
    const hit = await cache.match(claveApi(uid, url), { ignoreVary: true });
    if (!hit) return null;
    const h = new Headers(hit.headers);
    h.set('X-AX-Cache', '1'); // la pantalla puede avisar "usando datos guardados"
    return new Response(hit.body, { status: hit.status, headers: h });
  };

  try {
    const res = await fetchConTimeout(req, TIMEOUT_API);
    const esJson = (res.headers.get('content-type') || '').includes('json');
    const uid = res.headers.get('X-AX-User');
    if (res.ok && res.type === 'basic' && !res.redirected && esJson && uid) {
      const copia = res.clone();
      event.waitUntil(cache.put(claveApi(uid, url), copia));
      return res;
    }
    // Sesión vencida o error del servidor: mejor mostrar lo último guardado
    if (res.status === 401 || res.status >= 500) {
      const c = await desdeCopia();
      if (c) return c;
    }
    return res;
  } catch (_) {
    const c = await desdeCopia();
    if (c) return c;
    return new Response(JSON.stringify({ error: 'Sin conexión', offline: true }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Archivos propios (css/js/imágenes) ───────────────────────
async function estatico(event) {
  const req = event.request;
  const cache = await caches.open(C_STATIC);
  const hit = await cache.match(req, { ignoreVary: true });
  const versionado = new URL(req.url).searchParams.has('v');
  if (hit && versionado) return hit; // ?v=... cambia cuando el archivo cambia

  const red = fetchConTimeout(req, 10000).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  });
  if (hit) { event.waitUntil(red.catch(() => {})); return hit; }
  try {
    return await red;
  } catch (e) {
    const alt = await cache.match(req, { ignoreSearch: true });
    if (alt) return alt;
    throw e;
  }
}

// ── Bootstrap, íconos y fuentes (CDN) ────────────────────────
async function cdn(event) {
  const req = event.request;
  const cache = await caches.open(C_CDN);
  const hit = await cache.match(req, { ignoreVary: true });
  const red = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  });
  if (hit) { event.waitUntil(red.catch(() => {})); return hit; }
  return red;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // las ventas (POST) las maneja offline.js
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (CDN_HOSTS.includes(url.hostname)) event.respondWith(cdn(event));
    return;
  }
  if (req.mode === 'navigate') return event.respondWith(navegacion(event));
  if (url.pathname.startsWith('/api/')) {
    if (esApiOffline(url.pathname)) event.respondWith(api(event));
    return;
  }
  if (esEstatico(url, req)) event.respondWith(estatico(event));
});

// ── Mensajes desde la página ─────────────────────────────────
async function calentar(urls) {
  const pages = await caches.open(C_PAGES);
  const apis = await caches.open(C_API);
  await Promise.allSettled(urls.map(async (u) => {
    const url = new URL(u, self.location.origin);
    if (url.origin !== self.location.origin) return;
    const esPag = PAGINAS_OFFLINE.includes(url.pathname) && !url.search;
    const esApi = url.pathname.startsWith('/api/') && esApiOffline(url.pathname);
    if (!esPag && !esApi) return;
    const res = await fetchConTimeout(new Request(url.href, { credentials: 'same-origin', redirect: 'manual', cache: 'no-store' }), 20000);
    if (!res.ok || res.type !== 'basic') return; // redirección (sin caja abierta, sin permiso, sin sesión)
    const uid = res.headers.get('X-AX-User');
    if (!uid) return;
    if (esPag) { await pages.put(clavePagina(uid, url.pathname), res.clone()); await guardarSesion(uid); }
    else if ((res.headers.get('content-type') || '').includes('json')) await apis.put(claveApi(uid, url), res.clone());
  }));
}

// Archivos que la pantalla ya está usando (estilos, scripts, íconos, fuentes): se guardan
// de entrada, así la primera pantalla también se ve completa si se corta internet.
async function calentarArchivos(urls) {
  const propios = await caches.open(C_STATIC);
  const externos = await caches.open(C_CDN);
  await Promise.allSettled(urls.slice(0, 80).map(async (u) => {
    const url = new URL(u, self.location.origin);
    const esCdn = CDN_HOSTS.includes(url.hostname);
    const esPropio = url.origin === self.location.origin && esEstatico(url, { destination: '' });
    if (!esCdn && !esPropio) return;
    const cache = esCdn ? externos : propios;
    if (await cache.match(url.href, { ignoreVary: true })) return;
    const res = await fetchConTimeout(new Request(url.href), 15000);
    if (res.ok) await cache.put(url.href, res);
  }));
}

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'WARM' && Array.isArray(d.urls)) event.waitUntil(calentar(d.urls));
  else if (d.type === 'ASSETS' && Array.isArray(d.urls)) event.waitUntil(calentarArchivos(d.urls));
  else if (d.type === 'CLEAR') event.waitUntil(limpiarDatosDeUsuario());
});
