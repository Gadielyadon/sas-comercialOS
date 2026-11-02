// Pruebas del modo sin internet: venta con ID único (sin duplicados), fecha real,
// stock, sesión vencida y archivos del Service Worker.
// Levanta el sistema REAL con una base temporal (nunca toca la base verdadera).
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { iniciarServidor } = require('./helpers');

let srv, api;
test.before(async () => { srv = await iniciarServidor(); api = srv.api; });
test.after(async () => { await srv.cerrar(); });

const stockDe = sku => api.db.prepare('SELECT stock FROM products WHERE sku = ?').get(sku).stock;
const ventasConUuid = uuid => api.db.prepare('SELECT * FROM sales WHERE client_uuid = ?').all(uuid);
// El stock real vive en `existencias` (products.stock es un espejo), igual que en las otras pruebas
const crearProducto = (sku, stock) => {
  api.db.prepare('INSERT INTO products (sku, name, price, stock, sucursal_id) VALUES (?,?,?,?,1)').run(sku, 'Prod ' + sku, 1000, stock);
  api.db.prepare('INSERT OR REPLACE INTO existencias (sku, sucursal_id, stock) VALUES (?,1,?)').run(sku, stock);
};
const venta = (sku, qty, extra = {}) => ({
  payment_method: 'Efectivo', cash_received: 1000 * qty, change_amount: 0,
  items: [{ sku, name: 'Prod ' + sku, price: 1000, qty }], ...extra,
});
const fechaAR = d => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).replace('T', ' ').substring(0, 19);

test('la misma venta enviada dos veces (reintento tras un corte) se guarda UNA sola vez', async () => {
  crearProducto('DUP1', 10);
  const uuid = 'aaaaaaaa-1111-4111-8111-000000000001';
  const r1 = await api.post('/api/sales', venta('DUP1', 2, { client_uuid: uuid, offline: 1 }));
  const r2 = await api.post('/api/sales', venta('DUP1', 2, { client_uuid: uuid, offline: 1 }));
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 200);
  assert.equal(r2.data.duplicada, true);
  assert.equal(r2.data.sale_id, r1.data.sale_id);
  assert.equal(ventasConUuid(uuid).length, 1);
  assert.equal(stockDe('DUP1'), 8, 'el stock se descontó una sola vez');
});

test('5 envíos simultáneos de la misma venta → una sola venta', async () => {
  crearProducto('DUP2', 20);
  const uuid = 'bbbbbbbb-2222-4222-8222-000000000002';
  const rs = await Promise.all(Array.from({ length: 5 }, () => api.post('/api/sales', venta('DUP2', 3, { client_uuid: uuid }))));
  assert.ok(rs.every(r => r.status === 200 || r.status === 201));
  assert.equal(new Set(rs.map(r => r.data.sale_id)).size, 1);
  assert.equal(ventasConUuid(uuid).length, 1);
  assert.equal(stockDe('DUP2'), 17);
});

test('una venta hecha SIN internet se acepta aunque el stock haya quedado corto (ya ocurrió)', async () => {
  crearProducto('OFF1', 1);
  const r = await api.post('/api/sales', venta('OFF1', 3, { client_uuid: 'cccccccc-3333-4333-8333-000000000003', offline: 1 }));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(stockDe('OFF1'), -2);
  assert.equal(api.db.prepare('SELECT offline FROM sales WHERE id = ?').get(r.data.sale_id).offline, 1);
});

test('una venta normal (con internet) SIGUE rechazándose si no hay stock', async () => {
  crearProducto('ONL1', 1);
  const r = await api.post('/api/sales', venta('ONL1', 3));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Stock insuficiente/);
  assert.equal(stockDe('ONL1'), 1);
});

test('la venta conserva la hora real en que se hizo, no la de la sincronización', async () => {
  crearProducto('FEC1', 50);
  const hace2h = new Date(Date.now() - 2 * 3600 * 1000);
  const r = await api.post('/api/sales', venta('FEC1', 1, { client_uuid: 'dddddddd-4444-4444-8444-000000000004', fecha_venta: hace2h.toISOString(), offline: 1 }));
  assert.equal(r.status, 201);
  assert.equal(api.db.prepare('SELECT created_at FROM sales WHERE id = ?').get(r.data.sale_id).created_at, fechaAR(hace2h));
});

test('fecha futura o inválida se ignora (se usa la hora actual)', async () => {
  crearProducto('FEC2', 50);
  const antes = fechaAR(new Date(Date.now() - 5000));
  const rF = await api.post('/api/sales', venta('FEC2', 1, { fecha_venta: new Date(Date.now() + 3 * 86400000).toISOString() }));
  const rI = await api.post('/api/sales', venta('FEC2', 1, { fecha_venta: 'no-es-una-fecha' }));
  const despues = fechaAR(new Date(Date.now() + 5000));
  for (const r of [rF, rI]) {
    assert.equal(r.status, 201);
    const c = api.db.prepare('SELECT created_at FROM sales WHERE id = ?').get(r.data.sale_id).created_at;
    assert.ok(c >= antes && c <= despues, `created_at ${c} fuera de [${antes}, ${despues}]`);
  }
});

test('ventas sin client_uuid (pantallas viejas) siguen funcionando igual', async () => {
  crearProducto('OLD1', 5);
  const r = await api.post('/api/sales', venta('OLD1', 1));
  assert.equal(r.status, 201);
  assert.equal(api.db.prepare('SELECT client_uuid, offline FROM sales WHERE id = ?').get(r.data.sale_id).client_uuid, null);
});

test('client_uuid con caracteres raros se ignora (la venta igual se guarda)', async () => {
  crearProducto('BAD1', 5);
  const r = await api.post('/api/sales', venta('BAD1', 1, { client_uuid: "x'; DROP TABLE sales;--" }));
  assert.equal(r.status, 201);
  assert.equal(api.db.prepare('SELECT client_uuid FROM sales WHERE id = ?').get(r.data.sale_id).client_uuid, null);
});

test('sin sesión, la API responde 401 en JSON (no redirige al login)', async () => {
  const r = await fetch(api.base + '/api/sales', { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(venta('X', 1)) });
  assert.equal(r.status, 401);
  const d = await r.json();
  assert.equal(d.sesion_vencida, true);
});

test('sin sesión, las pantallas siguen mandando al login', async () => {
  const r = await fetch(api.base + '/ventas', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/login/);
});

test('el Service Worker se sirve sin caché y con alcance a todo el sitio', async () => {
  const r = await fetch(api.base + '/sw.js', { redirect: 'manual' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(r.headers.get('cache-control'), /no-cache|no-store/);
  assert.equal(r.headers.get('service-worker-allowed'), '/');
});

test('la página "sin conexión" se puede abrir sin sesión', async () => {
  const r = await fetch(api.base + '/offline.html', { redirect: 'manual' });
  assert.equal(r.status, 200);
});

test('las pantallas incluyen el registro del Service Worker y offline.js versionado', async () => {
  const r = await api.get('/ventas');
  // Admin sin caja: /ventas abre igual (el admin saltea el bloqueo de caja)
  const html = await r.text();
  assert.match(html, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(html, /\/js\/offline\.js\?v=\d+/);
  assert.match(html, /client_uuid/);
});

test('el cierre de caja usa la verificación de ventas pendientes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'pages', 'caja_turno.ejs'), 'utf8');
  assert.match(src, /axConfirmarCierre/);
});

// ───────────────────────── Ajustes de stock sin internet ─────────────────────────
const patchStock = (sku, body) => api.patch(`/api/products/${sku}/stock`, body);
const movs = sku => api.db.prepare('SELECT * FROM movimientos_stock WHERE sku = ? ORDER BY id').all(sku);

test('un ajuste de stock enviado dos veces (reintento tras un corte) se aplica UNA sola vez', async () => {
  crearProducto('AJ1', 10);
  const uuid = 'eeeeeeee-5555-4555-8555-000000000005';
  const r1 = await patchStock('AJ1', { delta: 5, client_uuid: uuid, offline: 1 });
  const r2 = await patchStock('AJ1', { delta: 5, client_uuid: uuid, offline: 1 });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r2.data.duplicada, true);
  assert.equal(stockDe('AJ1'), 15, 'sumó 5 una sola vez');
  assert.equal(movs('AJ1').length, 1, 'un solo movimiento registrado');
});

test('ajustes de stock simultáneos con el mismo ID → se aplica una vez', async () => {
  crearProducto('AJ2', 10);
  const uuid = 'ffffffff-6666-4666-8666-000000000006';
  await Promise.all(Array.from({ length: 5 }, () => patchStock('AJ2', { delta: -2, client_uuid: uuid, offline: 1 })));
  assert.equal(stockDe('AJ2'), 8);
});

test('un ajuste hecho sin internet se acepta aunque el stock quede negativo (ya ocurrió)', async () => {
  crearProducto('AJ3', 2);
  const r = await patchStock('AJ3', { delta: -5, client_uuid: 'gggggggg-7777-4777-8777-000000000007', offline: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(stockDe('AJ3'), -3);
});

test('un ajuste normal (con internet) SIGUE rechazándose si deja el stock negativo', async () => {
  crearProducto('AJ4', 2);
  const r = await patchStock('AJ4', { delta: -5 });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Stock insuficiente/);
  assert.equal(stockDe('AJ4'), 2);
});

test('el movimiento de stock conserva la fecha real del ajuste hecho sin internet', async () => {
  crearProducto('AJ5', 10);
  const hace3h = new Date(Date.now() - 3 * 3600 * 1000);
  await patchStock('AJ5', { delta: 1, client_uuid: 'hhhhhhhh-8888-4888-8888-000000000008', offline: 1, fecha_ajuste: hace3h.toISOString() });
  const m = movs('AJ5');
  assert.equal(m.length, 1);
  assert.equal(m[0].created_at, fechaAR(hace3h));
  assert.match(m[0].motivo, /sin internet/);
});

test('ajustes sin ID (pantallas viejas) o con ID inválido siguen funcionando', async () => {
  crearProducto('AJ6', 10);
  assert.equal((await patchStock('AJ6', { delta: 1 })).status, 200);
  assert.equal((await patchStock('AJ6', { delta: 1, client_uuid: "x'; DROP TABLE existencias;--" })).status, 200);
  assert.equal(stockDe('AJ6'), 12);
});

// ───────────────────────── Quién vendió ─────────────────────────
const usuarioDe = id => api.db.prepare('SELECT usuario FROM sales WHERE id = ?').get(id).usuario;

test('una venta hecha sin internet queda a nombre del vendedor que estaba atendiendo', async () => {
  crearProducto('VEN1', 10);
  const r = await api.post('/api/sales', venta('VEN1', 1, { offline: 1, client_uuid: 'iiiiiiii-9999-4999-8999-000000000009', vendedor: { id: 7, nombre: 'Cajero Offline' } }));
  assert.equal(r.status, 201);
  assert.equal(usuarioDe(r.data.sale_id), 'Cajero Offline');
});

test('en una venta normal (con internet) NO se confía en el vendedor enviado por el navegador', async () => {
  crearProducto('VEN2', 10);
  const r = await api.post('/api/sales', venta('VEN2', 1, { vendedor: { id: 7, nombre: 'Cajero Falso' } }));
  assert.equal(r.status, 201);
  assert.notEqual(usuarioDe(r.data.sale_id), 'Cajero Falso');
});

test('una venta sin internet sin vendedor guardado usa el usuario de la sesión', async () => {
  crearProducto('VEN3', 10);
  const r = await api.post('/api/sales', venta('VEN3', 1, { offline: 1, client_uuid: 'jjjjjjjj-0000-4000-8000-000000000010', vendedor: null }));
  assert.equal(r.status, 201);
  assert.ok(usuarioDe(r.data.sale_id), 'tiene algún usuario');
});

test('las pantallas incluyen la protección de ajustes y el vendedor', async () => {
  const inv = await (await api.get('/inventario')).text();
  assert.match(inv, /_enviarAjusteStock/);
  const ven = await (await api.get('/ventas')).text();
  assert.match(ven, /_vendedorGuardado/);
  assert.match(ven, /payload\.vendedor/);
});

// ───────────────────────── Inicio de sesión sin internet ─────────────────────────
test('las respuestas con sesión indican qué usuario es (X-AX-User); sin sesión no', async () => {
  const con = await api.get('/api/payment-methods');
  assert.equal(con.status, 200);
  assert.match(con.headers.get('x-ax-user') || '', /^\d+$/);
  const sin = await fetch(api.base + '/api/payment-methods', { redirect: 'manual', headers: { Accept: 'application/json' } });
  assert.equal(sin.status, 401);
  assert.equal(sin.headers.get('x-ax-user'), null);
});

test('la pantalla de ingreso sin internet y su script se sirven sin sesión', async () => {
  const h = await fetch(api.base + '/offline-login.html', { redirect: 'manual' });
  assert.equal(h.status, 200);
  assert.match(await h.text(), /Iniciar sesión/);
  const j = await fetch(api.base + '/js/axauth.js', { redirect: 'manual' });
  assert.equal(j.status, 200);
});

test('el login normal prepara la verificación local y el sistema la completa con sesión iniciada', async () => {
  const login = await (await fetch(api.base + '/login', { redirect: 'manual' })).text();
  assert.match(login, /axauth\.js/);
  assert.match(login, /prepararLogin/);
  const ventas = await (await api.get('/ventas')).text();
  assert.match(ventas, /axauth\.js\?v=\d+/);
  assert.match(ventas, /finalizarLogin/);
});

test('la contraseña nunca se guarda ni se envía a otro lado: axauth solo guarda un hash con sal', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'js', 'axauth.js'), 'utf8');
  assert.match(src, /PBKDF2/);
  assert.match(src, /getRandomValues/);          // sal aleatoria
  assert.doesNotMatch(src, /localStorage\.setItem\([^)]*password/i);
  // el sessionStorage temporal guarda solo el hash derivado, no la clave
  assert.doesNotMatch(src, /sessionStorage\.setItem\('ax_login_pend', JSON\.stringify\(\{[^}]*password/);
});
