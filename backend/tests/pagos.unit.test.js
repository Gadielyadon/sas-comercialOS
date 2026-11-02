// Pruebas de la cuenta única de pagos (no necesitan servidor).
const test   = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/services/pagos.service');

const V = {
  efectivo:  { id: 1, total: 1000,  payment_method: 'Efectivo' },
  transfEf:  { id: 2, total: 3600,  payment_method: 'Transferencia + Efectivo', cash_received: 1500,  monto_mixto2: 2100 },
  efFiado:   { id: 3, total: 95600, payment_method: 'Efectivo + Fiado',         cash_received: 10000, monto_mixto2: 85600 },
  anulada:   { id: 4, total: 500,   payment_method: 'Efectivo', status: 'anulada' },
  efCredito: { id: 5, total: 9000,  payment_method: 'Efectivo + Crédito',       cash_received: 7000,  monto_mixto2: 2400 },
};

test('efectivo de una venta simple y de mixtas (en cualquier posición)', () => {
  assert.equal(P.efectivoDe(V.efectivo), 1000);
  assert.equal(P.efectivoDe(V.transfEf), 2100);   // el efectivo va en 2° lugar
  assert.equal(P.efectivoDe(V.efFiado), 10000);
});

test('fiado: solo la parte fiada, no el total', () => {
  assert.equal(P.fiadoDe(V.efFiado), 85600);
  assert.equal(P.fiadoDe({ total: 70, payment_method: 'Fiado' }), 70);
  assert.equal(P.fiadoDe({ total: 9100, payment_method: 'Cuenta corriente' }), 9100);
  assert.equal(P.fiadoDe(V.efectivo), 0);
});

test('las ventas anuladas no suman', () => {
  const g = P.agruparPorMetodo(Object.values(V));
  assert.equal(g.find(x => x.payment_method === 'Efectivo').total, 1000 + 2100 + 10000 + 7000);
});

test('"Mercado Pago" y "MercadoPago" se unifican', () => {
  const g = P.agruparPorMetodo([
    { total: 50, payment_method: 'Mercado Pago' }, { total: 70, payment_method: 'MercadoPago' },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].total, 120);
});

test('detecta un 2° monto inflado (el bug del x100)', () => {
  const a = P.detectarAnomalias([{ id: 9, total: 3600, payment_method: 'Efectivo + Débito', cash_received: 1500, monto_mixto2: 210000 }]);
  assert.equal(a.length, 1);
  assert.equal(a[0].tipo, 'monto_inflado');
});

test('no marca como raras las ventas mixtas normales (con recargo ni fiado)', () => {
  assert.equal(P.detectarAnomalias([V.efCredito, { ...V.efFiado, cliente_id: 3 }]).length, 0);
});

test('detecta fiado sin cliente', () => {
  const a = P.detectarAnomalias([{ ...V.efFiado, cliente_id: 1 }]);
  assert.deepEqual(a.map(x => x.tipo), ['fiado_sin_cliente']);
});

test('filtro SQL por método incluye los pagos mixtos', () => {
  const f = P.filtroSQL('s.payment_method', 'Efectivo');
  assert.equal(f.params.length, 3);
  assert.ok(f.sql.includes('LIKE'));
});
