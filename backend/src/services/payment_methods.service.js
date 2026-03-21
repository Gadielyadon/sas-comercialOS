// src/services/payment_methods.service.js
const { all, get, run } = require('../db');

const DEFAULTS = [
  { nombre: 'Efectivo',       icono: 'bi-cash-stack',          color: 'cyan',   tipo: 'efectivo', activo: 1, orden: 1 },
  { nombre: 'Débito',         icono: 'bi-credit-card',         color: 'blue',   tipo: 'otro',     activo: 1, orden: 2 },
  { nombre: 'Crédito',        icono: 'bi-credit-card-2-front', color: 'purple', tipo: 'otro',     activo: 1, orden: 3 },
  { nombre: 'Transferencia',  icono: 'bi-phone',               color: 'green',  tipo: 'otro',     activo: 1, orden: 4 },
  { nombre: 'MercadoPago',    icono: 'bi-qr-code',             color: 'blue',   tipo: 'otro',     activo: 1, orden: 5 },
  { nombre: 'Fiado',          icono: 'bi-clock-history',       color: 'orange', tipo: 'fiado',    activo: 1, orden: 6 },
];

function ensureTable() {
  run(`CREATE TABLE IF NOT EXISTS payment_methods (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL,
    icono   TEXT NOT NULL DEFAULT 'bi-cash',
    color   TEXT NOT NULL DEFAULT 'cyan',
    tipo    TEXT NOT NULL DEFAULT 'otro' CHECK(tipo IN ('efectivo','fiado','otro')),
    activo  INTEGER NOT NULL DEFAULT 1,
    orden   INTEGER NOT NULL DEFAULT 99
  )`);
  const count = get('SELECT COUNT(*) as n FROM payment_methods');
  if (count.n === 0) {
    DEFAULTS.forEach(d => run(
      'INSERT INTO payment_methods (nombre, icono, color, tipo, activo, orden) VALUES (?,?,?,?,?,?)',
      [d.nombre, d.icono, d.color, d.tipo, d.activo, d.orden]
    ));
  }
}

function list() {
  ensureTable();
  return all('SELECT * FROM payment_methods ORDER BY orden ASC, id ASC');
}

function listActive() {
  ensureTable();
  return all('SELECT * FROM payment_methods WHERE activo=1 ORDER BY orden ASC, id ASC');
}

function findById(id) {
  ensureTable();
  return get('SELECT * FROM payment_methods WHERE id=?', [id]);
}

function create({ nombre, icono = 'bi-cash', color = 'cyan', tipo = 'otro', activo = 1, orden = 99 }) {
  ensureTable();
  const r = run(
    'INSERT INTO payment_methods (nombre, icono, color, tipo, activo, orden) VALUES (?,?,?,?,?,?)',
    [nombre, icono, color, tipo, activo ? 1 : 0, orden]
  );
  return findById(r.lastInsertRowid);
}

function update(id, { nombre, icono, color, tipo, activo, orden }) {
  ensureTable();
  const cur = findById(id);
  if (!cur) return null;
  run(
    'UPDATE payment_methods SET nombre=?, icono=?, color=?, tipo=?, activo=?, orden=? WHERE id=?',
    [
      nombre  ?? cur.nombre,
      icono   ?? cur.icono,
      color   ?? cur.color,
      tipo    ?? cur.tipo,
      activo  !== undefined ? (activo ? 1 : 0) : cur.activo,
      orden   ?? cur.orden,
      id
    ]
  );
  return findById(id);
}

function remove(id) {
  ensureTable();
  run('DELETE FROM payment_methods WHERE id=?', [id]);
}

function reorder(ids) {
  // ids: array de ids en el orden deseado
  ensureTable();
  ids.forEach((id, idx) => run('UPDATE payment_methods SET orden=? WHERE id=?', [idx + 1, id]));
}

module.exports = { list, listActive, findById, create, update, remove, reorder };
