// src/services/clientes.service.js
const { get, all, run } = require('../db');

function initClientesSchema() {
  // Solo agrega columnas que pueden faltar en bases existentes
  // No toca lo que ya existe
  ['documento TEXT', 'saldo REAL NOT NULL DEFAULT 0'].forEach(col => {
    try { run(`ALTER TABLE clientes ADD COLUMN ${col}`); } catch(e) {}
  });

  // Tabla movimientos (se crea solo si no existe)
  run(`CREATE TABLE IF NOT EXISTS clientes_movimientos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id  INTEGER NOT NULL,
    tipo        TEXT    NOT NULL CHECK(tipo IN ('cargo','pago')),
    monto       REAL    NOT NULL,
    descripcion TEXT    NOT NULL DEFAULT '',
    sale_id     INTEGER,
    saldo_post  REAL    NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )`);
}

function list() {
  return all(`SELECT * FROM clientes ORDER BY nombre ASC`);
}

// Búsqueda por nombre o documento (solo columnas que existen siempre)
function search(q, limit = 8) {
  const term = `%${q}%`;
  return all(
    `SELECT id, nombre, documento, saldo FROM clientes
     WHERE nombre LIKE ? OR documento LIKE ?
     ORDER BY CASE WHEN nombre LIKE ? THEN 0 ELSE 1 END, nombre ASC
     LIMIT ?`,
    [term, term, `${q}%`, limit]
  );
}

function findById(id) {
  return get(`SELECT * FROM clientes WHERE id = ?`, [Number(id)]);
}

function create({ nombre, documento }) {
  const r = run(
    `INSERT INTO clientes (nombre, documento) VALUES (?, ?)`,
    [String(nombre), documento || null]
  );
  return findById(r.lastInsertRowid);
}

function update(id, fields) {
  const c = findById(id);
  if (!c) return null;
  run(`UPDATE clientes SET nombre=?, documento=? WHERE id=?`,
    [fields.nombre ?? c.nombre, fields.documento ?? c.documento, Number(id)]);
  return findById(id);
}

function remove(id) {
  if (Number(id) === 1) return false;
  const r = run(`DELETE FROM clientes WHERE id = ?`, [Number(id)]);
  return r.changes > 0;
}

function getMovimientos(clienteId) {
  return all(
    `SELECT * FROM clientes_movimientos WHERE cliente_id = ? ORDER BY created_at ASC`,
    [Number(clienteId)]
  );
}

function registrarCargo(clienteId, monto, descripcion = 'Cargo', saleId = null) {
  const c = findById(clienteId);
  if (!c) throw new Error('Cliente no encontrado');
  const nuevoSaldo = (c.saldo || 0) + Number(monto);
  run(`UPDATE clientes SET saldo = ? WHERE id = ?`, [nuevoSaldo, Number(clienteId)]);
  run(
    `INSERT INTO clientes_movimientos (cliente_id, tipo, monto, descripcion, sale_id, saldo_post)
     VALUES (?, 'cargo', ?, ?, ?, ?)`,
    [Number(clienteId), Number(monto), descripcion, saleId || null, nuevoSaldo]
  );
  return findById(clienteId);
}

function registrarPago(clienteId, monto, descripcion = 'Pago') {
  const c = findById(clienteId);
  if (!c) throw new Error('Cliente no encontrado');
  const nuevoSaldo = (c.saldo || 0) - Number(monto);
  run(`UPDATE clientes SET saldo = ? WHERE id = ?`, [nuevoSaldo, Number(clienteId)]);
  run(
    `INSERT INTO clientes_movimientos (cliente_id, tipo, monto, descripcion, saldo_post)
     VALUES (?, 'pago', ?, ?, ?)`,
    [Number(clienteId), Number(monto), descripcion, nuevoSaldo]
  );
  return findById(clienteId);
}

module.exports = {
  initClientesSchema, list, search, findById,
  create, update, remove,
  getMovimientos, registrarCargo, registrarPago
};
