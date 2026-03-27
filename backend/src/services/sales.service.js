const { get, all, run, db } = require('../db');

// ─────────────────────────────────────────────────────────────
// Devuelve datetime en hora Argentina para guardar en SQLite
// Formato: 'YYYY-MM-DD HH:MM:SS'
// Argentina = UTC-3 fijo (sin horario de verano desde 1999)
// ─────────────────────────────────────────────────────────────
function nowArgentina() {
  const now = new Date();
  const offset = -3 * 60; // UTC-3 en minutos
  const local = new Date(now.getTime() + offset * 60 * 1000);
  return local.toISOString().replace('T', ' ').substring(0, 19);
}

// ─────────────────────────────────────────────────────────────
// INIT — agrega columnas faltantes a sales y sale_items (idempotente)
// ─────────────────────────────────────────────────────────────
function initSalesSchema() {
  const salesCols = [
    `ALTER TABLE sales ADD COLUMN discount_pct   REAL    DEFAULT 0`,
    `ALTER TABLE sales ADD COLUMN discount_fixed REAL    DEFAULT 0`,
    `ALTER TABLE sales ADD COLUMN recargo_pct    REAL    DEFAULT 0`,
    `ALTER TABLE sales ADD COLUMN cliente_id     INTEGER DEFAULT 1`,
    `ALTER TABLE sales ADD COLUMN sucursal_id    INTEGER DEFAULT 1`,
  ];

  const saleItemsCols = [
    `ALTER TABLE sale_items ADD COLUMN iva      REAL    DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN ieps     REAL    DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN pesable  INTEGER DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN subtotal REAL    DEFAULT 0`,
  ];

  for (const sql of salesCols) {
    try { run(sql); } catch (_) {}
  }

  for (const sql of saleItemsCols) {
    try { run(sql); } catch (_) {}
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const _columnExistsCache = new Map();

function columnExists(table, col) {
  const key = `${table}.${col}`;
  if (_columnExistsCache.has(key)) {
    return _columnExistsCache.get(key);
  }

  let exists = false;
  try {
    exists = all(`PRAGMA table_info(${table})`).some(c => c.name === col);
  } catch (_) {
    exists = false;
  }

  _columnExistsCache.set(key, exists);
  return exists;
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function toBoolInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  return Number(value) ? 1 : 0;
}

function isManualDeptoItem(item) {
  const sku = String(item?.sku || '');
  return sku.startsWith('DEPTO-') || sku.startsWith('BAL-') || item?.isDepto === true;
}

const HAS_PRODUCTS_SUCURSAL = columnExists('products', 'sucursal_id');
const HAS_SALES_SUCURSAL = columnExists('sales', 'sucursal_id');

function getProductForSale(sku, sucursal_id = 1) {
  if (HAS_PRODUCTS_SUCURSAL) {
    let prod = get(
      `SELECT sku, name, price, stock,
              COALESCE(iva, 0)     AS iva,
              COALESCE(ieps, 0)    AS ieps,
              COALESCE(pesable, 0) AS pesable,
              sucursal_id
       FROM products
       WHERE sku = ? AND sucursal_id = ?`,
      [String(sku), Number(sucursal_id)]
    );

    if (prod) return prod;

    prod = get(
      `SELECT sku, name, price, stock,
              COALESCE(iva, 0)     AS iva,
              COALESCE(ieps, 0)    AS ieps,
              COALESCE(pesable, 0) AS pesable,
              sucursal_id
       FROM products
       WHERE sku = ?
       ORDER BY id DESC
       LIMIT 1`,
      [String(sku)]
    );

    return prod || null;
  }

  return get(
    `SELECT sku, name, price, stock,
            COALESCE(iva, 0)     AS iva,
            COALESCE(ieps, 0)    AS ieps,
            COALESCE(pesable, 0) AS pesable
     FROM products
     WHERE sku = ?`,
    [String(sku)]
  );
}

// ─────────────────────────────────────────────────────────────
// Crear venta
// Congela snapshot fiscal en sale_items:
// name, price, qty, subtotal, iva, ieps, pesable
// ─────────────────────────────────────────────────────────────
function createSale({
  total,
  payment_method,
  cash_received,
  change_amount,
  discount_pct,
  discount_fixed,
  recargo_pct,
  cliente_id,
  es_cuenta_corriente,
  sucursal_id,
  items,
}) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('La venta no tiene items');
  }

  const suc = sucursal_id ? Number(sucursal_id) : 1;

  const insertSaleStmt = db.prepare(`
    INSERT INTO sales (
      total, payment_method, cash_received, change_amount,
      discount_pct, discount_fixed, recargo_pct, cliente_id, sucursal_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSaleItemStmt = db.prepare(`
    INSERT INTO sale_items (
      sale_id, sku, name, price, qty, subtotal, iva, ieps, pesable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStockBySucursalStmt = db.prepare(`
    UPDATE products
    SET stock = stock - ?
    WHERE sku = ? AND sucursal_id = ?
  `);

  const updateStockStmt = db.prepare(`
    UPDATE products
    SET stock = stock - ?
    WHERE sku = ?
  `);

  const getSaleStmt = db.prepare(`SELECT * FROM sales WHERE id = ?`);
  const getSaleItemsStmt = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`);
  const getClienteStmt = db.prepare(`SELECT id, saldo FROM clientes WHERE id = ?`);
  const insertCuentaCorrienteStmt = db.prepare(`
    INSERT INTO cuenta_corriente
      (cliente_id, tipo, monto, descripcion, sale_id)
    VALUES (?, 'cargo', ?, ?, ?)
  `);
  const updateClienteSaldoStmt = db.prepare(`
    UPDATE clientes SET saldo = saldo + ? WHERE id = ?
  `);

  const tx = db.transaction(() => {
    const productCache = new Map();
    const createdAt = nowArgentina();

    const saleRes = insertSaleStmt.run(
      toNumber(total),
      payment_method || null,
      cash_received === undefined || cash_received === null || cash_received === ''
        ? null
        : toNumber(cash_received),
      change_amount === undefined || change_amount === null || change_amount === ''
        ? null
        : toNumber(change_amount),
      toNumber(discount_pct, 0),
      toNumber(discount_fixed, 0),
      toNumber(recargo_pct, 0),
      cliente_id === undefined || cliente_id === null || cliente_id === ''
        ? 1
        : Number(cliente_id),
      suc,
      createdAt
    );

    const sale_id = Number(saleRes.lastInsertRowid);

    for (const it of items) {
      const sku = String(it?.sku || '').trim();
      const qty = toNumber(it?.qty, 0);

      if (qty <= 0) {
        throw new Error(`Cantidad inválida para ${sku || it?.name || 'item'}`);
      }

      if (isManualDeptoItem(it)) {
        const name = String(it?.name || 'Departamento');
        const price = toNumber(it?.price, 0);
        const subtotal = toNumber(it?.subtotal, price * qty);
        const iva = toNumber(it?.iva, 0);
        const ieps = toNumber(it?.ieps, 0);
        const pesable = toBoolInt(it?.pesable, 0);

        insertSaleItemStmt.run(
          sale_id,
          sku || `DEPTO-${Date.now()}`,
          name,
          price,
          qty,
          subtotal,
          iva,
          ieps,
          pesable
        );

        continue;
      }

      if (!sku) {
        throw new Error('Hay un item sin SKU');
      }

      let prod = productCache.get(sku);
      if (!prod) {
        prod = getProductForSale(sku, suc);
        if (prod) productCache.set(sku, prod);
      }

      if (!prod) {
        throw new Error(`Producto no existe: ${sku}`);
      }

      if (toNumber(prod.stock, 0) < qty) {
        throw new Error(`Stock insuficiente para ${prod.name || sku}. Disponible: ${prod.stock}`);
      }

      const name = String(it?.name || prod.name || sku);
      const price = toNumber(it?.price, toNumber(prod.price, 0));
      const subtotal = (it?.subtotal !== undefined && it?.subtotal !== null && it?.subtotal !== '')
        ? toNumber(it.subtotal, price * qty)
        : toNumber(price * qty);

      const iva = (it?.iva !== undefined)
        ? toNumber(it.iva, 0)
        : toNumber(prod.iva, 0);

      const ieps = (it?.ieps !== undefined)
        ? toNumber(it.ieps, 0)
        : toNumber(prod.ieps, 0);

      const pesable = (it?.pesable !== undefined)
        ? toBoolInt(it.pesable, 0)
        : toBoolInt(prod.pesable, 0);

      insertSaleItemStmt.run(
        sale_id,
        sku,
        name,
        price,
        qty,
        subtotal,
        iva,
        ieps,
        pesable
      );

      if (HAS_PRODUCTS_SUCURSAL) {
        updateStockBySucursalStmt.run(qty, sku, prod.sucursal_id || suc);
      } else {
        updateStockStmt.run(qty, sku);
      }

      // mantener cache consistente por si el SKU aparece otra vez en la misma venta
      prod.stock = toNumber(prod.stock, 0) - qty;
      productCache.set(sku, prod);
    }

    const sale = getSaleStmt.get(sale_id);
    const saleItems = getSaleItemsStmt.all(sale_id);

    const esCuentaCorrienteFinal = es_cuenta_corriente
      || (payment_method || '').toLowerCase().includes('fiado')
      || (payment_method || '').toLowerCase().includes('cuenta corriente');

    const clienteFiado = (esCuentaCorrienteFinal && cliente_id && Number(cliente_id) > 1)
      ? Number(cliente_id)
      : null;

    if (clienteFiado) {
      const cli = getClienteStmt.get(clienteFiado);
      if (cli) {
        insertCuentaCorrienteStmt.run(
          clienteFiado,
          toNumber(total),
          `Venta #${sale_id} — Fiado`,
          sale_id
        );
        updateClienteSaldoStmt.run(toNumber(total), clienteFiado);
      }
    }

    return {
      ok: true,
      sale_id,
      sale,
      items: saleItems,
    };
  });

  return tx();
}

// ─────────────────────────────────────────────────────────────
// Ventas recientes
// ─────────────────────────────────────────────────────────────
function listRecent(limit = 5, sucursal_id = null) {
  try {
    const where = (sucursal_id && HAS_SALES_SUCURSAL)
      ? `WHERE s.sucursal_id = ${Number(sucursal_id)}`
      : '';

    const sales = all(
      `SELECT s.id, s.total, s.payment_method, s.created_at, s.cash_received, s.change_amount
       FROM sales s
       ${where}
       ORDER BY s.id DESC
       LIMIT ?`,
      [limit]
    );

    return sales.map(s => ({
      ...s,
      status: 'Pagado',
      time: new Date(s.created_at).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      items: all(`SELECT * FROM sale_items WHERE sale_id = ?`, [s.id]),
    }));
  } catch (e) {
    console.error('listRecent:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Ventas del día
// ─────────────────────────────────────────────────────────────
function listToday(sucursal_id = null) {
  try {
    const offset = -3 * 60;
    const nowArg = new Date(Date.now() + offset * 60 * 1000);
    const today = nowArg.toISOString().split('T')[0];

    const sWhere = (sucursal_id && HAS_SALES_SUCURSAL)
      ? `AND s.sucursal_id = ${Number(sucursal_id)}`
      : '';

    const sales = all(
      `SELECT s.id, s.total, s.payment_method, s.created_at
       FROM sales s
       WHERE DATE(s.created_at) = ?
       ${sWhere}
       ORDER BY s.id DESC`,
      [today]
    );

    return sales.map(s => ({
      ...s,
      items: all(`SELECT * FROM sale_items WHERE sale_id = ?`, [s.id]),
    }));
  } catch (e) {
    console.error('listToday:', e.message);
    return [];
  }
}

module.exports = {
  initSalesSchema,
  createSale,
  listRecent,
  listToday,
};