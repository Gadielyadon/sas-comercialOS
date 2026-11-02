// Lotes con vencimiento: carga, FEFO (primero lo que vence antes), anulaciones, bajas y avisos.
const test   = require('node:test');
const assert = require('node:assert/strict');
const { iniciarServidor } = require('./helpers');

let srv, api;

// Fechas relativas a hoy (hora Argentina, igual que el sistema)
const base = () => new Date(Date.now() - 3 * 3600 * 1000);
const enDias = n => { const d = base(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const stock = sku => api.db.prepare('SELECT stock FROM existencias WHERE sku = ? AND sucursal_id = 1').get(sku).stock;
const lote  = id  => api.db.prepare('SELECT * FROM lotes WHERE id = ?').get(id);
const cargar = (sku, cantidad, vence, sumar) => api.post('/vencimientos/api/lotes', { sku, cantidad, vence, sumar_stock: sumar });
const vender = (sku, qty) => api.post('/api/sales', {
  items: [{ sku, name: sku, price: 1000, qty }], payment_method: 'Efectivo', cash_received: 1000 * qty,
});

let A, B, C;   // ids de lotes de P1: A vence en 3 días (5 u.), B en 20 días (10 u.)

test.before(async () => {
  srv = await iniciarServidor();
  api = srv.api;
  for (const sku of ['P1', 'P2']) {
    api.db.prepare('INSERT INTO products (sku, name, price, stock, sucursal_id) VALUES (?,?,?,?,1)').run(sku, 'Producto ' + sku, 1000, 0);
    api.db.prepare('INSERT OR REPLACE INTO existencias (sku, sucursal_id, stock) VALUES (?,1,0)').run(sku);
  }
  api.db.prepare("INSERT INTO caja (user_open, opened_at, status, sucursal_id, monto_inicial) VALUES ('admin','2000-01-01 00:00:00','abierta',1,0)").run();
});
test.after(async () => { if (srv) await srv.cerrar(); });

test('cargar mercadería nueva con vencimiento suma al stock y anota el lote', async () => {
  const a = await cargar('P1', 5, enDias(3), true);
  assert.equal(a.status, 201, JSON.stringify(a.data));
  A = a.data.id;
  const b = await cargar('P1', 10, enDias(20), true);
  B = b.data.id;
  assert.equal(stock('P1'), 15);
  assert.equal(lote(A).cantidad, 5);
});

test('cargar el vencimiento de stock que YA estaba no cambia el stock', async () => {
  // el stock vive en dos tablas que el sistema mantiene sincronizadas: lo dejamos igual que en uso real
  api.db.prepare("UPDATE existencias SET stock = 8 WHERE sku = 'P2'").run();
  api.db.prepare("UPDATE products SET stock = 8 WHERE sku = 'P2'").run();
  const r = await cargar('P2', 8, enDias(-2), false);     // ya vencido hace 2 días
  assert.equal(r.status, 201);
  C = r.data.id;
  assert.equal(stock('P2'), 8);
});

test('el listado separa vencidos / 7 días / 15 / 30 y calcula el valor', async () => {
  const d = await api.json('/vencimientos/api/lotes?dias=30');
  assert.equal(d.resumen.vencidos.lotes, 1);
  assert.equal(d.resumen.vencidos.unidades, 8);
  assert.equal(d.resumen.vencidos.valor, 8000);
  assert.equal(d.resumen.d7.lotes, 1);
  assert.equal(d.resumen.d7.valor, 5000);
  assert.equal(d.resumen.d30.lotes, 1);                    // el de 20 días
  assert.equal(d.lotes.length, 3);
  assert.equal(d.lotes[0].id, C, 'primero el que ya venció');
  const corto = await api.json('/vencimientos/api/lotes?dias=7');
  assert.equal(corto.lotes.length, 2, 'con 7 días no aparece el de 20 días');
});

test('al VENDER sale primero lo que vence antes (FEFO)', async () => {
  const v = await vender('P1', 7);
  assert.equal(v.status, 201);
  assert.equal(lote(A).cantidad, 0, 'el que vence en 3 días se gasta entero');
  assert.equal(lote(B).cantidad, 8, 'y lo que falta sale del siguiente');
  assert.equal(stock('P1'), 8);
  globalThis.__ventaFefo = v.data.sale_id;
});

test('al ANULAR la venta las unidades vuelven a SU lote', async () => {
  const an = await api.post(`/api/ventas/${globalThis.__ventaFefo}/anular`, { motivo: 'prueba' });
  assert.equal(an.status, 200);
  assert.equal(lote(A).cantidad, 5);
  assert.equal(lote(B).cantidad, 10);
  assert.equal(stock('P1'), 15);
  // anular dos veces no tiene que duplicar unidades
  const de_nuevo = await api.post(`/api/ventas/${globalThis.__ventaFefo}/anular`, { motivo: 'otra vez' });
  assert.equal(de_nuevo.status, 400);
  assert.equal(lote(A).cantidad, 5);
});

test('un ajuste MANUAL de stock hacia abajo también gasta primero lo que vence antes', async () => {
  const r = await api.patch('/api/products/P1/stock', { delta: -6 });
  assert.equal(r.status, 200);
  assert.equal(lote(A).cantidad, 0);
  assert.equal(lote(B).cantidad, 9);
  assert.equal(stock('P1'), 9);
});

test('vender más de lo que tiene fecha cargada no deja ningún lote en negativo', async () => {
  // P2 tiene 8 en stock pero solo 5 con fecha cargada (las otras 3 nunca se anotaron)
  api.db.prepare('UPDATE lotes SET cantidad = 5 WHERE id = ?').run(C);
  const v = await vender('P2', 8);
  assert.equal(v.status, 201, JSON.stringify(v.data));
  assert.equal(lote(C).cantidad, 0, 'el lote se agota, no queda negativo');
  assert.equal(stock('P2'), 0);
});

test('dar de baja un lote vencido descuenta el stock como merma, sin tocar los otros lotes', async () => {
  // Y vence ANTES que X: si la baja gastara "el que vence primero" por error, tocaría a Y.
  const y = await cargar('P1', 3, enDias(-5), false);
  const x = await cargar('P1', 4, enDias(-1), false);
  const antesStock = stock('P1'), antesB = lote(B).cantidad, antesY = lote(y.data.id).cantidad;
  const r = await api.post(`/vencimientos/api/lotes/${x.data.id}/baja`, { motivo: 'Vencido' });
  assert.equal(r.status, 200);
  assert.equal(r.data.unidades, 4);
  assert.equal(stock('P1'), antesStock - 4);
  assert.equal(lote(B).cantidad, antesB, 'no se debe gastar otro lote por la baja');
  assert.equal(lote(y.data.id).cantidad, antesY, 'el lote más viejo tampoco se toca');
  assert.equal(lote(x.data.id).cantidad, 0);
  assert.ok(lote(x.data.id).baja_at);
  const mov = api.db.prepare("SELECT tipo, delta FROM movimientos_stock WHERE sku='P1' ORDER BY id DESC LIMIT 1").get();
  assert.equal(mov.tipo, 'merma');
  assert.equal(mov.delta, -4);
  const otra = await api.post(`/vencimientos/api/lotes/${x.data.id}/baja`, {});
  assert.equal(otra.status, 400, 'no se puede dar de baja dos veces');
  await api.post(`/vencimientos/api/lotes/${y.data.id}/baja`, {});   // limpio Y para los tests siguientes
});

test('los lotes dados de baja o agotados no aparecen en el listado', async () => {
  const d = await api.json('/vencimientos/api/lotes?dias=todos');
  assert.deepEqual(d.lotes.map(l => l.id), [B]);
});

test('corregir la fecha y la cantidad de un lote', async () => {
  const r = await api.put(`/vencimientos/api/lotes/${B}`, { vence: enDias(40), cantidad: 7 });
  assert.equal(r.status, 200);
  assert.equal(lote(B).vence, enDias(40));
  assert.equal(lote(B).cantidad, 7);
});

test('datos inválidos se rechazan', async () => {
  const malos = [
    { sku: 'P1', cantidad: 5, vence: '2026-13-40' },
    { sku: 'P1', cantidad: 5, vence: '' },
    { sku: 'P1', cantidad: 5, vence: '15/11/2026' },
    { sku: 'P1', cantidad: 0, vence: enDias(5) },
    { sku: 'P1', cantidad: -3, vence: enDias(5) },
    { sku: 'P1', cantidad: 'abc', vence: enDias(5) },
    { sku: 'NOEXISTE', cantidad: 5, vence: enDias(5) },
    { cantidad: 5, vence: enDias(5) },
  ];
  const lotesAntes = api.db.prepare('SELECT COUNT(*) n FROM lotes').get().n;
  for (const m of malos) {
    const r = await api.post('/vencimientos/api/lotes', m);
    assert.equal(r.status, 400, JSON.stringify(m));
  }
  assert.equal(api.db.prepare('SELECT COUNT(*) n FROM lotes').get().n, lotesAntes, 'no se guardó nada');
  assert.equal((await api.put(`/vencimientos/api/lotes/${B}`, { vence: 'mañana' })).status, 400);
  assert.equal((await api.put('/vencimientos/api/lotes/99999', { vence: enDias(1) })).status, 404);
  assert.equal((await api.post('/vencimientos/api/lotes/99999/baja', {})).status, 404);
});

test('productos SIN lotes siguen vendiéndose igual que siempre', async () => {
  api.db.prepare("INSERT INTO products (sku, name, price, stock, sucursal_id) VALUES ('P3','Sin lotes',1000,10,1)").run();
  api.db.prepare("INSERT OR REPLACE INTO existencias (sku, sucursal_id, stock) VALUES ('P3',1,10)").run();
  const v = await vender('P3', 4);
  assert.equal(v.status, 201);
  assert.equal(stock('P3'), 6);
  assert.equal(api.db.prepare("SELECT COUNT(*) n FROM lote_consumos WHERE sku='P3'").get().n, 0);
});

test('la pantalla de Vencimientos y el tablero cargan', async () => {
  for (const u of ['/vencimientos', '/dashboard']) {
    const r = await api.get(u);
    assert.equal(r.status, 200, u);
  }
  const html = await (await api.get('/dashboard')).text();
  assert.ok(html.includes('Por vencer'), 'el tablero muestra la tarjeta "Por vencer" cuando hay lotes');
});
