const { get, all, run } = require('../db');

// ─────────────────────────────────────────────────────────────
// INIT — crea tablas si no existen
// ─────────────────────────────────────────────────────────────
function initPresupuestosSchema() {
  run(`CREATE TABLE IF NOT EXISTS presupuestos (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    numero             TEXT    NOT NULL UNIQUE,
    cliente_nombre     TEXT    NOT NULL DEFAULT '',
    cliente_cuit       TEXT,
    cliente_email      TEXT,
    cliente_tel        TEXT,
    condicion_pago     TEXT    DEFAULT 'Contado',
    condicion_pago_obs TEXT,
    validez_dias       INTEGER DEFAULT NULL,
    notas              TEXT,
    subtotal           REAL    NOT NULL DEFAULT 0,
    descuento_pct      REAL    NOT NULL DEFAULT 0,
    descuento_monto    REAL    NOT NULL DEFAULT 0,
    total              REAL    NOT NULL DEFAULT 0,
    estado             TEXT    NOT NULL DEFAULT 'Borrador' CHECK(estado IN ('Borrador','Enviado','Aprobado','Rechazado')),
    sucursal_id        INTEGER NOT NULL DEFAULT 1,
    user_id            INTEGER,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS presupuesto_items (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    presupuesto_id      INTEGER NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
    tipo                TEXT    NOT NULL DEFAULT 'producto' CHECK(tipo IN ('producto','servicio','custom')),
    sku                 TEXT,
    nombre              TEXT    NOT NULL,
    descripcion         TEXT,
    cantidad            REAL    NOT NULL DEFAULT 1,
    precio_unitario     REAL    NOT NULL DEFAULT 0,
    descuento_item_pct  REAL    NOT NULL DEFAULT 0,
    pct_iva             REAL    DEFAULT NULL,
    subtotal            REAL    NOT NULL DEFAULT 0
  )`);

  run(`CREATE TABLE IF NOT EXISTS presupuesto_catalogo (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT    NOT NULL,
    descripcion TEXT,
    precio      REAL    NOT NULL DEFAULT 0,
    unidad      TEXT    DEFAULT 'unidad',
    activo      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  // Migraciones seguras — no rompen si la columna ya existe
  try { run(`ALTER TABLE presupuesto_items ADD COLUMN pct_iva REAL DEFAULT NULL`); } catch (e) {}
  try { run(`ALTER TABLE presupuesto_items ADD COLUMN descuento_item_pct REAL DEFAULT 0`); } catch (e) {}
  try { run(`ALTER TABLE presupuestos ADD COLUMN condicion_pago_obs TEXT`); } catch (e) {}
  try { run(`ALTER TABLE products ADD COLUMN precio_presupuesto REAL DEFAULT NULL`); } catch (e) {}
}

// ─────────────────────────────────────────────────────────────
// NÚMERO AUTOMÁTICO — P-0001, P-0002...
// ─────────────────────────────────────────────────────────────
function generarNumero() {
  const ultimo = get(`SELECT numero FROM presupuestos ORDER BY id DESC LIMIT 1`);
  if (!ultimo) return 'P-0001';
  const match = ultimo.numero.match(/(\d+)$/);
  const siguiente = match ? parseInt(match[1], 10) + 1 : 1;
  return 'P-' + String(siguiente).padStart(4, '0');
}

// ─────────────────────────────────────────────────────────────
// CRUD PRESUPUESTOS
// ─────────────────────────────────────────────────────────────
function list(sucursal_id = null, limit = 100) {
  const where = sucursal_id ? `WHERE p.sucursal_id = ${Number(sucursal_id)}` : '';
  return all(`
    SELECT p.*,
           COALESCE(su.nombre, 'Casa Central') as sucursal_nombre,
           (SELECT COUNT(*) FROM presupuesto_items pi WHERE pi.presupuesto_id = p.id) as cant_items
    FROM presupuestos p
    LEFT JOIN sucursales su ON su.id = p.sucursal_id
    ${where}
    ORDER BY p.id DESC
    LIMIT ?
  `, [limit]);
}

function findById(id) {
  const p = get(`
    SELECT p.*, COALESCE(su.nombre,'Casa Central') as sucursal_nombre
    FROM presupuestos p
    LEFT JOIN sucursales su ON su.id = p.sucursal_id
    WHERE p.id = ?
  `, [Number(id)]);

  if (!p) return null;

  p.items = all(`
    SELECT *
    FROM presupuesto_items
    WHERE presupuesto_id = ?
    ORDER BY id ASC
  `, [Number(id)]);

  return p;
}

function calcularTotales(items = [], descuento_pct = 0, descuento_monto = 0) {
  // Subtotal ya con descuentos por ítem aplicados
  const subtotal = items.reduce((s, i) => {
    const base = Number(i.cantidad || 0) * Number(i.precio_unitario || 0);
    const desc = Number(i.descuento_item_pct || 0);
    return s + base * (1 - desc / 100);
  }, 0);

  const totalIva = items.reduce((s, i) => {
    const base = Number(i.cantidad || 0) * Number(i.precio_unitario || 0);
    const desc = Number(i.descuento_item_pct || 0);
    const baseConDesc = base * (1 - desc / 100);
    const pct = (i.pct_iva === null || i.pct_iva === undefined || i.pct_iva === '')
      ? 0
      : Number(i.pct_iva || 0);
    return s + baseConDesc * pct / 100;
  }, 0);

  const dPct   = Number(descuento_pct  || 0);
  const dMonto = Number(descuento_monto || 0);
  const descuento = dMonto > 0 ? dMonto : (subtotal * dPct / 100);
  const total = Math.max(0, subtotal - descuento + totalIva);

  return {
    subtotal,
    totalIva,
    descuento_pct:   dPct,
    descuento_monto: dMonto > 0 ? dMonto : descuento,
    total
  };
}

function create({
  cliente_nombre,
  cliente_cuit,
  cliente_email,
  cliente_tel,
  condicion_pago,
  condicion_pago_obs,
  validez_dias,
  notas,
  descuento_pct,
  descuento_monto,
  sucursal_id,
  user_id,
  items = []
}) {
  const numero = generarNumero();
  const tot = calcularTotales(items, descuento_pct, descuento_monto);

  const r = run(`
    INSERT INTO presupuestos
      (numero, cliente_nombre, cliente_cuit, cliente_email, cliente_tel,
       condicion_pago, condicion_pago_obs, validez_dias, notas,
       subtotal, descuento_pct, descuento_monto, total,
       sucursal_id, user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    numero,
    String(cliente_nombre || 'Sin nombre'),
    cliente_cuit  || null,
    cliente_email || null,
    cliente_tel   || null,
    condicion_pago || 'Contado',
    condicion_pago_obs || null,
    validez_dias ? Number(validez_dias) : null,
    notas || null,
    tot.subtotal,
    tot.descuento_pct,
    tot.descuento_monto,
    tot.total,
    Number(sucursal_id || 1),
    user_id ? Number(user_id) : null
  ]);

  const pid = r.lastInsertRowid;

  for (const item of items) {
    const qty      = Number(item.cantidad || 1);
    const precio   = Number(item.precio_unitario || 0);
    const descItem = Number(item.descuento_item_pct || 0);
    const pctIva   = (item.pct_iva !== null && item.pct_iva !== undefined && item.pct_iva !== '')
      ? Number(item.pct_iva)
      : null;

    run(`
      INSERT INTO presupuesto_items
        (presupuesto_id, tipo, sku, nombre, descripcion, cantidad, precio_unitario, descuento_item_pct, pct_iva, subtotal)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [
      pid,
      item.tipo || 'custom',
      item.sku  || null,
      String(item.nombre || ''),
      item.descripcion || null,
      qty,
      precio,
      descItem,
      pctIva,
      qty * precio * (1 - descItem / 100)
    ]);
  }

  return findById(pid);
}

function update(id, datos) {
  const p = findById(id);
  if (!p) throw new Error('Presupuesto no encontrado');

  const items = datos.items || p.items || [];
  const tot = calcularTotales(
    items,
    datos.descuento_pct   ?? p.descuento_pct   ?? 0,
    datos.descuento_monto ?? p.descuento_monto ?? 0
  );

  run(`
    UPDATE presupuestos SET
      cliente_nombre     = ?,
      cliente_cuit       = ?,
      cliente_email      = ?,
      cliente_tel        = ?,
      condicion_pago     = ?,
      condicion_pago_obs = ?,
      validez_dias       = ?,
      notas              = ?,
      subtotal           = ?,
      descuento_pct      = ?,
      descuento_monto    = ?,
      total              = ?,
      updated_at         = datetime('now','localtime')
    WHERE id = ?
  `, [
    datos.cliente_nombre    ?? p.cliente_nombre,
    datos.cliente_cuit      ?? p.cliente_cuit,
    datos.cliente_email     ?? p.cliente_email,
    datos.cliente_tel       ?? p.cliente_tel,
    datos.condicion_pago    ?? p.condicion_pago,
    datos.condicion_pago_obs ?? p.condicion_pago_obs,
    datos.validez_dias !== undefined ? (datos.validez_dias || null) : p.validez_dias,
    datos.notas ?? p.notas,
    tot.subtotal,
    tot.descuento_pct,
    tot.descuento_monto,
    tot.total,
    Number(id)
  ]);

  if (datos.items) {
    run(`DELETE FROM presupuesto_items WHERE presupuesto_id = ?`, [Number(id)]);

    for (const item of datos.items) {
      const qty      = Number(item.cantidad || 1);
      const precio   = Number(item.precio_unitario || 0);
      const descItem = Number(item.descuento_item_pct || 0);
      const pctIva   = (item.pct_iva !== null && item.pct_iva !== undefined && item.pct_iva !== '')
        ? Number(item.pct_iva)
        : null;

      run(`
        INSERT INTO presupuesto_items
          (presupuesto_id, tipo, sku, nombre, descripcion, cantidad, precio_unitario, descuento_item_pct, pct_iva, subtotal)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `, [
        Number(id),
        item.tipo || 'custom',
        item.sku  || null,
        String(item.nombre || ''),
        item.descripcion || null,
        qty,
        precio,
        descItem,
        pctIva,
        qty * precio * (1 - descItem / 100)
      ]);
    }
  }

  return findById(id);
}

function cambiarEstado(id, estado) {
  const estados = ['Borrador', 'Enviado', 'Aprobado', 'Rechazado'];
  if (!estados.includes(estado)) throw new Error('Estado inválido');

  run(`
    UPDATE presupuestos
    SET estado = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `, [estado, Number(id)]);

  return findById(id);
}

function remove(id) {
  run(`DELETE FROM presupuestos WHERE id = ?`, [Number(id)]);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// CATÁLOGO PROPIO
// ─────────────────────────────────────────────────────────────
function listCatalogo() {
  return all(`
    SELECT *
    FROM presupuesto_catalogo
    WHERE activo = 1
    ORDER BY nombre ASC
  `);
}

function createCatalogo({ nombre, descripcion, precio, unidad }) {
  const r = run(`
    INSERT INTO presupuesto_catalogo (nombre, descripcion, precio, unidad)
    VALUES (?,?,?,?)
  `, [String(nombre), descripcion || null, Number(precio || 0), unidad || 'unidad']);

  return get(`SELECT * FROM presupuesto_catalogo WHERE id = ?`, [r.lastInsertRowid]);
}

function updateCatalogo(id, { nombre, descripcion, precio, unidad, activo }) {
  const c = get(`SELECT * FROM presupuesto_catalogo WHERE id = ?`, [Number(id)]);
  if (!c) throw new Error('Ítem no encontrado');

  run(`
    UPDATE presupuesto_catalogo
    SET nombre = ?, descripcion = ?, precio = ?, unidad = ?, activo = ?
    WHERE id = ?
  `, [
    nombre      ?? c.nombre,
    descripcion ?? c.descripcion,
    Number(precio ?? c.precio),
    unidad  ?? c.unidad,
    activo !== undefined ? (activo ? 1 : 0) : c.activo,
    Number(id)
  ]);

  return get(`SELECT * FROM presupuesto_catalogo WHERE id = ?`, [Number(id)]);
}

function deleteCatalogo(id) {
  run(`DELETE FROM presupuesto_catalogo WHERE id = ?`, [Number(id)]);
  return { ok: true };
}

// Productos del sistema con precio_presupuesto
function getProductosConPrecioB(sucursal_id = null) {
  return all(`
    SELECT id,
           sku,
           name,
           price as precio_venta,
           COALESCE(precio_presupuesto, price) as precio_presupuesto,
           stock,
           category
    FROM products
    WHERE stock >= 0
    ORDER BY name ASC
  `);
}

module.exports = {
  initPresupuestosSchema,
  list,
  findById,
  create,
  update,
  cambiarEstado,
  remove,
  listCatalogo,
  createCatalogo,
  updateCatalogo,
  deleteCatalogo,
  getProductosConPrecioB
};
