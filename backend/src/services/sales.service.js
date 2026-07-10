const { get, all, run, db } = require('../db');
const existencias = require('./existencias.service');

// ─────────────────────────────────────────────────────────────
// Hora Argentina — robusta para VPS con cualquier timezone configurada
// ─────────────────────────────────────────────────────────────
function nowArgentina() {
  try {
    const str = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(new Date()).replace('T', ' ');
    return str.substring(0, 19);
  } catch(e) {
    const local = new Date(Date.now() + (-3 * 60 * 60 * 1000));
    return local.toISOString().replace('T', ' ').substring(0, 19);
  }
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
    `ALTER TABLE sales ADD COLUMN status         TEXT    DEFAULT 'completada'`,
    `ALTER TABLE sales ADD COLUMN anulacion_motivo TEXT`,
    `ALTER TABLE sales ADD COLUMN anulada_at     TEXT`,
    `ALTER TABLE sales ADD COLUMN anulada_by     TEXT`,
    `ALTER TABLE sales ADD COLUMN monto_mixto2   REAL    DEFAULT NULL`,
    // Quién hizo la venta (para auditar descuentos y cambios de precio)
    `ALTER TABLE sales ADD COLUMN usuario        TEXT    DEFAULT NULL`,
  ];

  const saleItemsCols = [
    `ALTER TABLE sale_items ADD COLUMN iva      REAL    DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN ieps     REAL    DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN pesable  INTEGER DEFAULT 0`,
    `ALTER TABLE sale_items ADD COLUMN subtotal REAL    DEFAULT 0`,
    // Precio de lista antes de tocarlo a mano + marca de edición manual
    `ALTER TABLE sale_items ADD COLUMN price_original REAL    DEFAULT NULL`,
    `ALTER TABLE sale_items ADD COLUMN precio_editado INTEGER DEFAULT 0`,
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
              COALESCE(iva, 0)             AS iva,
              COALESCE(ieps, 0)            AS ieps,
              COALESCE(pesable, 0)         AS pesable,
              COALESCE(venta_sin_stock, 0) AS venta_sin_stock,
              sucursal_id
       FROM products
       WHERE sku = ? AND sucursal_id = ?`,
      [String(sku), Number(sucursal_id)]
    );

    if (prod) return prod;

    prod = get(
      `SELECT sku, name, price, stock,
              COALESCE(iva, 0)             AS iva,
              COALESCE(ieps, 0)            AS ieps,
              COALESCE(pesable, 0)         AS pesable,
              COALESCE(venta_sin_stock, 0) AS venta_sin_stock,
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
            COALESCE(iva, 0)             AS iva,
            COALESCE(ieps, 0)            AS ieps,
            COALESCE(pesable, 0)         AS pesable,
            COALESCE(venta_sin_stock, 0) AS venta_sin_stock
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

// Prepared statements a nivel de módulo — se preparan una sola vez al arrancar
// _stmtsReady = false fuerza que se re-preparen si el schema cambia
let _stmtsReady = false;
let insertSaleStmt, insertSaleItemStmt, updateStockBySucursalStmt,
    updateStockStmt, getSaleStmt, getSaleItemsStmt,
    getClienteStmt, insertCuentaCorrienteStmt, updateClienteSaldoStmt;

function _ensureStmts() {
  if (_stmtsReady) return;
  insertSaleStmt = db.prepare(`
    INSERT INTO sales (
      total, payment_method, cash_received, change_amount,
      discount_pct, discount_fixed, recargo_pct, cliente_id, sucursal_id,
      monto_mixto2, usuario, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertSaleItemStmt = db.prepare(`
    INSERT INTO sale_items (
      sale_id, sku, name, price, qty, subtotal, iva, ieps, pesable,
      price_original, precio_editado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  updateStockBySucursalStmt = db.prepare(`
    UPDATE products SET stock = stock - ? WHERE sku = ? AND sucursal_id = ?
  `);
  updateStockStmt = db.prepare(`
    UPDATE products SET stock = stock - ? WHERE sku = ?
  `);
  getSaleStmt = db.prepare(`SELECT * FROM sales WHERE id = ?`);
  getSaleItemsStmt = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`);
  getClienteStmt = db.prepare(`SELECT id, saldo FROM clientes WHERE id = ?`);
  insertCuentaCorrienteStmt = db.prepare(`
    INSERT INTO cuenta_corriente (cliente_id, tipo, monto, descripcion, sale_id)
    VALUES (?, 'cargo', ?, ?, ?)
  `);
  updateClienteSaldoStmt = db.prepare(`
    UPDATE clientes SET saldo = saldo + ? WHERE id = ?
  `);
  _stmtsReady = true;
}

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
  monto_mixto2,
  usuario,
  items,
}) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('La venta no tiene items');
  }

  const suc = sucursal_id ? Number(sucursal_id) : 1;

  _ensureStmts();

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
      monto_mixto2 !== undefined && monto_mixto2 !== null ? toNumber(monto_mixto2) : null,
      usuario || null,
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
          pesable,
          null,
          0
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

      if (toNumber(prod.stock, 0) < qty && !prod.venta_sin_stock) {
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

      // Auditoría de precio: si el cajero lo editó a mano, guardamos con cuánto arrancó.
      // Si el front no manda price_original, caemos al precio de lista del producto.
      const priceOriginal = (it?.price_original !== undefined && it?.price_original !== null && it?.price_original !== '')
        ? toNumber(it.price_original, price)
        : toNumber(prod.price, price);
      const precioEditado = toBoolInt(it?.precio_editado, 0) && Number(priceOriginal) !== Number(price) ? 1 : 0;

      insertSaleItemStmt.run(
        sale_id,
        sku,
        name,
        price,
        qty,
        subtotal,
        iva,
        ieps,
        pesable,
        priceOriginal,
        precioEditado
      );

      // Descontar del stock de la sucursal donde se vende (motor de existencias).
      // El espejo deja products.stock sincronizado para el código que aún lo lea.
      existencias.adjustStock(sku, suc, -qty, { tipo: 'venta', motivo: 'Venta', permitirNegativo: true });

      // mantener cache consistente por si el SKU aparece otra vez en la misma venta
      prod.stock = toNumber(prod.stock, 0) - qty;
      productCache.set(sku, prod);
    }

    const sale = getSaleStmt.get(sale_id);
    const saleItems = getSaleItemsStmt.all(sale_id);

    const esCuentaCorrienteFinal = es_cuenta_corriente
      || (payment_method || '').toLowerCase().includes('fiado')
      || (payment_method || '').toLowerCase().includes('cuenta corriente');

    const clienteValido = cliente_id && Number(cliente_id) > 1;

    if (clienteValido) {
      const cli = getClienteStmt.get(Number(cliente_id));
      if (cli) {
        if (esCuentaCorrienteFinal) {
          // Venta fiada — suma al saldo
          insertCuentaCorrienteStmt.run(
            Number(cliente_id),
            toNumber(total),
            `Venta #${sale_id} — Fiado`,
            sale_id
          );
          updateClienteSaldoStmt.run(toNumber(total), Number(cliente_id));
          // Historial unificado: que la venta fiada también figure en "Cuenta"
          run(
            `INSERT INTO clientes_movimientos (cliente_id, tipo, monto, descripcion, sale_id, saldo_post)
             VALUES (?, 'cargo', ?, ?, ?, ?)`,
            [Number(cliente_id), toNumber(total),
             `Venta #${sale_id} — Fiado`,
             sale_id,
             Number(cli.saldo || 0) + toNumber(total)]
          );
        } else {
          // Venta pagada — registrar en historial como cargo informativo sin afectar saldo
          run(
            `INSERT INTO clientes_movimientos (cliente_id, tipo, monto, descripcion, sale_id, saldo_post)
             VALUES (?, 'cargo', ?, ?, ?, ?)`,
            [Number(cliente_id), toNumber(total),
             `Venta #${sale_id} — ${payment_method || 'Pagado'}`,
             sale_id,
             Number(cli.saldo || 0)]
          );
          // No modificar el saldo — es una venta pagada, no fiada
        }
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

// ─────────────────────────────────────────────────────────────
// ANULAR VENTA — devuelve stock, marca status='anulada'
// ─────────────────────────────────────────────────────────────
function anularVenta({ sale_id, motivo, usuario }) {
  const sale = get(`SELECT * FROM sales WHERE id = ?`, [Number(sale_id)]);
  if (!sale) throw new Error(`Venta #${sale_id} no encontrada`);
  if (sale.status === 'anulada') throw new Error(`La venta #${sale_id} ya está anulada`);

  const items = all(`SELECT * FROM sale_items WHERE sale_id = ?`, [Number(sale_id)]);

  const tx = db.transaction(() => {
    // Marcar como anulada
    run(
      `UPDATE sales SET status = 'anulada', anulacion_motivo = ?, anulada_at = ?, anulada_by = ? WHERE id = ?`,
      [motivo || 'Sin motivo', nowArgentina(), usuario || 'sistema', Number(sale_id)]
    );

    // Devolver stock — a existencias (fuente de verdad por sucursal), que además
    // espeja products.stock. Simétrico con cómo la venta descuenta el stock.
    for (const item of items) {
      if (!item.sku) continue;
      try {
        const suc = Number(sale.sucursal_id || 1);
        existencias.adjustStock(item.sku, suc, Number(item.qty), {
          tipo: 'ajuste',
          motivo: `Anulación venta #${sale_id}`,
          usuario: usuario || 'sistema',
          permitirNegativo: true,
        });
      } catch (_) {}
    }
  });

  tx();
  return { ok: true, sale_id: Number(sale_id) };
}

// ─────────────────────────────────────────────────────────────
// STATS DASHBOARD — ventas hoy, ayer, stock bajo
// ─────────────────────────────────────────────────────────────
function getStatsDashboard(sucursal_id = null) {
  try {
    const hoy  = nowArgentina().substring(0, 10);
    const ayer = new Date(new Date(hoy).getTime() - 86400000).toISOString().substring(0, 10);
    const sW   = (sucursal_id && HAS_SALES_SUCURSAL) ? `AND sucursal_id = ${Number(sucursal_id)}` : '';

    const hoyRow  = get(`SELECT COALESCE(SUM(total),0) as t, COUNT(*) as n FROM sales WHERE DATE(created_at)=? AND COALESCE(status,'completada')!='anulada' ${sW}`, [hoy]);
    const ayerRow = get(`SELECT COALESCE(SUM(total),0) as t, COUNT(*) as n FROM sales WHERE DATE(created_at)=? AND COALESCE(status,'completada')!='anulada' ${sW}`, [ayer]);
    const stockRow = get(`SELECT COUNT(*) as n FROM products WHERE stock <= stock_min`);

    return {
      ventasHoy:  { t: hoyRow?.t  || 0, n: hoyRow?.n  || 0 },
      ventasAyer: { t: ayerRow?.t || 0, n: ayerRow?.n || 0 },
      stockBajo:  { n: stockRow?.n || 0 },
      totalProd:  { n: 0 },
    };
  } catch(e) {
    console.error('getStatsDashboard:', e.message);
    return {
      ventasHoy:  { t: 0, n: 0 },
      ventasAyer: { t: 0, n: 0 },
      stockBajo:  { n: 0 },
      totalProd:  { n: 0 },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// VENTAS POR DÍA — últimos N días
// ─────────────────────────────────────────────────────────────
function ventasPorDia(dias = 7, sucursal_id = null) {
  try {
    const sW = (sucursal_id && HAS_SALES_SUCURSAL) ? `AND sucursal_id = ${Number(sucursal_id)}` : '';
    const rows = all(
      `SELECT DATE(created_at) as fecha, COALESCE(SUM(total),0) as total
       FROM sales
       WHERE created_at >= date('now','-${Number(dias)-1} days')
         AND COALESCE(status,'completada') != 'anulada' ${sW}
       GROUP BY DATE(created_at)
       ORDER BY fecha ASC`
    );
    return rows;
  } catch(e) {
    console.error('ventasPorDia:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// VENTAS POR MÉTODO DE PAGO — hoy
// ─────────────────────────────────────────────────────────────
function ventasPorMetodo(sucursal_id = null) {
  try {
    const hoy = nowArgentina().substring(0, 10);
    const sW  = (sucursal_id && HAS_SALES_SUCURSAL) ? `AND sucursal_id = ${Number(sucursal_id)}` : '';
    const rows = all(
      `SELECT payment_method, COALESCE(SUM(total),0) as total, COUNT(*) as count
       FROM sales
       WHERE DATE(created_at) = ?
         AND COALESCE(status,'completada') != 'anulada' ${sW}
       GROUP BY payment_method
       ORDER BY total DESC`,
      [hoy]
    );
    return rows;
  } catch(e) {
    console.error('ventasPorMetodo:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// PRODUCTOS MÁS VENDIDOS — últimos 30 días
// ─────────────────────────────────────────────────────────────
function productosMasVendidos(limit = 8, sucursal_id = null) {
  try {
    const sW = (sucursal_id && HAS_SALES_SUCURSAL) ? `AND s.sucursal_id = ${Number(sucursal_id)}` : '';
    const rows = all(
      `SELECT si.name, COALESCE(SUM(si.qty),0) as cantidad
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= date('now','-30 days')
         AND COALESCE(s.status,'completada') != 'anulada' ${sW}
       GROUP BY si.name
       ORDER BY cantidad DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  } catch(e) {
    console.error('productosMasVendidos:', e.message);
    return [];
  }
}

module.exports = {
  initSalesSchema,
  createSale,
  listRecent,
  listToday,
  anularVenta,
  getStatsDashboard,
  ventasPorDia,
  ventasPorMetodo,
  productosMasVendidos,
};