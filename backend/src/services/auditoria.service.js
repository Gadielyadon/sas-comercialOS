// src/services/auditoria.service.js
// ─────────────────────────────────────────────────────────────
// Auditoría — "quién hizo qué" en el sistema, todo en un solo lugar.
//
// Junta tres fuentes:
//  1) movimientos_stock  → ya existía en la base, sin pantalla propia
//  2) sales (anuladas)   → ya existía, mezclado dentro del historial
//  3) auditoria_eventos  → tabla nueva, para lo que todavía no se
//                           registraba: cambios de precio manual en el
//                           POS, cambios en Ajustes, PIN de vendedor
//                           incorrecto, etc. Se alimenta con registrar().
// ─────────────────────────────────────────────────────────────
const { db, get, all, run } = require('../db');

function initSchema() {
  run(`CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo         TEXT NOT NULL,   -- precio_manual | ajuste_config | pin_fallido | otro
    usuario      TEXT,
    sucursal_id  INTEGER,
    detalle      TEXT,
    entidad      TEXT,            -- ej: sku de un producto, sección de ajustes
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  run(`CREATE INDEX IF NOT EXISTS idx_audit_tipo ON auditoria_eventos(tipo)`);
  run(`CREATE INDEX IF NOT EXISTS idx_audit_suc ON auditoria_eventos(sucursal_id)`);
}
initSchema();

// ── Registrar un evento genérico (lo llaman otras partes del sistema) ──
function registrar({ tipo, usuario, sucursal_id, detalle, entidad }) {
  try {
    run(
      `INSERT INTO auditoria_eventos (tipo, usuario, sucursal_id, detalle, entidad) VALUES (?,?,?,?,?)`,
      [tipo, usuario || null, sucursal_id ? Number(sucursal_id) : null, detalle || null, entidad || null]
    );
  } catch (e) {
    console.error('[auditoria.registrar]', e.message);
  }
}

// ── Listado unificado, con filtros ──────────────────────────────
function listar({ sucursal_id = null, tipo = null, usuario = null, desde = null, hasta = null, limit = 200 } = {}) {
  const eventos = [];

  // 1) Movimientos de stock (altas manuales, ajustes, transferencias — no ventas normales)
  {
    const where = [`tipo != 'venta'`];
    const params = [];
    if (sucursal_id) { where.push(`sucursal_id = ?`); params.push(Number(sucursal_id)); }
    if (usuario)     { where.push(`usuario LIKE ?`);  params.push(`%${usuario}%`); }
    if (desde)       { where.push(`DATE(created_at) >= ?`); params.push(desde); }
    if (hasta)       { where.push(`DATE(created_at) <= ?`); params.push(hasta); }
    if (!tipo || tipo === 'stock') {
      const rows = all(
        `SELECT id, sku, sucursal_id, delta, stock_result, tipo, motivo, usuario, created_at
         FROM movimientos_stock WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 300`,
        params
      );
      for (const r of rows) {
        const signo = r.delta > 0 ? '+' : '';
        eventos.push({
          tipo: 'stock',
          tipo_label: r.tipo === 'alta' ? 'Alta de stock' : r.tipo === 'ajuste' ? 'Ajuste de stock' : r.tipo.startsWith('transfer') ? 'Transferencia' : r.tipo,
          usuario: r.usuario || '—',
          sucursal_id: r.sucursal_id,
          detalle: `${r.sku} · ${signo}${r.delta} (quedó en ${r.stock_result ?? '?'})${r.motivo ? ' · ' + r.motivo : ''}`,
          entidad: r.sku,
          created_at: r.created_at,
        });
      }
    }
  }

  // 2) Ventas anuladas
  if (!tipo || tipo === 'venta_anulada') {
    const where = [`status = 'anulada'`];
    const params = [];
    if (sucursal_id) { where.push(`sucursal_id = ?`); params.push(Number(sucursal_id)); }
    if (usuario)     { where.push(`anulada_by LIKE ?`); params.push(`%${usuario}%`); }
    if (desde)       { where.push(`DATE(anulada_at) >= ?`); params.push(desde); }
    if (hasta)       { where.push(`DATE(anulada_at) <= ?`); params.push(hasta); }
    const rows = all(
      `SELECT id, total, payment_method, sucursal_id, anulacion_motivo, anulada_at, anulada_by, created_at
       FROM sales WHERE ${where.join(' AND ')} ORDER BY anulada_at DESC LIMIT 300`,
      params
    );
    for (const r of rows) {
      eventos.push({
        tipo: 'venta_anulada',
        tipo_label: 'Venta anulada',
        usuario: r.anulada_by || '—',
        sucursal_id: r.sucursal_id,
        detalle: `Venta #${r.id} por $${Number(r.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })} (${r.payment_method})${r.anulacion_motivo ? ' · Motivo: ' + r.anulacion_motivo : ' · sin motivo indicado'}`,
        entidad: `venta_${r.id}`,
        created_at: r.anulada_at || r.created_at,
      });
    }
  }

  // 3) Eventos genéricos (precio manual, ajustes, PIN fallido, etc.)
  {
    const where = ['1=1'];
    const params = [];
    if (sucursal_id) { where.push(`sucursal_id = ?`); params.push(Number(sucursal_id)); }
    if (usuario)     { where.push(`usuario LIKE ?`);  params.push(`%${usuario}%`); }
    if (desde)       { where.push(`DATE(created_at) >= ?`); params.push(desde); }
    if (hasta)       { where.push(`DATE(created_at) <= ?`); params.push(hasta); }
    if (tipo && !['stock', 'venta_anulada'].includes(tipo)) { where.push(`tipo = ?`); params.push(tipo); }
    if (!tipo) {
      const rows = all(
        `SELECT * FROM auditoria_eventos WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 300`,
        params
      );
      for (const r of rows) {
        eventos.push({
          tipo: r.tipo,
          tipo_label: etiquetaTipo(r.tipo),
          usuario: r.usuario || '—',
          sucursal_id: r.sucursal_id,
          detalle: r.detalle || '',
          entidad: r.entidad,
          created_at: r.created_at,
        });
      }
    } else if (!['stock', 'venta_anulada'].includes(tipo)) {
      const rows = all(
        `SELECT * FROM auditoria_eventos WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 300`,
        params
      );
      for (const r of rows) {
        eventos.push({
          tipo: r.tipo,
          tipo_label: etiquetaTipo(r.tipo),
          usuario: r.usuario || '—',
          sucursal_id: r.sucursal_id,
          detalle: r.detalle || '',
          entidad: r.entidad,
          created_at: r.created_at,
        });
      }
    }
  }

  eventos.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return eventos.slice(0, limit);
}

function etiquetaTipo(tipo) {
  const map = {
    precio_manual: 'Cambio de precio manual',
    ajuste_config: 'Cambio en Ajustes',
    pin_fallido: 'PIN de vendedor incorrecto',
    cierre_caja: 'Cierre de caja',
    descuento: 'Descuento aplicado',
    inv_alta: 'Alta de producto',
    inv_precio_editado: 'Precio editado en Inventario',
    inv_baja: 'Baja de producto',
    login: 'Inicio de sesión',
  };
  return map[tipo] || tipo;
}

// ── Rentabilidad por categoría ──────────────────────────────────
// Costo total = Σ(precio_costo × stock) · Venta total = Σ(precio_venta × stock)
// Rentabilidad = Venta total − Costo total · Margen % = Rentabilidad / Venta total
function rentabilidadPorCategoria({ sucursal_id = null } = {}) {
  const where = [];
  const params = [];
  if (sucursal_id) {
    where.push('COALESCE(e.stock, p.stock) IS NOT NULL AND p.sucursal_id = ?');
    // Nota: si el producto es global (sin sucursal propia) y existencias
    // maneja el stock por sucursal, usamos existencias cuando exista.
  }

  const rows = sucursal_id
    ? all(
        `SELECT p.category AS category, p.sku AS sku,
                COALESCE(p.price_cost, 0) AS price_cost,
                COALESCE(p.price, 0) AS price,
                COALESCE(e.stock, p.stock, 0) AS stock
         FROM products p
         LEFT JOIN existencias e ON e.sku = p.sku AND e.sucursal_id = ?
         WHERE p.sucursal_id = ? OR p.sucursal_id IS NULL`,
        [Number(sucursal_id), Number(sucursal_id)]
      )
    : all(
        `SELECT category AS category, sku AS sku,
                COALESCE(price_cost, 0) AS price_cost,
                COALESCE(price, 0) AS price,
                COALESCE(stock, 0) AS stock
         FROM products`
      );

  const porCategoria = {};
  let totCosto = 0, totVenta = 0;

  for (const r of rows) {
    const cat = r.category || 'Sin categoría';
    const stock = Number(r.stock) || 0;
    const costoLinea = (Number(r.price_cost) || 0) * stock;
    const ventaLinea = (Number(r.price) || 0) * stock;

    if (!porCategoria[cat]) {
      porCategoria[cat] = { categoria: cat, productos: 0, unidades: 0, costo_total: 0, venta_total: 0 };
    }
    porCategoria[cat].productos += 1;
    porCategoria[cat].unidades += stock;
    porCategoria[cat].costo_total += costoLinea;
    porCategoria[cat].venta_total += ventaLinea;

    totCosto += costoLinea;
    totVenta += ventaLinea;
  }

  const categorias = Object.values(porCategoria).map(c => {
    const rentabilidad = c.venta_total - c.costo_total;
    const margen_pct = c.venta_total > 0 ? (rentabilidad / c.venta_total) * 100 : 0;
    return {
      ...c,
      costo_total: Math.round(c.costo_total * 100) / 100,
      venta_total: Math.round(c.venta_total * 100) / 100,
      rentabilidad: Math.round(rentabilidad * 100) / 100,
      margen_pct: Math.round(margen_pct * 10) / 10,
    };
  }).sort((a, b) => b.venta_total - a.venta_total);

  const totRentabilidad = totVenta - totCosto;
  return {
    categorias,
    totales: {
      costo_total: Math.round(totCosto * 100) / 100,
      venta_total: Math.round(totVenta * 100) / 100,
      rentabilidad: Math.round(totRentabilidad * 100) / 100,
      margen_pct: totVenta > 0 ? Math.round((totRentabilidad / totVenta) * 1000) / 10 : 0,
    },
  };
}

// ── Rentabilidad REAL de lo vendido en un período ───────────────
// A diferencia de rentabilidadPorCategoria() (que es una foto del stock
// actual), esto suma lo que efectivamente se vendió entre `desde` y
// `hasta`, usando el costo que tenía cada producto AL MOMENTO de esa
// venta (sale_items.price_cost) — y si esa venta es vieja y no lo tiene
// guardado, cae al costo actual del producto como aproximación.
function rentabilidadVentas({ sucursal_id = null, desde = null, hasta = null } = {}) {
  const where = [`COALESCE(s.status,'completada') != 'anulada'`];
  const params = [];
  if (sucursal_id) { where.push(`s.sucursal_id = ?`); params.push(Number(sucursal_id)); }
  if (desde)       { where.push(`DATE(s.created_at) >= ?`); params.push(desde); }
  if (hasta)       { where.push(`DATE(s.created_at) <= ?`); params.push(hasta); }

  const rows = all(
    `SELECT COALESCE(p.category, 'Sin categoría') AS category,
            si.sku AS sku, si.qty AS qty, si.subtotal AS subtotal,
            COALESCE(si.price_cost, p.price_cost, 0) AS price_cost
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.sku = si.sku
     WHERE ${where.join(' AND ')}`,
    params
  );

  const porCategoria = {};
  let totCosto = 0, totVenta = 0, totUnidades = 0;

  for (const r of rows) {
    const cat = r.category;
    const qty = Number(r.qty) || 0;
    const venta = Number(r.subtotal) || 0;
    const costo = (Number(r.price_cost) || 0) * qty;

    if (!porCategoria[cat]) {
      porCategoria[cat] = { categoria: cat, unidades: 0, costo_total: 0, venta_total: 0 };
    }
    porCategoria[cat].unidades += qty;
    porCategoria[cat].costo_total += costo;
    porCategoria[cat].venta_total += venta;

    totUnidades += qty;
    totCosto += costo;
    totVenta += venta;
  }

  const categorias = Object.values(porCategoria).map(c => {
    const rentabilidad = c.venta_total - c.costo_total;
    const margen_pct = c.venta_total > 0 ? (rentabilidad / c.venta_total) * 100 : 0;
    return {
      ...c,
      costo_total: Math.round(c.costo_total * 100) / 100,
      venta_total: Math.round(c.venta_total * 100) / 100,
      rentabilidad: Math.round(rentabilidad * 100) / 100,
      margen_pct: Math.round(margen_pct * 10) / 10,
    };
  }).sort((a, b) => b.venta_total - a.venta_total);

  const totRentabilidad = totVenta - totCosto;
  return {
    categorias,
    totales: {
      unidades: totUnidades,
      costo_total: Math.round(totCosto * 100) / 100,
      venta_total: Math.round(totVenta * 100) / 100,
      rentabilidad: Math.round(totRentabilidad * 100) / 100,
      margen_pct: totVenta > 0 ? Math.round((totRentabilidad / totVenta) * 1000) / 10 : 0,
    },
  };
}

module.exports = { registrar, listar, rentabilidadPorCategoria, rentabilidadVentas };
