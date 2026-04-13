// src/services/gastos.service.js
const { get, all, run } = require('../db');

const CATEGORIAS_DEFAULT = [
  'Alquiler', 'Servicios', 'Sueldos', 'Insumos', 'Impuestos', 'Mantenimiento', 'Otros'
];

function initGastosSchema() {
  run(`CREATE TABLE IF NOT EXISTS gastos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria    TEXT NOT NULL DEFAULT 'Otros',
    descripcion  TEXT NOT NULL,
    monto        REAL NOT NULL,
    fecha        TEXT NOT NULL DEFAULT (date('now','localtime')),
    proveedor_id INTEGER,
    comprobante  TEXT,
    metodo_pago  TEXT,
    pagado       INTEGER NOT NULL DEFAULT 0,
    fecha_pago   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  try { run(`ALTER TABLE gastos ADD COLUMN metodo_pago TEXT`); } catch(e) {}
  try { run(`ALTER TABLE gastos ADD COLUMN pagado INTEGER NOT NULL DEFAULT 0`); } catch(e) {}
  try { run(`ALTER TABLE gastos ADD COLUMN fecha_pago TEXT`); } catch(e) {}

  // ── Fondo de caja chica — monto disponible para gastar por período ──
  run(`CREATE TABLE IF NOT EXISTS fondos_caja (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha      TEXT NOT NULL UNIQUE,
    monto      REAL NOT NULL DEFAULT 0,
    descripcion TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
}

function list({ desde, hasta, categoria } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (desde)     { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta)     { where += ' AND fecha <= ?'; params.push(hasta); }
  if (categoria) { where += ' AND categoria = ?'; params.push(categoria); }
  return all(`
    SELECT g.*,
           COALESCE(g.metodo_pago,'')  as metodo_pago,
           COALESCE(g.pagado, 0)       as pagado,
           g.fecha_pago,
           p.nombre as proveedor_nombre
    FROM gastos g
    LEFT JOIN proveedores p ON p.id = g.proveedor_id
    ${where}
    ORDER BY fecha DESC, id DESC
  `, params);
}

function getResumen({ desde, hasta } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (desde) { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta) { where += ' AND fecha <= ?'; params.push(hasta); }
  const total = get(`SELECT COALESCE(SUM(monto),0) as total FROM gastos ${where}`, params)?.total || 0;
  const porCategoria = all(`
    SELECT categoria, COUNT(*) as cantidad, SUM(monto) as total
    FROM gastos ${where}
    GROUP BY categoria ORDER BY total DESC
  `, params);
  return { total, porCategoria };
}

function create({ categoria, descripcion, monto, fecha, proveedor_id, comprobante, metodo_pago, pagado, fecha_pago }) {
  const r = run(
    `INSERT INTO gastos
       (categoria, descripcion, monto, fecha, proveedor_id, comprobante, metodo_pago, pagado, fecha_pago)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      categoria    || 'Otros',
      descripcion,
      Number(monto),
      fecha        || new Date().toISOString().split('T')[0],
      proveedor_id || null,
      comprobante  || null,
      metodo_pago  || null,
      pagado ? 1 : 0,
      pagado ? (fecha_pago || null) : null,
    ]
  );
  return get(`SELECT * FROM gastos WHERE id=?`, [r.lastInsertRowid]);
}

function update(id, f) {
  const g = get(`SELECT * FROM gastos WHERE id=?`, [Number(id)]);
  if (!g) return null;
  run(
    `UPDATE gastos SET
       categoria=?, descripcion=?, monto=?, fecha=?,
       proveedor_id=?, comprobante=?,
       metodo_pago=?, pagado=?, fecha_pago=?
     WHERE id=?`,
    [
      f.categoria    ?? g.categoria,
      f.descripcion  ?? g.descripcion,
      f.monto        ?? g.monto,
      f.fecha        ?? g.fecha,
      f.proveedor_id ?? g.proveedor_id,
      f.comprobante  !== undefined ? (f.comprobante || null) : g.comprobante,
      f.metodo_pago  !== undefined ? (f.metodo_pago || null) : g.metodo_pago,
      f.pagado !== undefined ? (f.pagado ? 1 : 0) : (g.pagado || 0),
      f.pagado
        ? (f.fecha_pago || g.fecha_pago || null)
        : null,
      Number(id),
    ]
  );
  return get(`SELECT * FROM gastos WHERE id=?`, [Number(id)]);
}

function remove(id) { run(`DELETE FROM gastos WHERE id=?`, [Number(id)]); return true; }

function getCategorias() { return CATEGORIAS_DEFAULT; }

// ── Fondo de caja chica ───────────────────────────────────────
function getFondo(fecha) {
  const f = fecha || new Date().toISOString().split('T')[0];
  return get(`SELECT * FROM fondos_caja WHERE fecha = ?`, [f]) || null;
}

function setFondo({ fecha, monto, descripcion }) {
  const f = fecha || new Date().toISOString().split('T')[0];
  const existing = get(`SELECT id FROM fondos_caja WHERE fecha = ?`, [f]);
  if (existing) {
    run(`UPDATE fondos_caja SET monto=?, descripcion=? WHERE fecha=?`,
        [Number(monto), descripcion || null, f]);
  } else {
    run(`INSERT INTO fondos_caja (fecha, monto, descripcion) VALUES (?,?,?)`,
        [f, Number(monto), descripcion || null]);
  }
  return get(`SELECT * FROM fondos_caja WHERE fecha = ?`, [f]);
}

function getGastadoPagado({ desde, hasta } = {}) {
  let where = `WHERE pagado = 1`;
  const params = [];
  if (desde) { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta) { where += ' AND fecha <= ?'; params.push(hasta); }
  const r = get(`SELECT COALESCE(SUM(monto),0) as total FROM gastos ${where}`, params);
  return r?.total || 0;
}

function getResumenCompleto({ desde, hasta } = {}) {
  const fondo     = getFondo(desde || new Date().toISOString().split('T')[0]);
  const gastado   = getGastadoPagado({ desde, hasta });
  const { total, porCategoria } = getResumen({ desde, hasta });
  return {
    fondo,
    montoFondo:   fondo ? fondo.monto : 0,
    gastadoPagado: gastado,
    restante:     fondo ? Math.max(fondo.monto - gastado, 0) : null,
    porcentajeUsado: fondo && fondo.monto > 0 ? Math.min(Math.round((gastado / fondo.monto) * 100), 100) : null,
    total,
    porCategoria,
  };
}

module.exports = { initGastosSchema, list, getResumen, getResumenCompleto, create, update, remove, getCategorias, getFondo, setFondo, getGastadoPagado };
