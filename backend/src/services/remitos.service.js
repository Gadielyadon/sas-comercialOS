const { get, all, run } = require('../db');

// ─────────────────────────────────────────────────────────────
// INIT — crea tablas si no existen
// ─────────────────────────────────────────────────────────────
function initRemitosSchema() {
  run(`CREATE TABLE IF NOT EXISTS remitos (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    numero             TEXT    NOT NULL UNIQUE,
    presupuesto_id     INTEGER REFERENCES presupuestos(id),
    cliente_nombre     TEXT    NOT NULL DEFAULT '',
    cliente_cuit       TEXT,
    cliente_direccion  TEXT,
    cliente_email      TEXT,
    cliente_tel        TEXT,
    notas              TEXT,
    estado             TEXT    NOT NULL DEFAULT 'Emitido' CHECK(estado IN ('Emitido','Entregado','Anulado')),
    sucursal_id        INTEGER NOT NULL DEFAULT 1,
    user_id            INTEGER,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS remito_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    remito_id     INTEGER NOT NULL REFERENCES remitos(id) ON DELETE CASCADE,
    sku           TEXT,
    nombre        TEXT    NOT NULL,
    descripcion   TEXT,
    cantidad      REAL    NOT NULL DEFAULT 1,
    unidad        TEXT    DEFAULT 'unidad',
    orden         INTEGER NOT NULL DEFAULT 0
  )`);

  // Migración: si alguien ya tenía una versión vieja sin presupuesto_id
  try {
    const cols = all(`PRAGMA table_info(remitos)`).map(c => c.name);
    if (!cols.includes('presupuesto_id')) run(`ALTER TABLE remitos ADD COLUMN presupuesto_id INTEGER`);
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────
// NÚMERO AUTOMÁTICO — R-0001, R-0002...
// ─────────────────────────────────────────────────────────────
function generarNumero() {
  const ultimo = get(`SELECT numero FROM remitos ORDER BY id DESC LIMIT 1`);
  if (!ultimo) return 'R-0001';
  const match = ultimo.numero.match(/(\d+)$/);
  const siguiente = match ? parseInt(match[1], 10) + 1 : 1;
  return 'R-' + String(siguiente).padStart(4, '0');
}

// ─────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────
function list(sucursal_id = null, limit = 200) {
  const where = sucursal_id ? `WHERE r.sucursal_id = ${Number(sucursal_id)}` : '';
  return all(`
    SELECT r.*,
           (SELECT COUNT(*) FROM remito_items ri WHERE ri.remito_id = r.id) as cant_items,
           p.numero as presupuesto_numero
    FROM remitos r
    LEFT JOIN presupuestos p ON p.id = r.presupuesto_id
    ${where}
    ORDER BY r.id DESC
    LIMIT ${Number(limit)}
  `);
}

function getById(id) {
  const remito = get(`SELECT * FROM remitos WHERE id = ?`, [id]);
  if (!remito) return null;
  remito.items = all(`SELECT * FROM remito_items WHERE remito_id = ? ORDER BY orden, id`, [id]);
  if (remito.presupuesto_id) {
    remito.presupuesto = get(`SELECT id, numero FROM presupuestos WHERE id = ?`, [remito.presupuesto_id]);
  }
  return remito;
}

function crear({ presupuesto_id, cliente_nombre, cliente_cuit, cliente_direccion, cliente_email, cliente_tel, notas, items, sucursal_id, user_id }) {
  const numero = generarNumero();
  const r = run(`
    INSERT INTO remitos
      (numero, presupuesto_id, cliente_nombre, cliente_cuit, cliente_direccion, cliente_email, cliente_tel, notas, sucursal_id, user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `, [
    numero,
    presupuesto_id || null,
    cliente_nombre || '',
    cliente_cuit || null,
    cliente_direccion || null,
    cliente_email || null,
    cliente_tel || null,
    notas || null,
    sucursal_id || 1,
    user_id || null,
  ]);

  const remitoId = r.lastInsertRowid;
  (items || []).forEach((it, i) => {
    run(`
      INSERT INTO remito_items (remito_id, sku, nombre, descripcion, cantidad, unidad, orden)
      VALUES (?,?,?,?,?,?,?)
    `, [remitoId, it.sku || null, it.nombre || '', it.descripcion || null, Number(it.cantidad) || 1, it.unidad || 'unidad', i]);
  });

  return getById(remitoId);
}

// Arma los datos iniciales de un remito a partir de un presupuesto ya
// aprobado — copia cliente e ítems (sin precios).
function desdePresupuesto(presupuesto_id) {
  const pres = get(`SELECT * FROM presupuestos WHERE id = ?`, [presupuesto_id]);
  if (!pres) return null;
  const items = all(`SELECT * FROM presupuesto_items WHERE presupuesto_id = ? ORDER BY id`, [presupuesto_id]);
  return {
    presupuesto_id: pres.id,
    presupuesto_numero: pres.numero,
    cliente_nombre: pres.cliente_nombre,
    cliente_cuit: pres.cliente_cuit,
    cliente_email: pres.cliente_email,
    cliente_tel: pres.cliente_tel,
    items: items.map(it => ({
      sku: it.sku,
      nombre: it.nombre,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      unidad: 'unidad',
    })),
  };
}

function actualizarEstado(id, estado) {
  if (!['Emitido', 'Entregado', 'Anulado'].includes(estado)) throw new Error('Estado inválido');
  run(`UPDATE remitos SET estado = ?, updated_at = datetime('now','localtime') WHERE id = ?`, [estado, id]);
  return getById(id);
}

function eliminar(id) {
  run(`DELETE FROM remitos WHERE id = ?`, [id]);
}

module.exports = {
  initRemitosSchema,
  generarNumero,
  list,
  getById,
  crear,
  desdePresupuesto,
  actualizarEstado,
  eliminar,
};