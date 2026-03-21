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

// ── Sales ─────────────────────────────────────────────────────
router.post('/sales',       salesCtrl.create);
router.get('/sales/recent', salesCtrl.recent);

router.get('/ventas/buscar', (req, res) => {
  try {
    const { all } = require('../db');
    const { desde, hasta, metodo, q, page = 1 } = req.query;
    const limit  = 20;
    const offset = (Number(page) - 1) * limit;

    const conditions = [];
    const params     = [];

    if (desde)  { conditions.push(`DATE(s.created_at) >= ?`); params.push(desde); }
    if (hasta)  { conditions.push(`DATE(s.created_at) <= ?`); params.push(hasta); }
    if (metodo) { conditions.push(`s.payment_method = ?`);    params.push(metodo); }

    if (q) {
      conditions.push(`
        (
          CAST(s.id AS TEXT) LIKE ?
          OR si.name LIKE ?
          OR CAST(f.nro_cbte AS TEXT) LIKE ?
          OR f.cae LIKE ?
          OR f.cliente_nombre LIKE ?
          OR f.cliente_cuit LIKE ?
        )
      `);
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
        s.id,
        s.total,
        s.payment_method,
        s.created_at,
        s.cash_received,
        s.change_amount,

        f.id            AS factura_id,
        f.tipo_cbte     AS factura_tipo_cbte,
        f.punto_venta   AS factura_punto_venta,
        f.nro_cbte      AS factura_nro_cbte,
        f.cae           AS factura_cae,
        f.cae_vto       AS factura_cae_vto,
        f.created_at    AS factura_created_at
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN facturas f    ON f.sale_id = s.id
      ${where}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const ventasConItems = ventas.map(v => {
      const items = all(`SELECT * FROM sale_items WHERE sale_id = ?`, [v.id]);

      const tipoLetra = ({
        1: 'A',
        6: 'B',
        11: 'C'
      })[Number(v.factura_tipo_cbte)] || null;

      return {
        ...v,
        facturada: !!v.factura_id,
        factura_tipo_letra: tipoLetra,
        items
      };
    });

    res.json({ ventas: ventasConItems, total, page: Number(page), limit });
  } catch(e) {
    console.error('Error en /api/ventas/buscar:', e.message);
    res.status(500).json({ error: e.message });
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

module.exports = router;
