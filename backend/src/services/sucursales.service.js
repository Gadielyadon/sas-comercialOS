// src/services/sucursales.service.js
const { get, all, run } = require('../db');

// ─────────────────────────────────────────────────────────────
// INIT — crea tablas y agrega columnas si no existen
// ─────────────────────────────────────────────────────────────
function initSucursalesSchema() {
  // Tabla sucursales
  run(`CREATE TABLE IF NOT EXISTS sucursales (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT    NOT NULL,
    direccion   TEXT,
    telefono    TEXT,
    activa      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  // Sucursal principal si no existe
  const existe = get(`SELECT id FROM sucursales WHERE id = 1`);
  if (!existe) {
    run(`INSERT INTO sucursales (id, nombre) VALUES (1, 'Casa Central')`);
  }

  // Agregar sucursal_id a las tablas que corresponde (seguro con try/catch)
  const cols = [
    [`ALTER TABLE users    ADD COLUMN sucursal_id INTEGER NOT NULL DEFAULT 1`],
    [`ALTER TABLE products ADD COLUMN sucursal_id INTEGER NOT NULL DEFAULT 1`],
    [`ALTER TABLE sales    ADD COLUMN sucursal_id INTEGER NOT NULL DEFAULT 1`],
    [`ALTER TABLE caja     ADD COLUMN sucursal_id INTEGER NOT NULL DEFAULT 1`],
  ];
  for (const [sql] of cols) {
    try { run(sql); } catch (e) { /* columna ya existe, ignorar */ }
  }
}

// ─────────────────────────────────────────────────────────────
// CRUD sucursales
// ─────────────────────────────────────────────────────────────
function list() {
  return all(`SELECT * FROM sucursales ORDER BY id ASC`);
}

function findById(id) {
  return get(`SELECT * FROM sucursales WHERE id = ?`, [Number(id)]);
}

function create({ nombre, direccion, telefono }) {
  if (!nombre) throw new Error('nombre es obligatorio');
  const r = run(
    `INSERT INTO sucursales (nombre, direccion, telefono) VALUES (?, ?, ?)`,
    [String(nombre), direccion || null, telefono || null]
  );
  return findById(r.lastInsertRowid);
}

function update(id, { nombre, direccion, telefono, activa }) {
  const s = findById(id);
  if (!s) return null;
  run(`UPDATE sucursales SET nombre=?, direccion=?, telefono=?, activa=? WHERE id=?`, [
    nombre     !== undefined ? String(nombre)    : s.nombre,
    direccion  !== undefined ? direccion         : s.direccion,
    telefono   !== undefined ? telefono          : s.telefono,
    activa     !== undefined ? (activa ? 1 : 0) : s.activa,
    Number(id)
  ]);
  return findById(id);
}

function remove(id) {
  if (Number(id) === 1) return { ok: false, error: 'No se puede eliminar la sucursal principal' };
  // Reasignar users, products, sales, caja a sucursal 1 antes de borrar
  run(`UPDATE users    SET sucursal_id = 1 WHERE sucursal_id = ?`, [Number(id)]);
  run(`UPDATE products SET sucursal_id = 1 WHERE sucursal_id = ?`, [Number(id)]);
  run(`UPDATE sales    SET sucursal_id = 1 WHERE sucursal_id = ?`, [Number(id)]);
  run(`UPDATE caja     SET sucursal_id = 1 WHERE sucursal_id = ?`, [Number(id)]);
  run(`DELETE FROM sucursales WHERE id = ?`, [Number(id)]);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Stats por sucursal (para reportes consolidados)
// ─────────────────────────────────────────────────────────────
function getStats(sucursal_id = null) {
  const where = sucursal_id ? `WHERE s.sucursal_id = ${Number(sucursal_id)}` : '';
  const hoy = new Date().toISOString().split('T')[0];

  const ventasHoy = get(`
    SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count
    FROM sales s
    ${where ? where + ' AND' : 'WHERE'} DATE(s.created_at) = ?
  `, [hoy]);

  const ventasSemana = all(`
    SELECT DATE(s.created_at) as dia, COALESCE(SUM(total),0) as total
    FROM sales s
    ${where}
    AND s.created_at >= datetime('now', '-6 days')
    GROUP BY DATE(s.created_at)
    ORDER BY dia ASC
  `);

  const porMetodo = all(`
    SELECT payment_method, COALESCE(SUM(total),0) as total, COUNT(*) as count
    FROM sales s
    ${where}
    AND DATE(s.created_at) = ?
    GROUP BY payment_method
  `, [hoy]);

  return { ventasHoy, ventasSemana, porMetodo };
}

// Resumen consolidado de TODAS las sucursales (para admin)
function getResumenConsolidado() {
  const sucursales = list();
  return sucursales.map(s => ({
    sucursal: s,
    stats: getStats(s.id)
  }));
}

module.exports = {
  initSucursalesSchema, list, findById, create, update, remove,
  getStats, getResumenConsolidado
};
