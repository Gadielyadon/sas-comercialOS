const { get, all, run, db } = require('../db');

// ─────────────────────────────────────────────────────────────
// Devuelve datetime en hora Argentina para guardar en SQLite
// Formato: 'YYYY-MM-DD HH:MM:SS'
// Argentina = UTC-3 fijo (sin horario de verano desde 1999)
// ─────────────────────────────────────────────────────────────
function nowArgentina() {
  const now    = new Date();
  const offset = -3 * 60; // UTC-3 en minutos
  const local  = new Date(now.getTime() + offset * 60 * 1000);
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
function columnExists(table, col) {
  try {
    return all(`PRAGMA table_info(${table})`).some(c => c.name === col);
  } catch (_) {
    return false;
  }
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

function getProductForSale(sku, sucursal_id = 1) {
  const hasSucursal = columnExists('products', 'sucursal_id');

  if (hasSucursal) {
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

  const tx = db.transaction(() => {
    const saleRes = run(
      `INSERT INTO sales (
        total, payment_method, cash_received, change_amount,
        discount_pct, discount_fixed, recargo_pct, cliente_id, sucursal_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
        nowArgentina(),   // ← hora local Argentina en lugar de UTC
      ]
    );

    const sale_id = Number(saleRes.lastInsertRowid);

    for (const it of items) {
      const sku = String(it?.sku || '').trim();
      const qty = toNumber(it?.qty, 0);

      if (qty <= 0) {
        throw new Error(`Cantidad inválida para ${sku || it?.name || 'item'}`);
      }

      // ── Ítem manual / departamento / balanza: no busca en products ni descuenta stock ──
      if (isManualDeptoItem(it)) {
        const name     = String(it?.name || 'Departamento');
        const price    = toNumber(it?.price, 0);
        const subtotal = toNumber(it?.subtotal, price * qty);
        const iva      = toNumber(it?.iva, 0);
        const ieps     = toNumber(it?.ieps, 0);
        const pesable  = toBoolInt(it?.pesable, 0);

        run(
          `INSERT INTO sale_items (
            sale_id, sku, name, price, qty, subtotal, iva, ieps, pesable
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sale_id, sku || `DEPTO-${Date.now()}`, name, price, qty, subtotal, iva, ieps, pesable]
        );

        continue;
      }

      if (!sku) {
        throw new Error('Hay un item sin SKU');
      }

      const prod = getProductForSale(sku, suc);
      if (!prod) {
        throw new Error(`Producto no existe: ${sku}`);
      }

      if (toNumber(prod.stock, 0) < qty) {
        throw new Error(`Stock insuficiente para ${prod.name || sku}. Disponible: ${prod.stock}`);
      }

      const name     = String(it?.name || prod.name || sku);
      const price    = toNumber(it?.price, toNumber(prod.price, 0));
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

      run(
        `INSERT INTO sale_items (
          sale_id, sku, name, price, qty, subtotal, iva, ieps, pesable
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sale_id, sku, name, price, qty, subtotal, iva, ieps, pesable]
      );

      if (columnExists('products', 'sucursal_id')) {
        run(
          `UPDATE products
           SET stock = stock - ?
           WHERE sku = ? AND sucursal_id = ?`,
          [qty, sku, prod.sucursal_id || suc]
        );
      } else {
        run(
          `UPDATE products
           SET stock = stock - ?
           WHERE sku = ?`,
          [qty, sku]
        );
      }
    }

    const sale      = get(`SELECT * FROM sales WHERE id = ?`, [sale_id]);
    const saleItems = all(`SELECT * FROM sale_items WHERE sale_id = ?`, [sale_id]);

    // ── Si es cuenta corriente: cargar a cuenta corriente del cliente ──
    const esCuentaCorriente = es_cuenta_corriente
      || (payment_method || '').toLowerCase().includes('fiado')
      || (payment_method || '').toLowerCase().includes('cuenta corriente');
    const clienteFiado = (esCuentaCorriente && cliente_id && Number(cliente_id) > 1)
      ? Number(cliente_id)
      : null;

    if (clienteFiado) {
      const cli = get(`SELECT id, saldo FROM clientes WHERE id = ?`, [clienteFiado]);
      if (cli) {
        run(
          `INSERT INTO cuenta_corriente
             (cliente_id, tipo, monto, descripcion, sale_id)
           VALUES (?, 'cargo', ?, ?, ?)`,
          [
            clienteFiado,
            toNumber(total),
            `Venta #${sale_id} — Fiado`,
            sale_id,
          ]
        );
        run(
          `UPDATE clientes SET saldo = saldo + ? WHERE id = ?`,
          [toNumber(total), clienteFiado]
        );
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
    const where = (sucursal_id && columnExists('sales', 'sucursal_id'))
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
      // El created_at ya está en hora Argentina → no agregar 'Z' ni ajustar offset
      time: new Date(s.created_at).toLocaleTimeString('es-AR', {
        hour:   '2-digit',
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
    // Fecha de hoy en Argentina
    const offset  = -3 * 60;
    const nowArg  = new Date(Date.now() + offset * 60 * 1000);
    const today   = nowArg.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    const sWhere = (sucursal_id && columnExists('sales', 'sucursal_id'))
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
