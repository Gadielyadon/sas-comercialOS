// src/services/existencias.service.js
// ─────────────────────────────────────────────────────────────
// Stock por sucursal/depósito. El catálogo (products) es global;
// la cantidad de cada producto en cada lugar vive en `existencias`.
// Mantiene products.stock como espejo del stock de su sucursal,
// como red de seguridad para cualquier código que aún lo lea.
// ─────────────────────────────────────────────────────────────
const { db, get, all, run } = require('../db');

function toNum(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

// Stock de un producto en un lugar puntual
function getStock(sku, sucursal_id) {
  const r = get(`SELECT stock FROM existencias WHERE sku = ? AND sucursal_id = ?`,
    [String(sku), Number(sucursal_id)]);
  return r ? toNum(r.stock) : 0;
}

// Stock de un producto en todos los lugares
function getStockTodos(sku) {
  return all(`SELECT sucursal_id, stock, stock_min FROM existencias WHERE sku = ? ORDER BY sucursal_id`,
    [String(sku)]);
}

// Mapa { sku: stock } de una sucursal — útil para listar productos de un lugar
function mapaSucursal(sucursal_id) {
  const rows = all(`SELECT sku, stock, stock_min FROM existencias WHERE sucursal_id = ?`,
    [Number(sucursal_id)]);
  const m = {};
  for (const r of rows) m[r.sku] = { stock: toNum(r.stock), stock_min: r.stock_min };
  return m;
}

// Asegura que exista la fila (con un stock inicial). No pisa si ya existe.
function ensureRow(sku, sucursal_id, stockInicial = 0) {
  run(`INSERT OR IGNORE INTO existencias (sku, sucursal_id, stock) VALUES (?, ?, ?)`,
    [String(sku), Number(sucursal_id), Math.max(0, toNum(stockInicial))]);
  _mirror(String(sku), Number(sucursal_id));
}

function _registrarMov(sku, suc, delta, result, tipo, motivo, ref, usuario) {
  try {
    run(`INSERT INTO movimientos_stock
           (sku, sucursal_id, delta, stock_result, tipo, motivo, ref_sucursal_id, usuario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(sku), Number(suc), delta == null ? 0 : toNum(delta), result == null ? null : toNum(result),
        String(tipo), motivo || null, ref != null ? Number(ref) : null, usuario || null]);
  } catch (_) {}
}

// Espejo: products.stock = stock de existencias en esa sucursal (compatibilidad)
function _mirror(sku, sucursal_id) {
  try {
    run(`UPDATE products SET stock = ? WHERE sku = ? AND sucursal_id = ?`,
      [getStock(sku, sucursal_id), String(sku), Number(sucursal_id)]);
  } catch (_) {}
}

// Setea el stock a un valor absoluto
function setStock(sku, sucursal_id, stock, { motivo = 'ajuste manual', usuario = null, tipo = 'ajuste' } = {}) {
  const s = Math.max(0, toNum(stock));
  run(`INSERT INTO existencias (sku, sucursal_id, stock) VALUES (?, ?, ?)
       ON CONFLICT(sku, sucursal_id) DO UPDATE SET stock = excluded.stock, updated_at = datetime('now','localtime')`,
    [String(sku), Number(sucursal_id), s]);
  _registrarMov(sku, sucursal_id, null, s, tipo, motivo, null, usuario);
  _mirror(sku, sucursal_id);
  return { stock: s };
}

// Ajusta por delta (suma/resta). Devuelve { stock } o { error }
function adjustStock(sku, sucursal_id, delta,
  { motivo = 'ajuste manual', usuario = null, tipo = 'ajuste', permitirNegativo = false } = {}) {
  const actual = getStock(sku, sucursal_id);
  const d = toNum(delta);
  const nuevo = actual + d;
  if (nuevo < 0 && !permitirNegativo) {
    return { error: `Stock insuficiente. Disponible: ${actual}` };
  }
  const s = Math.max(permitirNegativo ? -Infinity : 0, nuevo);
  run(`INSERT INTO existencias (sku, sucursal_id, stock) VALUES (?, ?, ?)
       ON CONFLICT(sku, sucursal_id) DO UPDATE SET stock = excluded.stock, updated_at = datetime('now','localtime')`,
    [String(sku), Number(sucursal_id), s]);
  _registrarMov(sku, sucursal_id, d, s, tipo, motivo, null, usuario);
  _mirror(sku, sucursal_id);
  return { stock: s };
}

// ── Mover stock entre lugares (atómico) ──
const _mover = db.transaction((sku, desde, hacia, qty, motivo, usuario) => {
  const disp = getStock(sku, desde);
  if (disp < qty) {
    const e = new Error(`No hay suficiente en origen. Disponible: ${disp}`);
    e._stock = true; throw e;
  }
  run(`UPDATE existencias SET stock = stock - ?, updated_at = datetime('now','localtime')
       WHERE sku = ? AND sucursal_id = ?`, [qty, String(sku), Number(desde)]);
  run(`INSERT INTO existencias (sku, sucursal_id, stock) VALUES (?, ?, ?)
       ON CONFLICT(sku, sucursal_id) DO UPDATE SET stock = stock + excluded.stock, updated_at = datetime('now','localtime')`,
    [String(sku), Number(hacia), qty]);
  const no = getStock(sku, desde), nd = getStock(sku, hacia);
  _registrarMov(sku, desde, -qty, no, 'transfer_out', motivo || `Mover a sucursal ${hacia}`, hacia, usuario);
  _registrarMov(sku, hacia, qty, nd, 'transfer_in', motivo || `Viene de sucursal ${desde}`, desde, usuario);
  _mirror(sku, desde); _mirror(sku, hacia);
  return { origen: no, destino: nd };
});

function transferStock(sku, desde, hacia, qty, { motivo = null, usuario = null } = {}) {
  desde = Number(desde); hacia = Number(hacia); qty = toNum(qty);
  if (qty <= 0) return { error: 'La cantidad a mover debe ser mayor a cero' };
  if (desde === hacia) return { error: 'El origen y el destino no pueden ser el mismo lugar' };
  try { return _mover(String(sku), desde, hacia, qty, motivo, usuario); }
  catch (e) { return { error: e && e._stock ? e.message : 'No se pudo mover el stock' }; }
}

// Historial de movimientos de un producto
function movimientos(sku, limit = 30) {
  return all(`SELECT * FROM movimientos_stock WHERE sku = ? ORDER BY id DESC LIMIT ?`,
    [String(sku), Number(limit)]);
}

module.exports = {
  getStock, getStockTodos, mapaSucursal, ensureRow,
  setStock, adjustStock, transferStock, movimientos,
};