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
  try { run(`ALTER TABLE products ADD COLUMN price_mayorista REAL DEFAULT NULL`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN qty_mayorista INTEGER DEFAULT NULL`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN venta_sin_stock INTEGER DEFAULT 0`); } catch (_) {}
  try { run(`ALTER TABLE products ADD COLUMN price_tarjeta REAL DEFAULT NULL`); } catch (_) {}
  // Índice en sku para acelerar findBySku
  try { run(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`); } catch (_) {}
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
      id, sku, name, price,
      COALESCE(price_promo, NULL) AS price_promo,
      COALESCE(en_promo, 0) AS en_promo,
      COALESCE(descripcion, NULL) AS descripcion,
      stock, category, sucursal_id,
      COALESCE(price_cost, NULL) AS price_cost,
      COALESCE(margen, NULL) AS margen,
      COALESCE(iva, 0) AS iva,
      COALESCE(ieps, 0) AS ieps,
      COALESCE(pesable, 0) AS pesable,
      COALESCE(imagen, NULL) AS imagen,
      COALESCE(price_mayorista, NULL) AS price_mayorista,
      COALESCE(qty_mayorista, NULL) AS qty_mayorista,
      COALESCE(hay, 1) AS hay,
      COALESCE(venta_sin_stock, 0) AS venta_sin_stock,
      COALESCE(price_tarjeta, NULL) AS price_tarjeta
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

// ── Prepared statements para queries frecuentes ──────────────
let _stmtListAll = null;
let _stmtListSuc = null;
let _stmtFindSku = null;

function _getStmtListAll() {
  if (!_stmtListAll) _stmtListAll = require('../db').db.prepare(`${baseSelect()} ORDER BY name ASC`);
  return _stmtListAll;
}
function _getStmtListSuc() {
  if (!_stmtListSuc) _stmtListSuc = require('../db').db.prepare(`${baseSelect()} WHERE sucursal_id = ? ORDER BY name ASC`);
  return _stmtListSuc;
}
function _getStmtFindSku() {
  if (!_stmtFindSku) _stmtFindSku = require('../db').db.prepare(`${baseSelect()} WHERE sku = ? LIMIT 1`);
  return _stmtFindSku;
}

function list(sucursal_id = null) {
  const rows = sucursal_id
    ? _getStmtListSuc().all(Number(sucursal_id))
    : _getStmtListAll().all();
  return rows.map(withPrecioEfectivo);
}

function search(q, limit = 8, sucursal_id = null) {
  const term = `%${q}%`;
  const suc = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}` : '';
  const rows = all(
    `${baseSelect()} WHERE (name LIKE ? OR sku LIKE ?) AND stock > 0 ${suc}
     ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name ASC LIMIT ?`,
    [term, term, `${q}%`, limit]
  );
  return rows.map(withPrecioEfectivo);
}

function findBySku(sku, sucursal_id = null) {
  // Para la búsqueda directa por SKU exacto usamos prepared statement
  // Si hay sucursal filtramos después (raro, la mayoría de calls no la pasan)
  const p = _getStmtFindSku().get(String(sku));
  if (!p) return null;
  if (sucursal_id && p.sucursal_id && p.sucursal_id !== Number(sucursal_id)) return null;
  return withPrecioEfectivo(p);
}

function create({
  sku, name, price, category, stock,
  iva = 0, ieps = 0, pesable = 0,
  descripcion = null, sucursal_id = 1,
  price_cost = null, margen = null,
  price_promo = null, en_promo = 0,
  imagen = null, price_mayorista = null,
  qty_mayorista = null, venta_sin_stock = 0, hay = 1,
  price_tarjeta = null,
}) {
  const suc = Number(sucursal_id || 1);
  run(
    `INSERT INTO products (
      sku, name, price, category, stock,
      iva, ieps, pesable, descripcion, sucursal_id,
      price_cost, margen, price_promo, en_promo, imagen,
      price_mayorista, qty_mayorista, venta_sin_stock, price_tarjeta, hay
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(sku), String(name), toNumber(price),
      category || null, toNumber(stock),
      toNumber(iva, 0), toNumber(ieps, 0), toBoolInt(pesable, 0),
      descripcion || null, suc,
      toNullableNumber(price_cost), toNullableNumber(margen),
      toNullableNumber(price_promo), toBoolInt(en_promo, 0),
      imagen || null,
      toNullableNumber(price_mayorista), toNullableNumber(qty_mayorista),
      toBoolInt(venta_sin_stock, 0), toNullableNumber(price_tarjeta),
      hay !== undefined ? toBoolInt(hay, 1) : 1,
    ]
  );
  // Una sola findBySku al final — sin verificación previa
  return findBySku(sku, suc);
}

function updateBySku(sku, fields, sucursal_id = null) {
  // Una sola findBySku para leer el estado actual
  const p = findBySku(sku, sucursal_id);
  if (!p) return null;

  const targetSucursal = fields.sucursal_id !== undefined && fields.sucursal_id !== null
    ? Number(fields.sucursal_id) : (p.sucursal_id || 1);

  const newSku = fields.sku !== undefined && fields.sku !== null && String(fields.sku).trim() !== ''
    ? String(fields.sku).trim() : String(sku);

  run(
    `UPDATE products SET
      sku = ?, name = ?, price = ?, category = ?, stock = ?,
      descripcion = ?, price_cost = ?, margen = ?,
      iva = ?, ieps = ?, pesable = ?,
      price_promo = ?, en_promo = ?,
      sucursal_id = ?, imagen = ?,
      price_mayorista = ?, qty_mayorista = ?, venta_sin_stock = ?,
      price_tarjeta = ?, hay = ?
    WHERE sku = ? AND sucursal_id = ?`,
    [
      newSku,
      fields.name       !== undefined ? String(fields.name)                 : p.name,
      fields.price      !== undefined ? toNumber(fields.price)               : p.price,
      fields.category   !== undefined ? fields.category                      : p.category,
      fields.stock      !== undefined ? toNumber(fields.stock)               : p.stock,
      fields.descripcion!== undefined ? fields.descripcion                   : p.descripcion,
      fields.price_cost !== undefined ? toNullableNumber(fields.price_cost)  : p.price_cost,
      fields.margen     !== undefined ? toNullableNumber(fields.margen)      : p.margen,
      fields.iva        !== undefined ? toNumber(fields.iva, 0)              : toNumber(p.iva, 0),
      fields.ieps       !== undefined ? toNumber(fields.ieps, 0)             : toNumber(p.ieps, 0),
      fields.pesable    !== undefined ? toBoolInt(fields.pesable, 0)         : toBoolInt(p.pesable, 0),
      fields.price_promo!== undefined ? toNullableNumber(fields.price_promo) : p.price_promo,
      fields.en_promo   !== undefined ? toBoolInt(fields.en_promo, 0)        : toBoolInt(p.en_promo, 0),
      targetSucursal,
      fields.imagen     !== undefined ? fields.imagen                        : p.imagen,
      fields.price_mayorista !== undefined ? toNullableNumber(fields.price_mayorista) : p.price_mayorista,
      fields.qty_mayorista   !== undefined ? toNullableNumber(fields.qty_mayorista)   : p.qty_mayorista,
      fields.venta_sin_stock !== undefined ? toBoolInt(fields.venta_sin_stock, 0)     : toBoolInt(p.venta_sin_stock, 0),
      fields.price_tarjeta   !== undefined ? toNullableNumber(fields.price_tarjeta)   : p.price_tarjeta,
      fields.hay             !== undefined ? toBoolInt(fields.hay, 1)                 : (p.hay != null ? toBoolInt(p.hay, 1) : 1),
      String(sku),
      p.sucursal_id || 1,
    ]
  );

  // Una sola findBySku al final — sin segunda verificación
  return findBySku(newSku, targetSucursal);
}

function adjustStock(sku, delta, sucursal_id = null) {
  const p = findBySku(sku, sucursal_id);
  if (!p) return { error: 'Producto no encontrado' };
  const newStock = toNumber(p.stock) + toNumber(delta);
  if (newStock < 0) return { error: `Stock insuficiente. Disponible: ${p.stock}` };
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
  const header = 'sku,name,price,price_mayorista,price_tarjeta,price_cost,stock,category,iva,ieps,pesable,qty_mayorista,descripcion';
  return [
    header,
    ...rows.map((r) =>
      [
        r.sku,
        `"${(r.name||'').replace(/"/g,'""')}"`,
        r.price ?? 0,
        r.price_mayorista ?? '',
        r.price_tarjeta ?? '',
        r.price_cost ?? '',
        r.stock ?? 0,
        r.category ?? '',
        r.iva ?? 0,
        r.ieps ?? 0,
        r.pesable ?? 0,
        r.qty_mayorista ?? '',
        `"${(r.descripcion||'').replace(/"/g,'""')}"`,
      ].join(',')
    ),
  ].join('\n');
}

function exportXlsxData(sucursal_id = null) {
  const rows = list(sucursal_id);
  return rows.map(r => ({
    SKU:              r.sku,
    Nombre:           r.name,
    'Precio Minorista': r.price ?? 0,
    'Precio Mayorista': r.price_mayorista ?? '',
    'Precio Tarjeta':   r.price_tarjeta   ?? '',
    'Precio Costo':     r.price_cost      ?? '',
    'Cantidad Min. Mayorista': r.qty_mayorista ?? '',
    Stock:            r.stock ?? 0,
    Categoria:        r.category ?? '',
    IVA:              r.iva ?? 0,
    IEPS:             r.ieps ?? 0,
    Pesable:          r.pesable ? 'SI' : 'NO',
    Descripcion:      r.descripcion ?? '',
    'En Promo':       r.en_promo ? 'SI' : 'NO',
    'Precio Promo':   r.price_promo ?? '',
  }));
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
  initPromoSchema, list, search, findBySku,
  create, updateBySku, adjustStock, remove,
  exportCsv, exportXlsxData, listLowStock,
};