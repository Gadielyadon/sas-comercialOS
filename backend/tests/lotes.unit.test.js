// Lotes: traslado entre sucursales (las fechas viajan con la mercadería).
// Se prueba directo sobre los servicios, con una base temporal (no toca la real).
const os = require('os'), path = require('path'), fs = require('fs');
const dbPath = path.join(os.tmpdir(), `axsoft-lotes-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
process.env.DB_PATH = dbPath;

const test   = require('node:test');
const assert = require('node:assert/strict');
const { db, run, get, all } = require('../src/db');
const existencias = require('../src/services/existencias.service');
const lotes       = require('../src/services/lotes.service');

test.after(() => {
  try { db.close(); } catch (_) {}
  for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) { try { fs.unlinkSync(f); } catch (_) {} }
});

test('transferir stock a otra sucursal se lleva las fechas de vencimiento', () => {
  run(`INSERT INTO products (sku, name, price, stock, sucursal_id) VALUES ('T1','Producto T',100,10,1)`);
  run(`INSERT OR REPLACE INTO existencias (sku, sucursal_id, stock) VALUES ('T1',1,10)`);
  const a = lotes.registrar({ sku: 'T1', sucursal_id: 1, cantidad: 4, vence: '2030-01-10' });   // vence primero
  const b = lotes.registrar({ sku: 'T1', sucursal_id: 1, cantidad: 6, vence: '2030-02-20' });

  const r = existencias.transferStock('T1', 1, 2, 7);
  assert.ok(!r.error, r.error);

  const origen = all(`SELECT id, cantidad FROM lotes WHERE sku='T1' AND sucursal_id=1 ORDER BY vence`);
  assert.deepEqual(origen.map(l => l.cantidad), [0, 3]);               // salieron 4 del primero y 3 del segundo
  const destino = all(`SELECT cantidad, vence FROM lotes WHERE sku='T1' AND sucursal_id=2 ORDER BY vence`);
  assert.deepEqual(destino, [
    { cantidad: 4, vence: '2030-01-10' },
    { cantidad: 3, vence: '2030-02-20' },
  ]);
  assert.equal(existencias.getStock('T1', 1), 3);
  assert.equal(existencias.getStock('T1', 2), 7);
});

test('bajar el stock a un valor fijo (edición de producto) también gasta lotes', () => {
  run(`INSERT INTO products (sku, name, price, stock, sucursal_id) VALUES ('T2','Producto T2',100,10,1)`);
  run(`INSERT OR REPLACE INTO existencias (sku, sucursal_id, stock) VALUES ('T2',1,10)`);
  const x = lotes.registrar({ sku: 'T2', sucursal_id: 1, cantidad: 6, vence: '2030-03-01' });
  existencias.setStock('T2', 1, 7);                                    // de 10 a 7 → se fueron 3
  assert.equal(get(`SELECT cantidad FROM lotes WHERE id = ?`, [x.id]).cantidad, 3);
  existencias.setStock('T2', 1, 20);                                   // subir no crea ni toca lotes
  assert.equal(get(`SELECT cantidad FROM lotes WHERE id = ?`, [x.id]).cantidad, 3);
});
