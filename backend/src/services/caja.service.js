// src/services/caja.service.js
const { get, all, run } = require('../db');

function initCajaSchema() {
  run(`CREATE TABLE IF NOT EXISTS caja (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_open   TEXT    NOT NULL,
    opened_at   TEXT    NOT NULL,
    closed_at   TEXT,
    closed_by   TEXT,
    total_sales REAL    DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'abierta'
  )`);
  try { run(`ALTER TABLE caja ADD COLUMN sucursal_id INTEGER NOT NULL DEFAULT 1`); } catch(e) {}
  try { run(`ALTER TABLE caja ADD COLUMN monto_inicial REAL DEFAULT 0`); } catch(e) {}
}

// Convierte cualquier formato de fecha SQLite a Date válido
function parseSQLiteDate(str) {
  if (!str) return null;
  if (str.includes('+') || str.endsWith('Z')) return new Date(str);
  return new Date(str.replace(' ', 'T') + 'Z'); // "2024-03-11 16:05:00" → ISO
}

function getCurrentCaja(sucursal_id = 1) {
  const caja = get(
    `SELECT * FROM caja WHERE closed_at IS NULL AND sucursal_id = ?
     ORDER BY opened_at DESC LIMIT 1`,
    [Number(sucursal_id)]
  );
  if (caja) {
    // Normalizar fecha para el template
    caja.opened_at = parseSQLiteDate(caja.opened_at)?.toISOString() || caja.opened_at;
  }
  return caja ? { ok: true, caja } : { ok: false };
}

function getLastClosedCaja(sucursal_id = 1) {
  return get(
    `SELECT * FROM caja WHERE closed_at IS NOT NULL AND sucursal_id = ?
     ORDER BY closed_at DESC LIMIT 1`,
    [Number(sucursal_id)]
  );
}

function getLowStockProducts(limit = 10, sucursal_id = null) {
  if (sucursal_id) {
    return all(
      `SELECT name, stock, sucursal_id FROM products
       WHERE stock <= 5 AND sucursal_id = ? ORDER BY stock ASC LIMIT ?`,
      [Number(sucursal_id), limit]
    );
  }
  return all(`SELECT name, stock FROM products WHERE stock <= 5 ORDER BY stock ASC LIMIT ?`, [limit]);
}

function open(user, sucursal_id = 1, monto_inicial = 0) {
  const cajaAbierta = get(
    `SELECT * FROM caja WHERE closed_at IS NULL AND sucursal_id = ?`,
    [Number(sucursal_id)]
  );
  if (cajaAbierta) return { ok: false, error: 'Ya hay una caja abierta en esta sucursal' };
  const res = run(
    `INSERT INTO caja (user_open, opened_at, sucursal_id, monto_inicial) VALUES (?, ?, ?, ?)`,
    [user, new Date().toISOString(), Number(sucursal_id), Number(monto_inicial)]
  );
  return { ok: true, caja_id: res.lastInsertRowid };
}

function close(user, sucursal_id = 1) {
  const cajaAbierta = get(
    `SELECT * FROM caja WHERE closed_at IS NULL AND sucursal_id = ?`,
    [Number(sucursal_id)]
  );
  if (!cajaAbierta) return { ok: false, error: 'No hay caja abierta en esta sucursal' };

  let totalVentas = 0;
  try {
    // Normalizar fecha: quitar Z y offset para comparación correcta con SQLite
    const desdeNorm = cajaAbierta.opened_at
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '')
      .replace('Z', '')
      .replace(/\+\d{2}:\d{2}$/, '');

    const r = get(
      `SELECT COALESCE(SUM(total),0) as total FROM sales
       WHERE sucursal_id = ?
         AND (created_at >= ? OR created_at >= ?)`,
      [Number(sucursal_id), desdeNorm, cajaAbierta.opened_at]
    );
    totalVentas = r?.total || 0;
  } catch(e) {
    try {
      const r = get(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE DATE(created_at) = DATE(?)`, [cajaAbierta.opened_at]);
      totalVentas = r?.total || 0;
    } catch(e2) {}
  }

  run(
    `UPDATE caja SET closed_at=?, closed_by=?, total_sales=?, status='cerrada' WHERE id=?`,
    [new Date().toISOString(), user, totalVentas, cajaAbierta.id]
  );
  return { ok: true };
}

function getMovimientos(caja_id) {
  return all(
    `SELECT * FROM caja_movimientos WHERE caja_id = ? ORDER BY id ASC`,
    [Number(caja_id)]
  );
}

// Historial con fechas normalizadas a ISO para evitar "Invalid Date" en el template
function getHistorial(sucursal_id = null, limit = 50) {
  const where = sucursal_id ? `AND c.sucursal_id = ${Number(sucursal_id)}` : '';
  const rows = all(`
    SELECT c.*,
           COALESCE(su.nombre,'Casa Central') as sucursal_nombre
    FROM caja c
    LEFT JOIN sucursales su ON su.id = c.sucursal_id
    WHERE c.closed_at IS NOT NULL ${where}
    ORDER BY c.closed_at DESC
    LIMIT ?
  `, [limit]);

  return rows.map(r => ({
    ...r,
    opened_at: r.opened_at ? (parseSQLiteDate(r.opened_at)?.toISOString() || r.opened_at) : null,
    closed_at: r.closed_at ? (parseSQLiteDate(r.closed_at)?.toISOString() || r.closed_at) : null,
  }));
}

module.exports = {
  initCajaSchema, getCurrentCaja, getLastClosedCaja,
  getLowStockProducts, open, close, getMovimientos, getHistorial
};
