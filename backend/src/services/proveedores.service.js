// src/services/proveedores.service.js
const { get, all, run } = require('../db');

function initProveedoresSchema() {
  run(`CREATE TABLE IF NOT EXISTS proveedores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre     TEXT NOT NULL,
    cuit       TEXT,
    telefono   TEXT,
    email      TEXT,
    rubro      TEXT,
    notas      TEXT,
    saldo      REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS proveedores_movimientos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id INTEGER NOT NULL,
    tipo         TEXT NOT NULL CHECK(tipo IN ('factura','pago','nota')),
    descripcion  TEXT NOT NULL DEFAULT '',
    nro_factura  TEXT,
    monto        REAL NOT NULL,
    saldo_post   REAL NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
  )`);
}

function list()       { return all(`SELECT * FROM proveedores ORDER BY nombre ASC`); }
function findById(id) { return get(`SELECT * FROM proveedores WHERE id=?`, [Number(id)]); }

function search(q) {
  const t = `%${q}%`;
  return all(
    `SELECT * FROM proveedores WHERE nombre LIKE ? OR cuit LIKE ? OR rubro LIKE ? ORDER BY nombre ASC`,
    [t, t, t]
  );
}

function create({ nombre, cuit, telefono, email, rubro, notas }) {
  const r = run(
    `INSERT INTO proveedores (nombre,cuit,telefono,email,rubro,notas) VALUES (?,?,?,?,?,?)`,
    [nombre, cuit || null, telefono || null, email || null, rubro || null, notas || null]
  );
  return findById(r.lastInsertRowid);
}

function update(id, f) {
  const p = findById(id);
  if (!p) return null;
  run(
    `UPDATE proveedores SET nombre=?,cuit=?,telefono=?,email=?,rubro=?,notas=? WHERE id=?`,
    [f.nombre ?? p.nombre, f.cuit ?? p.cuit, f.telefono ?? p.telefono,
     f.email ?? p.email, f.rubro ?? p.rubro, f.notas ?? p.notas, Number(id)]
  );
  return findById(id);
}

function remove(id) {
  run(`DELETE FROM proveedores_movimientos WHERE proveedor_id=?`, [Number(id)]);
  run(`DELETE FROM proveedores WHERE id=?`, [Number(id)]);
  return true;
}

function getMovimientos(proveedorId) {
  return all(
    `SELECT * FROM proveedores_movimientos WHERE proveedor_id=? ORDER BY created_at DESC`,
    [Number(proveedorId)]
  );
}

function registrarFactura(proveedorId, monto, descripcion = 'Factura', nro_factura = null) {
  const p = findById(proveedorId);
  if (!p) throw new Error('No encontrado');
  const nuevoSaldo = (p.saldo || 0) + Number(monto);
  run(`UPDATE proveedores SET saldo=? WHERE id=?`, [nuevoSaldo, Number(proveedorId)]);
  run(
    `INSERT INTO proveedores_movimientos (proveedor_id,tipo,descripcion,nro_factura,monto,saldo_post) VALUES (?,?,?,?,?,?)`,
    [Number(proveedorId), 'factura', descripcion, nro_factura || null, Number(monto), nuevoSaldo]
  );
  return findById(proveedorId);
}

function registrarPago(proveedorId, monto, descripcion = 'Pago') {
  const p = findById(proveedorId);
  if (!p) throw new Error('No encontrado');
  const nuevoSaldo = (p.saldo || 0) - Number(monto);
  run(`UPDATE proveedores SET saldo=? WHERE id=?`, [nuevoSaldo, Number(proveedorId)]);
  run(
    `INSERT INTO proveedores_movimientos (proveedor_id,tipo,descripcion,monto,saldo_post) VALUES (?,?,?,?,?)`,
    [Number(proveedorId), 'pago', descripcion, Number(monto), nuevoSaldo]
  );
  return findById(proveedorId);
}

module.exports = {
  initProveedoresSchema, list, findById, search,
  create, update, remove, getMovimientos,
  registrarFactura, registrarPago
};
