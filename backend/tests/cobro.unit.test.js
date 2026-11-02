// Prueba la función REAL que lee los montos del pago mixto en la pantalla de cobro
// (se extrae de views/pages/ventas.ejs, así que si alguien la rompe, esto falla).
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'pages', 'ventas.ejs'), 'utf8');
const m = src.match(/function getMixtoVal\(inp\)\{[\s\S]*?\n\}/);
assert.ok(m, 'No se encontró getMixtoVal en ventas.ejs');
const getMixtoVal = new Function(m[0] + '; return getMixtoVal;')();

const campo2 = value => ({ id: 'mixtoMonto2', value });
const campo1 = (value, raw) => ({ id: 'mixtoMonto1', value, _rawVal: raw });

test('2° monto cargado por el sistema con punto decimal NO se multiplica x100', () => {
  assert.equal(getMixtoVal(campo2('2100.00')), 2100);     // el caso de La Huella (#25290)
  assert.equal(getMixtoVal(campo2('85600.00')), 85600);   // el caso de la #170
  assert.equal(getMixtoVal(campo2('7845.62')), 7845.62);
});

test('2° monto tipeado en formato argentino', () => {
  assert.equal(getMixtoVal(campo2('4.800,50')), 4800.5);
  assert.equal(getMixtoVal(campo2('')), 0);
});

test('1° monto con separador de miles', () => {
  assert.equal(getMixtoVal(campo1('10.000', '10000')), 10000);
  assert.equal(getMixtoVal(campo1('1.500.000', '1500000')), 1500000);
});
