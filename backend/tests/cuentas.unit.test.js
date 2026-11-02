// Prueba la función REAL que arma el número de WhatsApp (se extrae de clientes.ejs).
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'pages', 'clientes.ejs'), 'utf8');
const m = src.match(/function waNumero\(tel\) \{[\s\S]*?\n\}/);
assert.ok(m, 'No se encontró waNumero en clientes.ejs');
const waNumero = new Function(m[0] + '; return waNumero;')();

test('celulares argentinos escritos de distintas formas', () => {
  const OK = '5493834123456';
  assert.equal(waNumero('383 15 4123456'), OK);
  assert.equal(waNumero('(0383) 15-4123456'), OK);
  assert.equal(waNumero('3834123456'), OK);
  assert.equal(waNumero('+54 9 383 412-3456'), OK);
  assert.equal(waNumero('+54 383 4123456'), OK);
  assert.equal(waNumero('0383 4123456'), OK);
});

test('el 15 se saca también con código de área de 2 y 4 dígitos', () => {
  assert.equal(waNumero('011 15 5555-1234'), '5491155551234');   // Buenos Aires
  assert.equal(waNumero('11 5555 1234'), '5491155551234');
  assert.equal(waNumero('3834 15 123456'), '5493834123456');     // área de 4 dígitos
});

test('números que no se pueden interpretar devuelven null (no se manda a cualquier lado)', () => {
  assert.equal(waNumero(''), null);
  assert.equal(waNumero(null), null);
  assert.equal(waNumero('12345'), null);
  assert.equal(waNumero('sin telefono'), null);
});
