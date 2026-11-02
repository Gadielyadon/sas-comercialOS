// Cuenta corriente de clientes: cobros, entrada a la caja y anulación de ventas fiadas.
const test   = require('node:test');
const assert = require('node:assert/strict');
const { iniciarServidor } = require('./helpers');

const R = 'desde=2000-01-01&hasta=2100-01-01';
let srv, api, cajaId;

const saldo = id => api.db.prepare('SELECT saldo FROM clientes WHERE id = ?').get(id).saldo;
const ingresosCaja = () => api.db.prepare("SELECT COALESCE(SUM(monto),0) t, COUNT(*) n FROM caja_movimientos WHERE tipo='ingreso' AND caja_id = ?").get(cajaId);
const fiar = (cliente, monto, extra = {}) => api.post('/api/sales', {
  items: [{ sku: 'P1', name: 'P1', price: monto, qty: 1 }],
  payment_method: 'Fiado', cliente_id: cliente, ...extra,
});

test.before(async () => {
  srv = await iniciarServidor();
  api = srv.api;
  const db = api.db;
  db.prepare('INSERT INTO products (sku, name, price, stock, sucursal_id) VALUES (?,?,?,?,1)').run('P1', 'P1', 10000, 1000);
  db.prepare('INSERT OR REPLACE INTO existencias (sku, sucursal_id, stock) VALUES (?,1,1000)').run('P1');
  db.prepare("INSERT INTO clientes (id, nombre, telefono) VALUES (2, 'Cliente Test', '383 15 4123456')").run();
  cajaId = db.prepare("INSERT INTO caja (user_open, opened_at, status, sucursal_id, monto_inicial) VALUES ('admin','2000-01-01 00:00:00','abierta',1,1000)").run().lastInsertRowid;
});
test.after(async () => { if (srv) await srv.cerrar(); });

test('un cliente fía y la deuda queda en su cuenta', async () => {
  const r = await fiar(2, 10000);
  assert.equal(r.status, 201);
  assert.equal(saldo(2), 10000);
});

test('cobro en EFECTIVO: baja la deuda y el efectivo entra a la caja', async () => {
  const antes = ingresosCaja();
  const r = await api.post('/api/clientes/2/pago', { monto: 4000, metodo: 'Efectivo', descripcion: 'cuota 1' });
  assert.equal(r.status, 200);
  assert.equal(r.data.saldo, 6000);
  assert.equal(r.data.caja_ingreso, true);
  assert.equal(saldo(2), 6000);
  assert.equal(ingresosCaja().t, antes.t + 4000);
  const mov = api.db.prepare("SELECT metodo FROM clientes_movimientos WHERE tipo='pago' ORDER BY id DESC LIMIT 1").get();
  assert.equal(mov.metodo, 'Efectivo');
});

test('cobro por TRANSFERENCIA: baja la deuda pero NO toca la caja de efectivo', async () => {
  const antes = ingresosCaja();
  const r = await api.post('/api/clientes/2/pago', { monto: 1000, metodo: 'Transferencia' });
  assert.equal(r.status, 200);
  assert.equal(r.data.caja_ingreso, false);
  assert.equal(saldo(2), 5000);
  assert.equal(ingresosCaja().t, antes.t);
});

test('montos inválidos se rechazan y no cambian el saldo', async () => {
  for (const monto of ['abc', -5, 0, null, '', 'NaN']) {
    const r = await api.post('/api/clientes/2/pago', { monto, metodo: 'Efectivo' });
    assert.equal(r.status, 400, 'monto ' + JSON.stringify(monto));
  }
  assert.equal(saldo(2), 5000);
  const r = await api.post('/api/clientes/9999/pago', { monto: 100 });
  assert.equal(r.status, 404);
});

test('el CIERRE DE CAJA suma el cobro en efectivo (y no el de la transferencia)', async () => {
  // monto inicial 1000 + cobro efectivo 4000 = 5000 (no hubo ventas en efectivo)
  const r = await api.post('/caja/cerrar', { monto_contado: 5000 });
  assert.equal(r.status, 302);
  const caja = api.db.prepare('SELECT * FROM caja WHERE id = ?').get(cajaId);
  assert.equal(caja.monto_final, 5000);
  assert.equal(caja.diferencia, 0);
});

test('cobro en efectivo SIN caja abierta: se registra el pago y avisa que no entró a la caja', async () => {
  const r = await api.post('/api/clientes/2/pago', { monto: 500, metodo: 'Efectivo' });
  assert.equal(r.status, 200);
  assert.equal(r.data.caja_ingreso, false);
  assert.equal(saldo(2), 4500);
});

test('anular una venta fiada REVIERTE la deuda del cliente', async () => {
  // Abro una caja nueva y fío otra venta
  api.db.prepare("INSERT INTO caja (user_open, opened_at, status, sucursal_id, monto_inicial) VALUES ('admin','2000-01-01 00:00:00','abierta',1,0)").run();
  const antes = saldo(2);
  const v = await fiar(2, 3000);
  assert.equal(v.status, 201);
  assert.equal(saldo(2), antes + 3000);

  const an = await api.post(`/api/ventas/${v.data.sale_id}/anular`, { motivo: 'error de carga' });
  assert.equal(an.status, 200);
  assert.equal(saldo(2), antes, 'la deuda de la venta anulada tiene que desaparecer');
  const mov = api.db.prepare("SELECT tipo, metodo FROM clientes_movimientos WHERE sale_id = ? ORDER BY id DESC LIMIT 1").get(v.data.sale_id);
  assert.equal(mov.tipo, 'pago');
  assert.equal(mov.metodo, 'anulacion');       // se distingue de un cobro real
  const ctl = await api.json(`/api/control/pagos?${R}`);
  assert.deepEqual(ctl.anomalias.filter(a => a.tipo === 'deuda_de_venta_anulada'), []);
});

test('anular una venta Efectivo + Fiado revierte SOLO la parte fiada', async () => {
  const antes = saldo(2);
  const v = await api.post('/api/sales', {
    items: [{ sku: 'P1', name: 'P1', price: 10000, qty: 1 }],
    payment_method: 'Efectivo + Fiado', cash_received: 2500, monto_mixto2: 7500, cliente_id: 2,
  });
  assert.equal(v.status, 201);
  assert.equal(saldo(2), antes + 7500);
  await api.post(`/api/ventas/${v.data.sale_id}/anular`, { motivo: 'prueba' });
  assert.equal(saldo(2), antes);
});

test('el control detecta ventas anuladas ANTES de la corrección que siguen cargadas como deuda', async () => {
  // Simulo el estado viejo: venta anulada a mano en la base, con su cargo sin revertir
  const v = await fiar(2, 800);
  api.db.prepare("UPDATE sales SET status = 'anulada' WHERE id = ?").run(v.data.sale_id);
  const ctl = await api.json(`/api/control/pagos?${R}`);
  const hit = ctl.anomalias.filter(a => a.tipo === 'deuda_de_venta_anulada');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].id, v.data.sale_id);
});
