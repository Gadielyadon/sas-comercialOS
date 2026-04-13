// src/routes/api.routes.js
const express = require('express');
const router  = express.Router();

const productsCtrl = require('../controllers/products.controller');
const salesCtrl    = require('../controllers/sales.controller');
const cajaCtrl     = require('../controllers/caja.controller');

// ── Migración: columnas de comisiones en payment_methods ──────
// Se ejecuta UNA vez al arrancar. ALTER TABLE falla silenciosamente si ya existe.
try {
  const { db } = require('../db');
  // Columnas nuevas (nombre, tipo, icono, color) por si viene de una DB vieja
  const cols = db.prepare(`PRAGMA table_info(payment_methods)`).all().map(c => c.name);
  if (!cols.includes('nombre'))              db.prepare(`ALTER TABLE payment_methods ADD COLUMN nombre TEXT`).run();
  if (!cols.includes('tipo'))               db.prepare(`ALTER TABLE payment_methods ADD COLUMN tipo TEXT DEFAULT 'otro'`).run();
  if (!cols.includes('icono'))              db.prepare(`ALTER TABLE payment_methods ADD COLUMN icono TEXT DEFAULT 'bi-cash'`).run();
  if (!cols.includes('color'))              db.prepare(`ALTER TABLE payment_methods ADD COLUMN color TEXT DEFAULT 'cyan'`).run();
  if (!cols.includes('recargo_cliente_pct'))  db.prepare(`ALTER TABLE payment_methods ADD COLUMN recargo_cliente_pct  REAL DEFAULT 0`).run();
  if (!cols.includes('comision_interna_pct')) db.prepare(`ALTER TABLE payment_methods ADD COLUMN comision_interna_pct REAL DEFAULT 0`).run();
  // Si la tabla tenía 'name' pero no 'nombre', migrar datos
  if (cols.includes('name') && !cols.includes('nombre_migrado')) {
    db.prepare(`UPDATE payment_methods SET nombre = name WHERE nombre IS NULL OR nombre = ''`).run();
  }
} catch(e) { console.warn('[api.routes] Migración payment_methods:', e.message); }

// ── Health ────────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Products ──────────────────────────────────────────────────
router.get('/products',              productsCtrl.list);
router.post('/products',             productsCtrl.create);
router.get('/products/:sku',         productsCtrl.getBySku);
router.put('/products/:sku',         productsCtrl.update);
router.patch('/products/:sku/stock', productsCtrl.adjustStock);
router.delete('/products/:sku',      productsCtrl.remove);
router.get('/products.csv',          productsCtrl.exportCsv);
router.get('/products.xlsx',         productsCtrl.exportXlsx);

// ── Sales ─────────────────────────────────────────────────────
router.post('/sales',       salesCtrl.create);
router.get('/sales/recent', salesCtrl.recent);

router.get('/ventas/buscar', (req, res) => {
  try {
    const { all } = require('../db');
    const { desde, hasta, metodo, q, page = 1, status, limit: limitParam } = req.query;
    const limit  = Math.min(Number(limitParam) || 20, 200);
    const offset = (Number(page) - 1) * limit;

    const conditions = [];
    const params     = [];

    if (desde)  { conditions.push(`DATE(s.created_at) >= ?`); params.push(desde); }
    if (hasta)  { conditions.push(`DATE(s.created_at) <= ?`); params.push(hasta); }
    if (metodo) { conditions.push(`s.payment_method = ?`);    params.push(metodo); }
    if (status && status !== 'todas') {
      conditions.push(`COALESCE(s.status,'completada') = ?`);
      params.push(status);
    }

    if (q) {
      conditions.push(`(
        CAST(s.id AS TEXT) LIKE ?
        OR si.name LIKE ?
        OR CAST(f.nro_cbte AS TEXT) LIKE ?
        OR f.cae LIKE ?
        OR f.cliente_nombre LIKE ?
        OR f.cliente_cuit LIKE ?
      )`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const user = req.session?.user;
    if (user && user.role !== 'admin' && user.sucursal_id) {
      conditions.push(`s.sucursal_id = ?`);
      params.push(Number(user.sucursal_id));
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const totalRow = all(`
      SELECT COUNT(DISTINCT s.id) as total
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN facturas f    ON f.sale_id = s.id
      ${where}
    `, params)[0];
    const total = totalRow?.total || 0;

    const ventas = all(`
      SELECT DISTINCT
        s.id, s.total, s.payment_method, s.created_at,
        s.cash_received, s.change_amount,
        COALESCE(s.monto_mixto2, NULL) AS monto_mixto2,
        COALESCE(s.status,'completada') AS status,
        s.anulacion_motivo, s.anulada_at, s.anulada_by,
        f.id          AS factura_id,
        f.tipo_cbte   AS factura_tipo_cbte,
        f.punto_venta AS factura_punto_venta,
        f.nro_cbte    AS factura_nro_cbte,
        f.cae         AS factura_cae,
        f.cae_vto     AS factura_cae_vto,
        f.created_at  AS factura_created_at
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN facturas f    ON f.sale_id = s.id
      ${where}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const ventasConItems = ventas.map(v => {
      const items = all(`SELECT * FROM sale_items WHERE sale_id = ?`, [v.id]);
      const tipoLetra = ({1:'A',6:'B',11:'C'})[Number(v.factura_tipo_cbte)] || null;
      return { ...v, facturada: !!v.factura_id, factura_tipo_letra: tipoLetra, items };
    });

    res.json({ ventas: ventasConItems, total, page: Number(page), limit });
  } catch(e) {
    console.error('Error en /api/ventas/buscar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/ventas/:id/anular ────────────────────────────────
router.post('/ventas/:id/anular', (req, res) => {
  try {
    const { anularVenta } = require('../services/sales.service');
    const sale_id = Number(req.params.id);
    const { motivo } = req.body;
    const usuario = req.session?.user?.name || 'Admin';

    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ error: 'El motivo de anulación es obligatorio' });
    }

    const result = anularVenta({ sale_id, motivo: motivo.trim(), usuario });
    res.json(result);
  } catch(e) {
    console.error('Anular venta error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// ── Caja ──────────────────────────────────────────────────────
router.post('/caja/open',    cajaCtrl.open);
router.post('/caja/close',   cajaCtrl.close);
router.get('/caja/current',  cajaCtrl.current);
router.get('/reportes/caja', cajaCtrl.view);

// ── Payment Methods ───────────────────────────────────────────

// Asegurar que la tabla existe con todas las columnas
function ensurePMTable(db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS payment_methods (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre               TEXT    NOT NULL DEFAULT '',
    tipo                 TEXT    NOT NULL DEFAULT 'otro',
    icono                TEXT    NOT NULL DEFAULT 'bi-cash',
    color                TEXT    NOT NULL DEFAULT 'cyan',
    activo               INTEGER NOT NULL DEFAULT 1,
    recargo_cliente_pct  REAL    NOT NULL DEFAULT 0,
    comision_interna_pct REAL    NOT NULL DEFAULT 0
  )`).run();
}

router.get('/payment-methods', (req, res) => {
  try {
    const { all, db } = require('../db');
    ensurePMTable(db);
    const showAll = req.query.all === '1';
    const rows = showAll
      ? all(`SELECT * FROM payment_methods ORDER BY id ASC`)
      : all(`SELECT * FROM payment_methods WHERE activo = 1 ORDER BY id ASC`);

    // Normalizar: si nombre está vacío, usar el campo 'name' legacy
    const normalized = rows.map(r => ({
      ...r,
      nombre: r.nombre || r.name || 'Pago',
      icono:  r.icono  || 'bi-cash',
      tipo:   r.tipo   || 'otro',
      recargo_cliente_pct:  r.recargo_cliente_pct  || 0,
      comision_interna_pct: r.comision_interna_pct || 0,
    }));

    if (normalized.length) return res.json(normalized);

    // Fallback si la tabla está vacía: insertar defaults
    const defaults = [
      { nombre:'Efectivo',     tipo:'efectivo', icono:'bi-cash-stack',          color:'green' },
      { nombre:'Débito',       tipo:'otro',     icono:'bi-credit-card',          color:'blue'  },
      { nombre:'Crédito',      tipo:'otro',     icono:'bi-credit-card-2-front',  color:'purple'},
      { nombre:'Transferencia',tipo:'otro',     icono:'bi-phone',                color:'cyan'  },
    ];
    const ins = db.prepare(`INSERT INTO payment_methods (nombre,tipo,icono,color,activo,recargo_cliente_pct,comision_interna_pct) VALUES (?,?,?,?,1,0,0)`);
    defaults.forEach(d => ins.run(d.nombre, d.tipo, d.icono, d.color));
    res.json(all(`SELECT * FROM payment_methods ORDER BY id ASC`));
  } catch(e) {
    console.error('[GET /payment-methods]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET individual (para editar)
router.get('/payment-methods/:id', (req, res) => {
  try {
    const { get } = require('../db');
    const row = get(`SELECT * FROM payment_methods WHERE id = ?`, [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json({
      ...row,
      nombre: row.nombre || row.name || '',
      recargo_cliente_pct:  row.recargo_cliente_pct  || 0,
      comision_interna_pct: row.comision_interna_pct || 0,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/payment-methods', (req, res) => {
  try {
    const { run, all, db } = require('../db');
    ensurePMTable(db);
    const {
      nombre, tipo = 'otro', icono = 'bi-cash', color = 'cyan',
      recargo_cliente_pct = 0, comision_interna_pct = 0
    } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    run(`INSERT INTO payment_methods (nombre, tipo, icono, color, activo, recargo_cliente_pct, comision_interna_pct)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [String(nombre), String(tipo), String(icono), String(color),
       Number(recargo_cliente_pct) || 0, Number(comision_interna_pct) || 0]);
    res.json(all(`SELECT * FROM payment_methods ORDER BY id ASC`));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/payment-methods/:id', (req, res) => {
  try {
    const { run, all } = require('../db');
    const {
      nombre, tipo = 'otro', icono = 'bi-cash', color = 'cyan', activo,
      recargo_cliente_pct = 0, comision_interna_pct = 0
    } = req.body;
    run(`UPDATE payment_methods
         SET nombre=?, tipo=?, icono=?, color=?, activo=?,
             recargo_cliente_pct=?, comision_interna_pct=?
         WHERE id=?`,
      [String(nombre), String(tipo), String(icono), String(color),
       activo !== undefined ? (activo ? 1 : 0) : 1,
       Number(recargo_cliente_pct) || 0, Number(comision_interna_pct) || 0,
       Number(req.params.id)]);
    res.json(all(`SELECT * FROM payment_methods ORDER BY id ASC`));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Toggle activo/inactivo
router.patch('/payment-methods/:id/toggle', (req, res) => {
  try {
    const { run, get } = require('../db');
    const row = get(`SELECT activo FROM payment_methods WHERE id=?`, [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    run(`UPDATE payment_methods SET activo=? WHERE id=?`, [row.activo ? 0 : 1, Number(req.params.id)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/payment-methods/:id', (req, res) => {
  try {
    const { run } = require('../db');
    run(`DELETE FROM payment_methods WHERE id=?`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Clientes ──────────────────────────────────────────────────
router.get('/clientes/buscar', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    res.json(require('../services/clientes.service').search(q));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/clientes', (req, res) => {
  try {
    const { q } = req.query;
    const svc = require('../services/clientes.service');
    res.json(q ? svc.search(q) : svc.list());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/clientes/:id/movimientos', (req, res) => {
  try {
    const { all } = require('../db');
    res.json(all(`SELECT * FROM cuenta_corriente WHERE cliente_id = ? ORDER BY id DESC`, [Number(req.params.id)]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/clientes/:id', (req, res) => {
  try {
    const c = require('../services/clientes.service').findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrado' });
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/clientes', (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
    res.status(201).json(require('../services/clientes.service').create(req.body));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/clientes/:id', (req, res) => {
  try {
    const u = require('../services/clientes.service').update(req.params.id, req.body);
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    res.json(u);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/clientes/:id', (req, res) => {
  try {
    const ok = require('../services/clientes.service').remove(req.params.id);
    if (!ok) return res.status(400).json({ error: 'No se puede eliminar' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/clientes/:id/cargo', (req, res) => {
  try {
    const { run } = require('../db');
    const { monto, descripcion } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'monto inválido' });
    run(`INSERT INTO cuenta_corriente (cliente_id, tipo, monto, descripcion) VALUES (?, 'cargo', ?, ?)`,
      [Number(req.params.id), Number(monto), descripcion || 'Cargo manual']);
    run(`UPDATE clientes SET saldo = saldo + ? WHERE id = ?`, [Number(monto), Number(req.params.id)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/clientes/:id/pago', (req, res) => {
  try {
    const { run } = require('../db');
    const { monto, descripcion } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'monto inválido' });
    run(`INSERT INTO cuenta_corriente (cliente_id, tipo, monto, descripcion) VALUES (?, 'pago', ?, ?)`,
      [Number(req.params.id), Number(monto), descripcion || 'Pago manual']);
    run(`UPDATE clientes SET saldo = saldo - ? WHERE id = ?`, [Number(monto), Number(req.params.id)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Sucursales ────────────────────────────────────────────────
router.get('/sucursales', (req, res) => {
  try { res.json(require('../services/sucursales.service').list()); }
  catch(e) { res.json([{ id: 1, nombre: 'Casa Central', activa: 1 }]); }
});
router.post('/sucursales', (req, res) => {
  try { res.status(201).json(require('../services/sucursales.service').create(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.put('/sucursales/:id', (req, res) => {
  try {
    const u = require('../services/sucursales.service').update(req.params.id, req.body);
    if (!u) return res.status(404).json({ error: 'No encontrada' });
    res.json(u);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
router.delete('/sucursales/:id', (req, res) => {
  try {
    const r = require('../services/sucursales.service').remove(req.params.id);
    if (!r.ok) return res.status(400).json(r);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Config ────────────────────────────────────────────────────
router.get('/config', (req, res) => {
  try {
    const { all } = require('../db');
    const rows = all(`SELECT key, value FROM config`);
    const cfg  = {};
    rows.forEach(r => { cfg[r.key] = r.value; });
    res.json(cfg);
  } catch(e) { res.json({}); }
});

router.put('/config', (req, res) => {
  try {
    const { run } = require('../db');
    run(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`);
    for (const [key, value] of Object.entries(req.body)) {
      run(`INSERT INTO config (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(key), value !== null && value !== undefined ? String(value) : '']);
    }
    const { all } = require('../db');
    const rows = all(`SELECT key, value FROM config`);
    const cfg  = {};
    rows.forEach(r => { cfg[r.key] = r.value; });
    res.json(cfg);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/config', (req, res) => {
  try {
    const { run } = require('../db');
    run(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`);
    for (const [key, value] of Object.entries(req.body)) {
      run(`INSERT INTO config (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(key), String(value)]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Users ─────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  try { res.json(require('../services/auth.service').listUsers()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', (req, res) => {
  try { res.status(201).json(require('../services/auth.service').createUser(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

router.put('/users/:id', (req, res) => {
  try { res.json(require('../services/auth.service').updateUser(Number(req.params.id), req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

router.delete('/users/:id', (req, res) => {
  try { require('../services/auth.service').deleteUser(Number(req.params.id)); res.json({ ok: true }); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

router.patch('/users/:id/password', (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Mínimo 4 caracteres' });
    require('../services/auth.service').changePassword(Number(req.params.id), password);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Reporte métodos de pago ────────────────────────────────────
router.get('/reporte/metodos', (req, res) => {
  try {
    const { all } = require('../db');
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });

    const ventas = all(`
      SELECT id, total, payment_method, created_at
      FROM sales
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
      ORDER BY id DESC
    `, [desde, hasta]);

    // Traer comisiones configuradas
    const pms = all(`SELECT nombre, comision_interna_pct FROM payment_methods`);
    const comisionMap = {};
    pms.forEach(p => { comisionMap[p.nombre] = p.comision_interna_pct || 0; });

    const mapa = {};
    ventas.forEach(v => {
      const m = v.payment_method || 'Sin método';
      if (!mapa[m]) mapa[m] = { metodo: m, total: 0, cantidad: 0, comision_pct: comisionMap[m] || 0 };
      mapa[m].total    += Number(v.total);
      mapa[m].cantidad += 1;
    });

    // Calcular comisión neta
    Object.values(mapa).forEach(m => {
      m.comision_monto = m.total * (m.comision_pct / 100);
      m.neto           = m.total - m.comision_monto;
    });

    res.json({
      metodos: Object.values(mapa).sort((a, b) => b.total - a.total),
      ventas,
      desde,
      hasta,
      totalGeneral: ventas.reduce((s, v) => s + Number(v.total), 0),
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reporte/metodos.xlsx — exportación Excel
router.get('/reporte/metodos.xlsx', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { all } = require('../db');
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });

    const ventas = all(`
      SELECT id, total, payment_method, created_at
      FROM sales WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
      ORDER BY id DESC
    `, [desde, hasta]);

    const pms = all(`SELECT nombre, comision_interna_pct FROM payment_methods`);
    const comisionMap = {};
    pms.forEach(p => { comisionMap[p.nombre] = p.comision_interna_pct || 0; });

    const mapa = {};
    ventas.forEach(v => {
      const m = v.payment_method || 'Sin método';
      if (!mapa[m]) mapa[m] = { metodo: m, total: 0, cantidad: 0, comision_pct: comisionMap[m] || 0 };
      mapa[m].total    += Number(v.total);
      mapa[m].cantidad += 1;
    });
    Object.values(mapa).forEach(m => {
      m.comision_monto = m.total * (m.comision_pct / 100);
      m.neto           = m.total - m.comision_monto;
    });

    const metodos = Object.values(mapa).sort((a, b) => b.total - a.total);
    const totalBruto    = metodos.reduce((s, m) => s + m.total, 0);
    const totalComision = metodos.reduce((s, m) => s + m.comision_monto, 0);
    const totalNeto     = totalBruto - totalComision;
    const fmt = n => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });

    const wb = XLSX.utils.book_new();

    // ── Hoja 1: Resumen ──
    const resumenData = [
      ['REPORTE DE VENTAS POR MÉTODO DE PAGO'],
      [`Período: ${desde} al ${hasta}`],
      [],
      ['TOTAL BRUTO', `$${fmt(totalBruto)}`],
      ['COMISIONES', `- $${fmt(totalComision)}`],
      ['LO QUE TE LLEGA', `$${fmt(totalNeto)}`],
      ['TRANSACCIONES', ventas.length],
      [],
      ['RESUMEN POR MÉTODO'],
      ['Método', 'Transacciones', 'Ticket Promedio', 'Total Bruto', 'Comisión %', 'Comisión $', 'Lo que te llega'],
      ...metodos.map(m => [
        m.metodo,
        m.cantidad,
        m.cantidad > 0 ? Number((m.total / m.cantidad).toFixed(2)) : 0,
        m.total,
        m.comision_pct > 0 ? `${m.comision_pct}%` : '—',
        m.comision_monto > 0 ? -m.comision_monto : '—',
        m.neto,
      ]),
      [],
      ['TOTAL', ventas.length, '—', totalBruto, '—', totalComision > 0 ? -totalComision : '—', totalNeto],
    ];

    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen['!cols'] = [{wch:28},{wch:14},{wch:16},{wch:16},{wch:12},{wch:14},{wch:16}];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-metodos-${desde}-${hasta}.xlsx"`);
    res.send(buf);
  } catch(e) {
    console.error('reporte xlsx =>', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/historial.xlsx — exportación Excel completa con categoría, lista de precios y resúmenes
router.get('/historial.xlsx', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { all } = require('../db');
    const { desde, hasta, metodo, q } = req.query;

    const fmt  = n => Number(n || 0);
    const peso = n => fmt(n); // numérico para que Excel lo tome como número

    // ── Condiciones de filtro ──
    let conditions = ["COALESCE(s.status,'completada') != 'anulada'"];
    let params = [];
    if (desde)  { conditions.push(`DATE(s.created_at) >= ?`); params.push(desde); }
    if (hasta)  { conditions.push(`DATE(s.created_at) <= ?`); params.push(hasta); }
    if (metodo && metodo !== 'todos') { conditions.push(`s.payment_method LIKE ?`); params.push(`%${metodo}%`); }
    if (q)      { conditions.push(`(CAST(s.id AS TEXT) LIKE ? OR si.name LIKE ? OR si.sku LIKE ?)`); params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    const where = 'WHERE ' + conditions.join(' AND ');

    const ventas = all(`
      SELECT DISTINCT s.id, s.total, s.payment_method, s.created_at,
        COALESCE(s.status,'completada') AS status,
        c.nombre AS cliente_nombre
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN clientes c ON c.id = s.cliente_id
      ${where}
      ORDER BY s.id DESC
    `, params);

    const wb = XLSX.utils.book_new();

    // ══════════════════════════════════════════════
    // HOJA 1 — Detalle completo por ítem
    // ══════════════════════════════════════════════
    const h1 = [['Venta N°','Fecha','Hora','Método de pago','Cliente','Estado',
      'SKU','Producto','Categoría','Lista de precios',
      'Precio unitario','Precio costo','Margen %','Cantidad','Subtotal','Total venta']];

    ventas.forEach(v => {
      const d     = new Date(v.created_at.replace(' ','T'));
      const fecha = d.toLocaleDateString('es-AR');
      const hora  = d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
      const cliente = v.cliente_nombre || 'Consumidor Final';

      const items = all(`
        SELECT si.sku, si.name, si.price, si.qty, si.subtotal,
               p.price_cost, p.margen, p.category,
               p.price        AS p_minorista,
               p.price_mayorista AS p_mayorista,
               p.price_tarjeta AS p_tarjeta
        FROM sale_items si
        LEFT JOIN products p ON p.sku = si.sku
        WHERE si.sale_id = ?
      `, [v.id]);

      if (!items.length) {
        h1.push([v.id, fecha, hora, v.payment_method, cliente, v.status,
          '—','—','—','—', 0,0,0,0,0, peso(v.total)]);
        return;
      }

      items.forEach((it, idx) => {
        const costo  = fmt(it.price_cost);
        const margen = costo > 0
          ? Number(((fmt(it.price) - costo) / costo * 100).toFixed(1))
          : (it.margen ? fmt(it.margen) : '');

        // Detectar lista de precios comparando precio vendido con precios del producto
        let lista = 'Minorista';
        const pv = fmt(it.price);
        if (it.p_mayorista && Math.abs(pv - fmt(it.p_mayorista)) < 0.01) lista = 'Mayorista';
        else if (it.p_tarjeta && Math.abs(pv - fmt(it.p_tarjeta)) < 0.01) lista = 'Tarjeta';

        h1.push([
          idx === 0 ? v.id        : '',
          idx === 0 ? fecha       : '',
          idx === 0 ? hora        : '',
          idx === 0 ? v.payment_method : '',
          idx === 0 ? cliente     : '',
          idx === 0 ? v.status    : '',
          it.sku    || '—',
          it.name,
          it.category || 'Sin categoría',
          lista,
          peso(it.price),
          costo  || '',
          margen || '',
          fmt(it.qty),
          peso(it.subtotal),
          idx === 0 ? peso(v.total) : '',
        ]);
      });
    });

    const ws1 = XLSX.utils.aoa_to_sheet(h1);
    ws1['!cols'] = [
      {wch:9},{wch:12},{wch:7},{wch:18},{wch:20},{wch:12},
      {wch:16},{wch:32},{wch:18},{wch:14},
      {wch:14},{wch:13},{wch:10},{wch:10},{wch:12},{wch:13}
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Detalle ventas');

    // ══════════════════════════════════════════════
    // HOJA 2 — Resumen por categoría
    // ══════════════════════════════════════════════
    const catMap = {};
    ventas.forEach(v => {
      const items = all(`
        SELECT si.name, si.price, si.qty, si.subtotal, p.category
        FROM sale_items si
        LEFT JOIN products p ON p.sku = si.sku
        WHERE si.sale_id = ?
      `, [v.id]);
      items.forEach(it => {
        const cat = it.category || 'Sin categoría';
        if (!catMap[cat]) catMap[cat] = { unidades: 0, subtotal: 0 };
        catMap[cat].unidades += fmt(it.qty);
        catMap[cat].subtotal += fmt(it.subtotal);
      });
    });
    const h2 = [['Categoría','Unidades vendidas','Total facturado']];
    Object.entries(catMap).sort((a,b) => b[1].subtotal - a[1].subtotal).forEach(([cat, d]) => {
      h2.push([cat, d.unidades, peso(d.subtotal)]);
    });
    h2.push(['TOTAL',
      Object.values(catMap).reduce((s,d)=>s+d.unidades,0),
      peso(Object.values(catMap).reduce((s,d)=>s+d.subtotal,0))
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet(h2);
    ws2['!cols'] = [{wch:24},{wch:18},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Por categoría');

    // ══════════════════════════════════════════════
    // HOJA 3 — Resumen por lista de precios
    // ══════════════════════════════════════════════
    const listaMap = { Minorista:{items:0,subtotal:0}, Mayorista:{items:0,subtotal:0}, Tarjeta:{items:0,subtotal:0} };
    ventas.forEach(v => {
      const items = all(`
        SELECT si.price, si.qty, si.subtotal,
               p.price AS p_minorista, p.price_mayorista AS p_mayorista, p.price_tarjeta AS p_tarjeta
        FROM sale_items si LEFT JOIN products p ON p.sku = si.sku
        WHERE si.sale_id = ?
      `, [v.id]);
      items.forEach(it => {
        const pv = fmt(it.price);
        let lista = 'Minorista';
        if (it.p_mayorista && Math.abs(pv - fmt(it.p_mayorista)) < 0.01) lista = 'Mayorista';
        else if (it.p_tarjeta && Math.abs(pv - fmt(it.p_tarjeta)) < 0.01) lista = 'Tarjeta';
        listaMap[lista].items    += fmt(it.qty);
        listaMap[lista].subtotal += fmt(it.subtotal);
      });
    });
    const h3 = [['Lista de precios','Unidades','Total facturado']];
    Object.entries(listaMap).forEach(([lista, d]) => {
      h3.push([lista, d.items, peso(d.subtotal)]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(h3);
    ws3['!cols'] = [{wch:18},{wch:12},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws3, 'Por lista de precios');

    // ══════════════════════════════════════════════
    // HOJA 4 — Resumen por método de pago
    // ══════════════════════════════════════════════
    const metodMap = {};
    ventas.forEach(v => {
      const m = v.payment_method || 'Sin método';
      if (!metodMap[m]) metodMap[m] = { ventas: 0, total: 0 };
      metodMap[m].ventas++;
      metodMap[m].total += fmt(v.total);
    });
    const h4 = [['Método de pago','Cantidad de ventas','Total recaudado']];
    Object.entries(metodMap).sort((a,b)=>b[1].total-a[1].total).forEach(([m,d])=>{
      h4.push([m, d.ventas, peso(d.total)]);
    });
    h4.push(['TOTAL', ventas.length, peso(ventas.reduce((s,v)=>s+fmt(v.total),0))]);
    const ws4 = XLSX.utils.aoa_to_sheet(h4);
    ws4['!cols'] = [{wch:22},{wch:20},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws4, 'Por método de pago');

    // ── Enviar ──
    const periodo = desde && hasta ? `${desde}-${hasta}` : new Date().toISOString().split('T')[0];
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="historial-ventas-${periodo}.xlsx"`);
    res.send(buf);
  } catch(e) {
    console.error('historial xlsx =>', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/notificaciones — chequea stock bajo, pedidos urgentes, recordatorios
// Cache de 30s para no sobrecargar la DB en cada poll del cliente
let _notifCache = null;
let _notifCacheAt = 0;
const _NOTIF_TTL = 30000;

router.get('/notificaciones', (req, res) => {
  try {
    const now = Date.now();
    if (_notifCache && (now - _notifCacheAt) < _NOTIF_TTL) {
      return res.json(_notifCache);
    }
    const { all, get: dbGet } = require('../db');
    const notifs = [];

    // ── Stock bajo (≤ 3 unidades, no pesables, no sin-control-stock) ──
    try {
      const bajos = all(`
        SELECT id, sku, name, stock FROM products
        WHERE pesable = 0 AND COALESCE(venta_sin_stock,0) = 0
          AND stock > 0 AND stock <= 3
        ORDER BY stock ASC LIMIT 10
      `);
      bajos.forEach(p => {
        notifs.push({
          tipo: 'stock_bajo',
          icono: 'bi-exclamation-triangle-fill',
          color: '#f59e0b',
          titulo: `Stock bajo: ${p.name}`,
          detalle: `Solo quedan ${p.stock} unidad${p.stock > 1 ? 'es' : ''}`,
          link: '/inventario',
          id: `stock_${p.id}`,
        });
      });
    } catch(e) {}

    // ── Sin stock (= 0, no pesables) ──
    try {
      const sinStock = all(`
        SELECT id, sku, name FROM products
        WHERE pesable = 0 AND COALESCE(venta_sin_stock,0) = 0 AND stock <= 0
        ORDER BY name ASC LIMIT 8
      `);
      sinStock.forEach(p => {
        notifs.push({
          tipo: 'sin_stock',
          icono: 'bi-x-circle-fill',
          color: '#ef4444',
          titulo: `Sin stock: ${p.name}`,
          detalle: 'Stock agotado',
          link: '/inventario',
          id: `sinstock_${p.id}`,
        });
      });
    } catch(e) {}

    // ── Pedidos urgentes pendientes ──
    try {
      const urgentes = all(`
        SELECT id, titulo, cliente, recordatorio FROM pedidos
        WHERE estado = 'pendiente' AND prioridad = 'urgente'
        ORDER BY created_at ASC LIMIT 5
      `);
      urgentes.forEach(p => {
        notifs.push({
          tipo: 'pedido_urgente',
          icono: 'bi-journal-check',
          color: '#ef4444',
          titulo: `Pedido urgente: ${p.titulo}`,
          detalle: p.cliente ? `Cliente: ${p.cliente}` : 'Sin cliente asignado',
          link: '/pedidos',
          id: `pedido_${p.id}`,
        });
      });
    } catch(e) {}

    // ── Recordatorios vencidos o para hoy ──
    try {
      const hoy = new Date().toISOString().split('T')[0];
      const recordatorios = all(`
        SELECT id, titulo, tipo, recordatorio FROM pedidos
        WHERE estado = 'pendiente' AND recordatorio IS NOT NULL AND recordatorio <= ?
        ORDER BY recordatorio ASC LIMIT 5
      `, [hoy]);
      recordatorios.forEach(p => {
        const vencido = p.recordatorio < hoy;
        notifs.push({
          tipo: 'recordatorio',
          icono: 'bi-bell-fill',
          color: '#d97706',
          titulo: `Recordatorio: ${p.titulo}`,
          detalle: vencido ? `Venció el ${p.recordatorio}` : 'Para hoy',
          link: '/pedidos',
          id: `rec_${p.id}`,
        });
      });
    } catch(e) {}

    // ── Fiados pendientes (cuentas corrientes sin saldar) ──
    try {
      const fiados = all(`
        SELECT COUNT(*) as n, COALESCE(SUM(total),0) as total
        FROM sales WHERE payment_method = 'Fiado'
          AND COALESCE(status,'completada') = 'completada'
          AND DATE(created_at) >= DATE('now','-30 days')
      `);
      if (fiados[0]?.n > 0) {
        notifs.push({
          tipo: 'fiado',
          icono: 'bi-cash-coin',
          color: '#6366f1',
          titulo: `${fiados[0].n} venta${fiados[0].n > 1 ? 's' : ''} fiada${fiados[0].n > 1 ? 's' : ''} (últimos 30 días)`,
          detalle: `Total: $${Number(fiados[0].total).toLocaleString('es-AR',{minimumFractionDigits:2})}`,
          link: '/historial',
          id: 'fiados_pendientes',
        });
      }
    } catch(e) {}

    const result = { notifs, total: notifs.length };
    _notifCache = result;
    _notifCacheAt = Date.now();
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message, notifs: [], total: 0 });
  }
});


// ── Exportar Excel de Gastos ──────────────────────────────────
router.get('/gastos.xlsx', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const gastosService = require('../services/gastos.service');
    const { desde, hasta, categoria } = req.query;
    const hoy = new Date().toISOString().split('T')[0];
    const gastos  = gastosService.list({ desde: desde || hoy, hasta: hasta || hoy, categoria });
    const resumen = gastosService.getResumen({ desde: desde || hoy, hasta: hasta || hoy });
    const fmt = n => Number(n || 0);
    const fmtF = f => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-AR') : '';

    const wb = XLSX.utils.book_new();
    const h1 = [['Fecha','Categoría','Descripción','Forma de pago','Estado','Monto']];
    gastos.forEach(g => {
      h1.push([fmtF(g.fecha), g.categoria||'Otros', g.descripcion||'',
               g.metodo_pago||'-', g.pagado?'Pagado':'Pendiente', fmt(g.monto)]);
    });
    h1.push(['','','','','TOTAL', fmt(resumen.total)]);
    const ws1 = XLSX.utils.aoa_to_sheet(h1);
    ws1['!cols'] = [{wch:12},{wch:18},{wch:36},{wch:16},{wch:12},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Gastos');

    const h2 = [['Categoría','Cantidad','Total']];
    (resumen.porCategoria||[]).forEach(cat => h2.push([cat.categoria, cat.cantidad, fmt(cat.total)]));
    h2.push(['TOTAL', gastos.length, fmt(resumen.total)]);
    const ws2 = XLSX.utils.aoa_to_sheet(h2);
    ws2['!cols'] = [{wch:22},{wch:10},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Por categoría');

    const periodo = desde && hasta ? `${desde}-${hasta}` : hoy;
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="gastos-${periodo}.xlsx"`);
    res.send(buf);
  } catch(e) {
    console.error('gastos xlsx =>', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
