// Prueba de punta a punta: carga ventas reales (simples, mixtas, fiado, anulada) y
// verifica que Reportes, Historial, Caja, Excel y el control den LOS MISMOS números.
const test   = require('node:test');
const assert = require('node:assert/strict');
const { iniciarServidor } = require('./helpers');

const R = 'desde=2000-01-01&hasta=2100-01-01';
const redondear = n => Math.round(n * 100) / 100;

let srv, api, cajaId;

async function vender(extra) {
  return api.post('/api/sales', {
    items: [{ sku: extra.sku, name: extra.sku, price: extra.price, qty: extra.qty || 1 }],
    payment_method: extra.pm, cash_received: extra.m1 ?? null, monto_mixto2: extra.m2 ?? null,
    cliente_id: extra.cliente ?? null,
  });
}

// Efectivo según cada pantalla / reporte
async function efectivoEnTodasLasPantallas() {
  const rep  = await api.json(`/api/reportes/ventas?${R}`);
  const his  = await api.json(`/api/ventas/buscar?${R}&metodo=Efectivo&limit=500`);
  const met  = await api.json(`/api/reporte/metodos?${R}`);
  const ctl  = await api.json(`/api/control/pagos?${R}`);
  const caja = await api.json(`/caja/resumen/${cajaId}`);
  const f = (arr, k) => (arr.find(m => String(m[k]).toLowerCase() === 'efectivo') || {});
  return {
    reportes:  redondear(f(rep.metodos, 'payment_method').total || 0),
    historial: redondear(his.resumen.total_metodo || 0),
    metodos:   redondear(f(met.metodos, 'metodo').total || 0),
    control:   redondear(ctl.efectivo_sql),
    caja:      redondear(caja.totalEfectivo),
    controlOk: ctl.coincide,
    rep, ctl,
  };
}

test.before(async () => {
  srv = await iniciarServidor();
  api = srv.api;
  const db = api.db;
  // Datos de prueba: 2 productos (uno con costo, otro sin costo), un cliente y la caja abierta
  for (const [sku, price, cost] of [['P1', 10000, 6000], ['P2', 5000, null]]) {
    db.prepare('INSERT INTO products (sku, name, price, price_cost, stock, sucursal_id) VALUES (?,?,?,?,?,1)').run(sku, sku, price, cost, 1000);
    db.prepare('INSERT OR REPLACE INTO existencias (sku, sucursal_id, stock) VALUES (?,1,1000)').run(sku);
  }
  db.prepare("INSERT INTO clientes (id, nombre) VALUES (2, 'Cliente Test')").run();
  cajaId = db.prepare("INSERT INTO caja (user_open, opened_at, status, sucursal_id, monto_inicial) VALUES ('admin','2000-01-01 00:00:00','abierta',1,0)").run().lastInsertRowid;
});

test.after(async () => { if (srv) await srv.cerrar(); });

test('cargo ventas de todos los tipos', async () => {
  const casos = [
    { n: 'efectivo simple',               sku: 'P1', price: 10000, pm: 'Efectivo',                 m1: 10000 },
    { n: 'Efectivo + Débito',             sku: 'P1', price: 10000, pm: 'Efectivo + Débito',        m1: 3000, m2: 7000 },
    { n: 'Transferencia + Efectivo',      sku: 'P2', price: 5000,  pm: 'Transferencia + Efectivo', m1: 1500, m2: 3500 },
    { n: 'Efectivo + Crédito',            sku: 'P1', price: 10000, pm: 'Efectivo + Crédito',       m1: 4000, m2: 6000 },
    { n: 'Fiado (cliente)',               sku: 'P2', price: 5000,  pm: 'Fiado',                    cliente: 2 },
    { n: 'Efectivo + Fiado (cliente)',    sku: 'P1', price: 10000, pm: 'Efectivo + Fiado',         m1: 2500, m2: 7500, cliente: 2 },
  ];
  for (const c of casos) {
    const r = await vender(c);
    assert.equal(r.status, 201, `${c.n}: ${JSON.stringify(r.data)}`);
  }
  // una venta que después se anula
  const v = await vender({ sku: 'P2', price: 5000, pm: 'Efectivo', m1: 5000 });
  assert.equal(v.status, 201);
  const an = await api.post(`/api/ventas/${v.data.sale_id}/anular`, { motivo: 'prueba' });
  assert.equal(an.status, 200);
});

test('el EFECTIVO es el mismo en Reportes, Historial, Excel, Caja y Control', async () => {
  const e = await efectivoEnTodasLasPantallas();
  // 10000 + 3000 + 3500 + 4000 + 2500 = 23000 (la anulada NO cuenta)
  assert.equal(e.reportes, 23000, 'Reportes');
  assert.equal(e.historial, 23000, 'Historial');
  assert.equal(e.metodos, 23000, 'Reporte por método');
  assert.equal(e.control, 23000, 'Control en SQL');
  assert.equal(e.caja, 23000, 'Caja');
  assert.equal(e.controlOk, true);
});

test('totales: vendido, fiado y cobrado', async () => {
  const rep = await api.json(`/api/reportes/ventas?${R}`);
  assert.equal(rep.total_ventas, 50000);
  assert.equal(rep.total_fiado, 12500);        // 5000 + 7500 (solo la parte fiada)
  assert.equal(rep.total_cobrado, 37500);
  const cli = api.db.prepare('SELECT saldo FROM clientes WHERE id = 2').get();
  assert.equal(cli.saldo, 12500);              // al cliente se le cargó solo lo fiado
});

test('el control no marca nada raro cuando todo está bien', async () => {
  const ctl = await api.json(`/api/control/pagos?${R}`);
  assert.deepEqual(ctl.anomalias, []);
  assert.equal(ctl.ok, true);
});

test('un 2° monto inflado x100 (bug viejo) se corrige solo en el servidor', async () => {
  const r = await vender({ sku: 'P2', price: 5000, pm: 'Efectivo + Débito', m1: 1000, m2: 400000 });
  assert.equal(r.status, 201);
  const row = api.db.prepare('SELECT monto_mixto2 FROM sales WHERE id = ?').get(r.data.sale_id);
  assert.equal(row.monto_mixto2, 4000);        // 400000 / 100
  const ctl = await api.json(`/api/control/pagos?${R}`);
  assert.deepEqual(ctl.anomalias.filter(a => a.tipo === 'monto_inflado'), []);
  // limpiamos para no afectar los demás números
  await api.post(`/api/ventas/${r.data.sale_id}/anular`, { motivo: 'prueba' });
});

test('fiado SIN cliente se rechaza (simple, mixto, consumidor final y cliente inexistente)', async () => {
  const intentos = [
    { pm: 'Fiado' },
    { pm: 'Efectivo + Fiado', m1: 1000, m2: 4000 },
    { pm: 'Efectivo + Fiado', m1: 1000, m2: 4000, cliente: 1 },
    { pm: 'Fiado', cliente: 9999 },
  ];
  for (const i of intentos) {
    const r = await vender({ sku: 'P2', price: 5000, ...i });
    assert.equal(r.status, 400, JSON.stringify(i));
    assert.match(r.data.error, /cliente/i);
  }
});

test('anular una venta baja el efectivo en TODAS las pantallas por igual', async () => {
  const antes = await efectivoEnTodasLasPantallas();
  const v = await vender({ sku: 'P2', price: 5000, pm: 'Transferencia + Efectivo', m1: 1000, m2: 4000 });
  assert.equal(v.status, 201);
  const sube = await efectivoEnTodasLasPantallas();
  for (const k of ['reportes', 'historial', 'metodos', 'control', 'caja']) assert.equal(sube[k], antes[k] + 4000, k + ' (al vender)');
  await api.post(`/api/ventas/${v.data.sale_id}/anular`, { motivo: 'prueba' });
  const baja = await efectivoEnTodasLasPantallas();
  for (const k of ['reportes', 'historial', 'metodos', 'control', 'caja']) assert.equal(baja[k], antes[k], k + ' (al anular)');
});

test('el filtro del Historial incluye pagos mixtos y no distingue "Mercado Pago" de "MercadoPago"', async () => {
  const todas = await api.json(`/api/ventas/buscar?${R}&metodo=Efectivo&limit=500`);
  // 1 simple + 4 mixtas con efectivo (Débito, Transferencia+Efectivo, Crédito, Fiado)
  assert.equal(todas.resumen.cantidad, 5);
  const mp = await vender({ sku: 'P2', price: 5000, pm: 'Mercado Pago' });
  assert.equal(mp.status, 201);
  const f = await api.json(`/api/ventas/buscar?${R}&metodo=MercadoPago&limit=500`);
  assert.equal(f.resumen.cantidad, 1);
  await api.post(`/api/ventas/${mp.data.sale_id}/anular`, { motivo: 'prueba' });
});

test('ganancia: lo que no tiene costo cargado no se cuenta como ganancia', async () => {
  const rep = await api.json(`/api/reportes/ventas?${R}`);
  const g = rep.ganancia;
  // P1 (costo 6000) vendido 4 veces = venta 40000, costo 24000. P2 no tiene costo (10000 vendidos).
  assert.equal(g.venta_con_costo, 40000);
  assert.equal(g.ganancia, 16000);
  assert.equal(g.margen_pct, 40);
  assert.equal(g.venta_sin_costo, 10000);
  assert.equal(g.cobertura_pct, 80);
  const p2 = rep.productos.find(p => p.name === 'P2');
  assert.equal(p2.ganancia, null);             // "Sin costo", no una ganancia inventada
});

test('los Excel y las pantallas principales responden bien', async () => {
  for (const u of ['/api/reporte/metodos.xlsx?' + R, '/api/reportes/ventas/export?' + R, '/api/historial.xlsx?' + R]) {
    const r = await api.get(u);
    assert.equal(r.status, 200, u);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.ok(buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b, u + ' no es un .xlsx válido');
  }
  for (const u of ['/dashboard', '/ventas', '/historial', '/reportes/ventas', '/caja']) {
    const r = await api.get(u);
    assert.ok([200, 302].includes(r.status), `${u} → ${r.status}`);
  }
});

// IMPORTANTE: este test cierra la caja, por eso va último.
test('el CIERRE DE CAJA espera el mismo efectivo que muestran los reportes', async () => {
  const r = await api.post('/caja/cerrar', { monto_contado: 23000 });
  assert.equal(r.status, 302);
  const caja = api.db.prepare('SELECT * FROM caja WHERE id = ?').get(cajaId);
  assert.ok(caja.closed_at, 'la caja debería haber quedado cerrada');
  assert.equal(caja.monto_final, 23000, 'efectivo esperado al cierre');   // no 35000, que sería contar el total de las mixtas
  assert.equal(caja.diferencia, 0, 'si se cuenta exactamente lo que hay, no hay diferencia');
  assert.equal(caja.total_sales, 50000, 'ventas del turno (sin la anulada)');
});
