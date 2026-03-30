const { get, all, run } = require('../db');

function initPromoSchema() {
  try { run(`ALTER TABLE products ADD COLUMN price_promo REAL DEFAULT NULL`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN en_promo INTEGER DEFAULT 0`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN descripcion TEXT DEFAULT NULL`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN sucursal_id INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN price_cost REAL DEFAULT NULL`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN margen REAL DEFAULT NULL`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN iva REAL DEFAULT 0`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN ieps REAL DEFAULT 0`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN pesable INTEGER DEFAULT 0`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN imagen TEXT DEFAULT NULL`); } catch (_) {}
  // ── Precio mayorista ──────────────────────────────────────────
  try { run(`ALTER TABLE products ADD COLUMN price_mayorista REAL DEFAULT NULL`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN qty_mayorista INTEGER DEFAULT NULL`); } catch (_) {}
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toBoolInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  return Number(value) ? 1 : 0;
}

function baseSelect() {
  return `
    SELECT
      id,
      sku,
      name,
      price,
      COALESCE(price_promo, NULL) AS price_promo,
      COALESCE(en_promo, 0) AS en_promo,
      COALESCE(descripcion, NULL) AS descripcion,
      stock,
      category,
      sucursal_id,
      COALESCE(price_cost, NULL) AS price_cost,
      COALESCE(margen, NULL) AS margen,
      COALESCE(iva, 0) AS iva,
      COALESCE(ieps, 0) AS ieps,
      COALESCE(pesable, 0) AS pesable,
      COALESCE(imagen, NULL) AS imagen,
      COALESCE(price_mayorista, NULL) AS price_mayorista,
      COALESCE(qty_mayorista, NULL)   AS qty_mayorista,
      COALESCE(hay, 1) AS hay
    FROM products
  `;
}

function withPrecioEfectivo(row) {
  if (!row) return null;
  return {
    ...row,
    precio_efectivo: row.en_promo && row.price_promo ? row.price_promo : row.price,
  };
}

// LIST
function list(sucursal_id = null) {
  const sqlBase = baseSelect();

  const rows = sucursal_id
    ? all(
        `${sqlBase} WHERE sucursal_id = ? ORDER BY name ASC`,
        [Number(sucursal_id)]
      )
    : all(`${sqlBase} ORDER BY name ASC`);

  return rows.map(withPrecioEfectivo);
}

// SEARCH
function search(q, limit = 8, sucursal_id = null) {
  const term = `%${q}%`;
  const suc = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}` : '';

  const rows = all(
    `
    ${baseSelect()}
    WHERE (name LIKE ? OR sku LIKE ?) AND stock > 0 ${suc}
    ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name ASC
    LIMIT ?
    `,
    [term, term, `${q}%`, limit]
  );

  return rows.map(withPrecioEfectivo);
}

function findBySku(sku, sucursal_id = null) {
  const suc = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}` : '';

  const p = get(
    `
    ${baseSelect()}
    WHERE sku = ? ${suc}
    ORDER BY CASE WHEN sucursal_id = ? THEN 0 ELSE 1 END
    LIMIT 1
    `,
    [String(sku), sucursal_id ? Number(sucursal_id) : 0]
  );

  return withPrecioEfectivo(p);
}

function create({
  sku,
  name,
  price,
  category,
  stock,
  iva = 0,
  ieps = 0,
  pesable = 0,
  descripcion = null,
  sucursal_id = 1,
  price_cost = null,
  margen = null,
  price_promo = null,
  en_promo = 0,
  imagen = null,
  price_mayorista = null,
  qty_mayorista = null,
}) {
  const suc = Number(sucursal_id || 1);

  run(
    `
    INSERT INTO products (
      sku, name, price, category, stock,
      iva, ieps, pesable,
      descripcion, sucursal_id,
      price_cost, margen,
      price_promo, en_promo, imagen,
      price_mayorista, qty_mayorista
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      String(sku),
      String(name),
      toNumber(price),
      category || null,
      toNumber(stock),
      toNumber(iva, 0),
      toNumber(ieps, 0),
      toBoolInt(pesable, 0),
      descripcion || null,
      suc,
      toNullableNumber(price_cost),
      toNullableNumber(margen),
      toNullableNumber(price_promo),
      toBoolInt(en_promo, 0),
      imagen || null,
      toNullableNumber(price_mayorista),
      toNullableNumber(qty_mayorista),
    ]
  );

  return findBySku(sku, suc);
}

function updateBySku(sku, fields, sucursal_id = null) {
  const p = findBySku(sku, sucursal_id);
  if (!p) return null;

  const targetSucursal = fields.sucursal_id !== undefined && fields.sucursal_id !== null
    ? Number(fields.sucursal_id)
    : (p.sucursal_id || 1);

  const name        = fields.name        !== undefined ? String(fields.name)                  : p.name;
  const price       = fields.price       !== undefined ? toNumber(fields.price)                : p.price;
  const category    = fields.category    !== undefined ? fields.category                       : p.category;
  const stock       = fields.stock       !== undefined ? toNumber(fields.stock)                : p.stock;
  const descripcion = fields.descripcion !== undefined ? fields.descripcion                    : p.descripcion;
  const price_cost  = fields.price_cost  !== undefined ? toNullableNumber(fields.price_cost)  : p.price_cost;
  const margen      = fields.margen      !== undefined ? toNullableNumber(fields.margen)      : p.margen;
  const iva         = fields.iva         !== undefined ? toNumber(fields.iva, 0)               : toNumber(p.iva, 0);
  const ieps        = fields.ieps        !== undefined ? toNumber(fields.ieps, 0)              : toNumber(p.ieps, 0);
  const pesable     = fields.pesable     !== undefined ? toBoolInt(fields.pesable, 0)          : toBoolInt(p.pesable, 0);
  const price_promo = fields.price_promo !== undefined ? toNullableNumber(fields.price_promo) : p.price_promo;
  const en_promo    = fields.en_promo    !== undefined ? toBoolInt(fields.en_promo, 0)         : toBoolInt(p.en_promo, 0);
  const imagen      = fields.imagen      !== undefined ? fields.imagen                         : p.imagen;
  const newSku      = fields.sku !== undefined && fields.sku !== null && String(fields.sku).trim() !== ''
    ? String(fields.sku).trim()
    : String(sku);
  // ── Mayorista ──────────────────────────────────────────────
  const price_mayorista = fields.price_mayorista !== undefined
    ? toNullableNumber(fields.price_mayorista)
    : p.price_mayorista;
  const qty_mayorista = fields.qty_mayorista !== undefined
    ? toNullableNumber(fields.qty_mayorista)
    : p.qty_mayorista;

  run(
    `
    UPDATE products
    SET
      sku = ?,
      name = ?,
      price = ?,
      category = ?,
      stock = ?,
      descripcion = ?,
      price_cost = ?,
      margen = ?,
      iva = ?,
      ieps = ?,
      pesable = ?,
      price_promo = ?,
      en_promo = ?,
      sucursal_id = ?,
      imagen = ?,
      price_mayorista = ?,
      qty_mayorista = ?
    WHERE sku = ? AND sucursal_id = ?
    `,
    [
      newSku,
      name,
      price,
      category,
      stock,
      descripcion,
      price_cost,
      margen,
      iva,
      ieps,
      pesable,
      price_promo,
      en_promo,
      targetSucursal,
      imagen || null,
      price_mayorista,
      qty_mayorista,
      String(sku),
      p.sucursal_id || 1,
    ]
  );

  return findBySku(newSku, targetSucursal);
}

function adjustStock(sku, delta, sucursal_id = null) {
  const p = findBySku(sku, sucursal_id);
  if (!p) return { error: 'Producto no encontrado' };

  const newStock = toNumber(p.stock) + toNumber(delta);
  if (newStock < 0) {
    return { error: `Stock insuficiente. Disponible: ${p.stock}` };
  }

  run(
    `UPDATE products SET stock = ? WHERE sku = ? AND sucursal_id = ?`,
    [newStock, String(sku), p.sucursal_id || 1]
  );

  return findBySku(sku, sucursal_id);
}

function remove(sku, sucursal_id = null) {
  const p = findBySku(sku, sucursal_id);
  if (!p) return false;

  const r = run(
    `DELETE FROM products WHERE sku = ? AND sucursal_id = ?`,
    [String(sku), p.sucursal_id || 1]
  );

  return r.changes > 0;
}

function exportCsv(sucursal_id = null) {
  const rows = list(sucursal_id);
  const header = 'sku,name,price,stock,category,iva,ieps,pesable,price_mayorista,qty_mayorista';

  return [
    header,
    ...rows.map((r) =>
      [
        r.sku,
        `"${r.name}"`,
        r.price,
        r.stock,
        r.category ?? '',
        r.iva ?? 0,
        r.ieps ?? 0,
        r.pesable ?? 0,
        r.price_mayorista ?? '',
        r.qty_mayorista ?? '',
      ].join(',')
    ),
  ].join('\n');
}

function listLowStock(limit = 10, sucursal_id = null) {
  if (sucursal_id) {
    return all(
      `SELECT name, stock FROM products WHERE stock <= 5 AND sucursal_id = ? ORDER BY stock ASC LIMIT ?`,
      [Number(sucursal_id), limit]
    );
  }

  return all(
    `SELECT name, stock FROM products WHERE stock <= 5 ORDER BY stock ASC LIMIT ?`,
    [limit]
  );
}

module.exports = {
  initPromoSchema,
  list,
  search,
  findBySku,
  create,
  updateBySku,
  adjustStock,
  remove,
  exportCsv,
  listLowStock,
};
