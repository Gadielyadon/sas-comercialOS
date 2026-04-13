const { get, all, run } = require('../db');

function initCajaSchema() {
  run(`CREATE TABLE IF NOT EXISTS caja (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_open     TEXT    NOT NULL,
    opened_at     TEXT    NOT NULL,
    closed_at     TEXT,
    closed_by     TEXT,
    total_sales   REAL    DEFAULT 0,
    status        TEXT    NOT NULL DEFAULT 'abierta'
  )`);
  try { run(`ALTER TABLE caja ADD COLUMN sucursal_id INTEGER NOT NULL DEFAULT 1`); } catch(e) {}
  try { run(`ALTER TABLE caja ADD COLUMN monto_inicial REAL DEFAULT 0`); } catch(e) {}
  try { run(`ALTER TABLE caja ADD COLUMN monto_final REAL DEFAULT 0`); } catch(e) {}

  // ── Tabla de movimientos manuales (ingresos/retiros) ──────────
  run(`CREATE TABLE IF NOT EXISTS caja_movimientos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    caja_id     INTEGER NOT NULL,
    tipo        TEXT    NOT NULL CHECK(tipo IN ('ingreso','retiro')),
    monto       REAL    NOT NULL DEFAULT 0,
    descripcion TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (caja_id) REFERENCES caja(id)
  )`);
}

// ── Hora Argentina — funciona en VPS con cualquier timezone ──
// Si el servidor tiene TZ=America/Argentina/Buenos_Aires configurado,
// usamos eso. Si no, forzamos UTC-3 manualmente.
function nowArgentina() {
  try {
    // Intenta con Intl — funciona si el VPS tiene la zona configurada
    const str = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(new Date()).replace('T', ' ');
    return str.substring(0, 19);
  } catch(e) {
    // Fallback manual UTC-3
    const now = new Date();
    const local = new Date(now.getTime() + (-3 * 60 * 60 * 1000));
    return local.toISOString().replace('T', ' ').substring(0, 19);
  }
}

// parse local sin forzar UTC
function parseSQLiteDate(str) {
  if (!str) return null;
  if (str.includes('T') || str.endsWith('Z') || str.includes('+')) return new Date(str);
  return new Date(String(str).replace(' ', 'T'));
}

function getCurrentCaja(sucursal_id = 1) {
  const caja = get(
    `SELECT * FROM caja
     WHERE closed_at IS NULL AND sucursal_id = ?
     ORDER BY opened_at DESC
     LIMIT 1`,
    [Number(sucursal_id)]
  );

  if (caja) {
    caja.opened_at = parseSQLiteDate(caja.opened_at)?.toISOString() || caja.opened_at;
  }

  return caja ? { ok: true, caja } : { ok: false };
}

function getLastClosedCaja(sucursal_id = 1) {
  return get(
    `SELECT * FROM caja
     WHERE closed_at IS NOT NULL AND sucursal_id = ?
     ORDER BY closed_at DESC
     LIMIT 1`,
    [Number(sucursal_id)]
  );
}

function getLowStockProducts(limit = 10, sucursal_id = null) {
  if (sucursal_id) {
    return all(
      `SELECT name, stock, sucursal_id
       FROM products
       WHERE stock <= 5 AND sucursal_id = ?
       ORDER BY stock ASC
       LIMIT ?`,
      [Number(sucursal_id), limit]
    );
  }

  return all(
    `SELECT name, stock
     FROM products
     WHERE stock <= 5
     ORDER BY stock ASC
     LIMIT ?`,
    [limit]
  );
}

function open(user, sucursal_id = 1, monto_inicial = 0) {
  const cajaAbierta = get(
    `SELECT * FROM caja WHERE closed_at IS NULL AND sucursal_id = ?`,
    [Number(sucursal_id)]
  );

  if (cajaAbierta) {
    return { ok: false, error: 'Ya hay una caja abierta en esta sucursal' };
  }

  const res = run(
    `INSERT INTO caja (user_open, opened_at, sucursal_id, monto_inicial)
     VALUES (?, ?, ?, ?)`,
    [user, nowArgentina(), Number(sucursal_id), Number(monto_inicial)]
  );

  return { ok: true, caja_id: res.lastInsertRowid };
}

function close(user, sucursal_id = 1) {
  const cajaAbierta = get(
    `SELECT * FROM caja WHERE closed_at IS NULL AND sucursal_id = ?`,
    [Number(sucursal_id)]
  );

  if (!cajaAbierta) {
    return { ok: false, error: 'No hay caja abierta en esta sucursal' };
  }

  let totalVentas = 0;

  try {
    const hasta = nowArgentina();

    const r = get(
      `SELECT COALESCE(SUM(total), 0) AS total
       FROM sales
       WHERE sucursal_id = ?
         AND created_at >= ?
         AND created_at <= ?`,
      [Number(sucursal_id), cajaAbierta.opened_at, hasta]
    );

    totalVentas = Number(r?.total || 0);
  } catch (e) {
    totalVentas = 0;
  }

  run(
    `UPDATE caja
     SET closed_at = ?, closed_by = ?, total_sales = ?, status = 'cerrada'
     WHERE id = ?`,
    [nowArgentina(), user, totalVentas, cajaAbierta.id]
  );

  return { ok: true };
}

function getMovimientos(caja_id) {
  return all(
    `SELECT * FROM caja_movimientos WHERE caja_id = ? ORDER BY id ASC`,
    [Number(caja_id)]
  );
}

function getHistorial(sucursal_id = null, limit = 50) {
  const where = sucursal_id ? `AND c.sucursal_id = ${Number(sucursal_id)}` : '';

  const rows = all(
    `SELECT c.*,
            COALESCE(su.nombre, 'Casa Central') AS sucursal_nombre
     FROM caja c
     LEFT JOIN sucursales su ON su.id = c.sucursal_id
     WHERE c.closed_at IS NOT NULL ${where}
     ORDER BY c.closed_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map(r => ({
    ...r,
    opened_at: r.opened_at ? (parseSQLiteDate(r.opened_at)?.toISOString() || r.opened_at) : null,
    closed_at: r.closed_at ? (parseSQLiteDate(r.closed_at)?.toISOString() || r.closed_at) : null,
  }));
}

module.exports = {
  initCajaSchema,
  getCurrentCaja,
  getLastClosedCaja,
  getLowStockProducts,
  open,
  close,
  getMovimientos,
  getHistorial
};