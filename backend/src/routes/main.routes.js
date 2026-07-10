// src/routes/main.routes.js
const express = require('express');
const router  = express.Router();

const productsService = require('../services/products.service');
const cajaService     = require('../services/caja.service');
const { get, all, run, db } = require('../db');
const reportesCtrl    = require('../controllers/reportes.controller');

// requirePermiso — si auth.middleware falla, usar passthrough
let requirePermiso = (_sec) => (_req, _res, next) => next();
try {
  const authMw = require('../middlewares/auth.middleware');
  if (typeof authMw.requirePermiso === 'function') {
    requirePermiso = authMw.requirePermiso;
  }
} catch(e) { console.warn('[main.routes] auth.middleware no disponible:', e.message); }

// ─────────────────────────────────────────────────────────────
// Fecha en hora Argentina (UTC-3) — robusta para cualquier zona del server.
// fechaArg(0) = hoy, fechaArg(-1) = ayer, fechaArg(-6) = hace 6 días, etc.
// Devuelve 'YYYY-MM-DD'. El día corta a las 00:00 hora Argentina.
// ─────────────────────────────────────────────────────────────
function fechaArg(offsetDias = 0) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(Date.now() + offsetDias * 86400000));
  } catch (e) {
    // Fallback: restar 3 horas y formatear
    return new Date(Date.now() + offsetDias * 86400000 - 3 * 3600000)
      .toISOString().split('T')[0];
  }
}

// ── Prepared statements del dashboard — se preparan una vez ──
const stmtVentasHoy  = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE DATE(created_at)=?`);
const stmtVentasAyer = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE DATE(created_at)=?`);
const stmtStockBajo  = db.prepare(`SELECT COUNT(*) as count FROM products WHERE stock <= 5`);
const stmtVentasMes  = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE DATE(created_at) >= ?`);
const stmtGastosMes  = db.prepare(`SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE DATE(fecha) >= ?`);
const stmtDeudaProv  = db.prepare(`SELECT COALESCE(SUM(saldo),0) as total FROM proveedores WHERE saldo > 0`);

function getSucursalesService() {
  try { return require('../services/sucursales.service'); } catch(e) { return null; }
}

function getCajaActual(sucursal_id) {
  try { const r = cajaService.getCurrentCaja(sucursal_id); return r.ok ? r.caja : null; }
  catch(e) { try { const r = cajaService.getCurrentCaja(); return r.ok ? r.caja : null; } catch(e2) { return null; } }
}

function getVentasSemana(sucursal_id) {
  try {
    const where = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}` : '';
    return all(`SELECT DATE(created_at) as fecha, COALESCE(SUM(total), 0) as total FROM sales WHERE DATE(created_at) >= ? ${where} GROUP BY DATE(created_at) ORDER BY fecha ASC`, [fechaArg(-6)]);
  } catch(e) { return []; }
}

function getVentasPorMetodo(sucursal_id) {
  try {
    const hoy   = fechaArg(0);
    const where = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}` : '';
    return all(`SELECT payment_method, COALESCE(SUM(total), 0) as total FROM sales WHERE DATE(created_at) = ? ${where} GROUP BY payment_method`, [hoy]);
  } catch(e) { return []; }
}

function getTopProductos(sucursal_id) {
  try {
    const where = sucursal_id ? `AND s.sucursal_id = ${Number(sucursal_id)}` : '';
    return all(`SELECT si.name as name, COALESCE(SUM(si.qty), 0) as cantidad FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE DATE(s.created_at) >= ? ${where} GROUP BY si.name ORDER BY cantidad DESC LIMIT 8`, [fechaArg(-29)]);
  } catch(e) { return []; }
}

function getStats(sucursal_id) {
  try {
    const hoy   = fechaArg(0);
    const ayer  = fechaArg(-1);
    const where = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}` : '';
    const v     = get(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE DATE(created_at)=? ${where}`, [hoy]);
    const vAyer = get(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE DATE(created_at)=? ${where}`, [ayer]);
    const ticket = v.count > 0 ? v.total / v.count : 0;
    const sb    = get(`SELECT COUNT(*) as count FROM products WHERE stock <= 5 ${sucursal_id ? `AND sucursal_id=${Number(sucursal_id)}` : ''}`);
    const fmt   = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0 });
    const diff     = v.total - vAyer.total;
    const diffPct  = vAyer.total > 0 ? Math.round((diff / vAyer.total) * 100) : null;
    const trendVta = diffPct !== null ? (diffPct >= 0 ? `▲ ${diffPct}% vs ayer` : `▼ ${Math.abs(diffPct)}% vs ayer`) : `${v.count} transacciones`;
    return [
      { label: 'Vendido hoy',     value: fmt(v.total), trend: trendVta,                                                icon: 'bi-cash-coin' },
      { label: 'Ticket promedio', value: fmt(ticket),  trend: 'promedio por venta hoy',                                icon: 'bi-receipt' },
      { label: 'Ventas del día',  value: v.count,      trend: `${vAyer.count} ayer`,                                   icon: 'bi-bag-check' },
      { label: 'Stock crítico',   value: sb.count,     trend: sb.count > 0 ? 'productos con poco stock' : '✓ Todo ok', icon: 'bi-exclamation-triangle' },
    ];
  } catch(e) { return []; }
}

function getMetricasExtra(sucursal_id) {
  try {
    const where     = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}` : '';
    const desdeStr  = fechaArg(0).substring(0, 8) + '01';   // primer día del mes, hora Argentina
    const mes = get(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE DATE(created_at) >= ? ${where}`, [desdeStr]);
    const ticketMes = mes.count > 0 ? Math.round(mes.total / mes.count) : 0;
    const estaSemana = get(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE DATE(created_at) >= ? ${where}`, [fechaArg(-6)]);
    const semAnt     = get(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE DATE(created_at) >= ? AND DATE(created_at) < ? ${where}`, [fechaArg(-13), fechaArg(-6)]);
    const diffSem    = semAnt.total > 0 ? Math.round(((estaSemana.total - semAnt.total) / semAnt.total) * 100) : null;
    const horaPico = get(`SELECT CAST(strftime('%H', created_at) AS INTEGER) as hora, COUNT(*) as cant FROM sales WHERE DATE(created_at) >= ? ${where} GROUP BY hora ORDER BY cant DESC LIMIT 1`, [fechaArg(-29)]);
    const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const mejorDia   = get(`SELECT CAST(strftime('%w', created_at) AS INTEGER) as dia, COALESCE(SUM(total),0) as total FROM sales WHERE DATE(created_at) >= ? ${where} GROUP BY dia ORDER BY total DESC LIMIT 1`, [fechaArg(-29)]);
    let anuladas = { count: 0, total: 0 };
    try { anuladas = get(`SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total FROM sales WHERE status='anulada' AND DATE(created_at) >= ? ${where}`, [desdeStr]) || anuladas; } catch(_) {}
    return { ticketMes, ventasMes: { total: mes.total, count: mes.count }, semanaActual: Math.round(estaSemana.total), semanaAnt: Math.round(semAnt.total), diffSemPct: diffSem, horaPico: horaPico ? `${String(horaPico.hora).padStart(2,'0')}:00 hs` : null, mejorDia: mejorDia ? diasSemana[mejorDia.dia] : null, anuladas };
  } catch(e) {
    return { ticketMes: 0, ventasMes: { total: 0, count: 0 }, semanaActual: 0, semanaAnt: 0, diffSemPct: null, horaPico: null, mejorDia: null, anuladas: { count: 0, total: 0 } };
  }
}

function getConfigValue(key, def = '') {
  try { const r = get(`SELECT value FROM config WHERE key=?`, [key]); return r ? r.value : def; } catch(e) { return def; }
}

function getGastosMes() {
  try {
    const desdeStr = fechaArg(0).substring(0, 8) + '01';
    const hastaStr = fechaArg(0);
    const { get: dbGet, all: dbAll } = require('../db');
    // Solo gastos PAGADOS del mes → refleja plata real salida, no compromisos
    const total  = dbGet(
      `SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE pagado = 1 AND COALESCE(fecha_pago, fecha) >= ? AND COALESCE(fecha_pago, fecha) <= ?`,
      [desdeStr, hastaStr]
    )?.total || 0;
    const porCat = dbAll(
      `SELECT categoria, SUM(monto) as total FROM gastos WHERE pagado = 1 AND COALESCE(fecha_pago, fecha) >= ? AND COALESCE(fecha_pago, fecha) <= ? GROUP BY categoria ORDER BY total DESC LIMIT 5`,
      [desdeStr, hastaStr]
    );
    return { total, porCat };
  } catch(e) { return { total: 0, porCat: [] }; }
}

function getVentasMes() {
  try {
    const desdeStr = fechaArg(0).substring(0, 8) + '01';
    const r = get(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE DATE(created_at) >= ?`, [desdeStr]);
    return { total: r?.total || 0, count: r?.count || 0 };
  } catch(e) { return { total: 0, count: 0 }; }
}

function getDeudaProveedores() {
  try { const r = get(`SELECT COALESCE(SUM(saldo),0) as total FROM proveedores WHERE saldo > 0`); return r?.total || 0; } catch(e) { return 0; }
}

function getStockCritico() {
  try { return require('../services/products.service').list().filter(p => p.stock <= 5 && p.stock > 0); } catch(e) { return []; }
}

// ── Resumen del mes: comparativo mes vs mes + ganancia estimada real ──
// Reemplaza la tarjeta de "rentabilidad" alarmista. Usa el costo (price_cost)
// que ya guardan los productos para calcular ganancia REAL (precio - costo).
// Si no hay costos cargados, hayCostos=false y la vista invita a cargarlos.
function getResumenMes(sucursal_id) {
  try {
    const where   = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}`   : '';
    const whereS  = sucursal_id ? `AND s.sucursal_id = ${Number(sucursal_id)}` : '';
    const noAnul  = `AND COALESCE(status,'completada')!='anulada'`;
    const noAnulS = `AND COALESCE(s.status,'completada')!='anulada'`;

    // Fechas en hora Argentina (mismo período: del 1 a hoy, contra el mes anterior a la misma altura)
    const hoyStr = fechaArg(0);
    const [Y, M, D] = hoyStr.split('-').map(Number);
    const pad = n => String(n).padStart(2, '0');
    const desdeMes = `${Y}-${pad(M)}-01`;
    let pY = Y, pM = M - 1; if (pM === 0) { pM = 12; pY = Y - 1; }
    const desdeMesAnt  = `${pY}-${pad(pM)}-01`;
    const lastDayPrev  = new Date(pY, pM, 0).getDate();
    const hastaMesAnt  = `${pY}-${pad(pM)}-${pad(Math.min(D, lastDayPrev))}`;

    const m  = get(`SELECT COALESCE(SUM(total),0) total, COUNT(*) count FROM sales WHERE DATE(created_at) BETWEEN ? AND ? ${noAnul} ${where}`, [desdeMes, hoyStr]) || {};
    const ma = get(`SELECT COALESCE(SUM(total),0) total FROM sales WHERE DATE(created_at) BETWEEN ? AND ? ${noAnul} ${where}`, [desdeMesAnt, hastaMesAnt]) || {};

    const vendidoMes    = m.total || 0;
    const countMes      = m.count || 0;
    const vendidoMesAnt = ma.total || 0;
    const diffMesPct    = vendidoMesAnt > 0 ? Math.round(((vendidoMes - vendidoMesAnt) / vendidoMesAnt) * 100) : null;

    // Ganancia estimada = Σ qty*(precio - costo), solo sobre items con costo cargado
    const g = get(`
      SELECT
        COALESCE(SUM(CASE WHEN p.price_cost IS NOT NULL THEN si.qty*si.price     END),0) AS ingreso_cc,
        COALESCE(SUM(CASE WHEN p.price_cost IS NOT NULL THEN si.qty*p.price_cost END),0) AS costo_cc,
        COALESCE(SUM(CASE WHEN p.price_cost IS NOT NULL THEN si.qty ELSE 0 END),0)       AS u_con_costo,
        COALESCE(SUM(si.qty),0) AS u_total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN (SELECT sku, AVG(price_cost) AS price_cost FROM products WHERE price_cost IS NOT NULL AND price_cost > 0 GROUP BY sku) p
             ON p.sku = si.sku
      WHERE DATE(s.created_at) BETWEEN ? AND ? ${noAnulS} ${whereS}
    `, [desdeMes, hoyStr]) || {};

    const ganancia  = (g.ingreso_cc || 0) - (g.costo_cc || 0);
    const uTotal    = g.u_total || 0;
    const cobertura = uTotal > 0 ? Math.round(((g.u_con_costo || 0) / uTotal) * 100) : 0;

    return { vendidoMes, countMes, vendidoMesAnt, diffMesPct, ganancia, hayCostos: (g.u_con_costo || 0) > 0, cobertura };
  } catch (e) {
    return { vendidoMes: 0, countMes: 0, vendidoMesAnt: 0, diffMesPct: null, ganancia: 0, hayCostos: false, cobertura: 0 };
  }
}

// ── Top productos por GANANCIA (no por cantidad) — últimos 30 días ──
// Usa price_cost. Solo incluye productos con costo cargado. Si no hay costos, []
function getTopGanancia(sucursal_id, limit = 6) {
  try {
    const whereS = sucursal_id ? `AND s.sucursal_id = ${Number(sucursal_id)}` : '';
    return all(`
      SELECT si.name AS name,
             COALESCE(SUM(si.qty),0) AS unidades,
             COALESCE(SUM(si.qty*(si.price - p.price_cost)),0) AS ganancia
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN (SELECT sku, AVG(price_cost) AS price_cost FROM products WHERE price_cost IS NOT NULL AND price_cost > 0 GROUP BY sku) p
        ON p.sku = si.sku
      WHERE DATE(s.created_at) >= ? AND COALESCE(s.status,'completada')!='anulada' ${whereS}
      GROUP BY si.name
      HAVING ganancia > 0
      ORDER BY ganancia DESC
      LIMIT ${Number(limit)}
    `, [fechaArg(-29)]);
  } catch (e) { return []; }
}

// ── Raíz ──────────────────────────────────────────────────────
router.get('/', (req, res) => res.redirect('/dashboard'));

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard', requirePermiso('dashboard'), (req, res) => {
  const user        = req.session?.user || { name: 'Admin', role: 'admin' };
  const sucursal_id = res.locals?.sucursal_filtro ?? null;
  const gastosMes    = getGastosMes();
  const ventasMes    = getVentasMes();
  const deudaProvs   = getDeudaProveedores();
  const stockCritico = getStockCritico();
  res.render('pages/dashboard', {
    title: 'Dashboard', user, active: 'dashboard', activeSub: null, module: 'Dashboard',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'),
    cajaActual:     getCajaActual(res.locals?.sucursal_id || 1),
    stats:          getStats(sucursal_id),
    graficoSemana:  JSON.stringify(getVentasSemana(sucursal_id)),
    graficoMetodos: JSON.stringify(getVentasPorMetodo(sucursal_id)),
    graficoTopProd: JSON.stringify(getTopProductos(sucursal_id)),
    metricasExtra:  getMetricasExtra(sucursal_id),
    resumenMes:     getResumenMes(sucursal_id),
    topGanancia:    getTopGanancia(sucursal_id),
    sucursal:       res.locals?.sucursal || { id: 1, nombre: 'Casa Central' },
    modulo_sucursales: false, recentSales: [],
    gastosMes, ventasMes, deudaProvs, stockCritico
  });
});

// ── Historial ─────────────────────────────────────────────────
router.get('/historial', requirePermiso('historial'), (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  res.render('pages/historial', { title: 'Historial de Ventas', module: 'Historial', active: 'historial', user });
});

// ── Inventario ────────────────────────────────────────────────
router.get('/inventario', requirePermiso('inventario'), (req, res) => {
  const user        = req.session?.user || { name: 'Admin' };
  // sucursal_id: la sucursal activa del usuario (siempre un número)
  // sucursal_filtro: null si el admin ve todo, número si eligió una sucursal
  // Para inventario usamos siempre la sucursal activa (sucursal_id)
  const sucursal_id = res.locals.sucursal_id || 1;
  let products = [];
  try       { products = productsService.list(sucursal_id); }
  catch(e)  { products = productsService.list(); }
  res.render('pages/inventario', {
    title: 'Inventario', user, active: 'inventario', module: 'Inventario',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'), products,
    sucursal_id,
    sucursal:     res.locals.sucursal        || { id: 1, nombre: 'Casa Central' },
    sucursales:   res.locals.sucursales_lista || [],
  });
});

// ── Ventas ────────────────────────────────────────────────────
router.get('/ventas', requirePermiso('ventas'), (req, res) => {
  let config = {};
  try { config = require('../services/config.service').getAll(); } catch(e) {}
  res.render('pages/ventas', {
    title: 'Ventas', user: req.session?.user || { name: 'Admin' },
    active: 'ventas', module: 'Punto de Venta',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'), config,
    sucursal_id: res.locals.sucursal_id || 1,
    sucursal:    res.locals.sucursal    || { id: 1, nombre: 'Casa Central' },
  });
});

// ══════════════════════════════════════════════════════════════
// DEPARTAMENTOS DEL POS (precio manual) — compartidos entre PCs
// Init schema + CRUD inline, sin archivos extra
// ══════════════════════════════════════════════════════════════
(function initDeptosSchema() {
  try {
    run(`CREATE TABLE IF NOT EXISTS departamentos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre     TEXT NOT NULL,
      icono      TEXT DEFAULT '🏷️',
      color      TEXT DEFAULT '#3b82f6',
      orden      INTEGER NOT NULL DEFAULT 0,
      activo     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    // Sin departamentos por defecto: cada cliente crea los que necesite.
    // (La API de crear/editar/borrar sigue igual; solo no se precargan ejemplos.)
    console.log('✅  Departamentos schema OK');
  } catch(e) { console.log('⚠️   Error en departamentos schema:', e.message); }
})();

// GET /departamentos/api — lista todos los activos
router.get('/departamentos/api', (req, res) => {
  try {
    const rows = all(`SELECT id, nombre, icono, color, orden, activo
                      FROM departamentos WHERE activo = 1
                      ORDER BY orden ASC, id ASC`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /departamentos/api — crear
router.post('/departamentos/api', (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const icono = req.body?.icono || '🏷️';
    const color = req.body?.color || '#3b82f6';
    const maxRow = get(`SELECT COALESCE(MAX(orden), 0) as m FROM departamentos`);
    const orden = (maxRow?.m || 0) + 1;
    const r = run(`INSERT INTO departamentos (nombre, icono, color, orden)
                   VALUES (?, ?, ?, ?)`, [nombre, icono, color, orden]);
    const d = get(`SELECT * FROM departamentos WHERE id = ?`, [r.lastInsertRowid]);
    res.status(201).json(d);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// PUT /departamentos/api/:id — modificar
router.put('/departamentos/api/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const d = get(`SELECT * FROM departamentos WHERE id = ?`, [id]);
    if (!d) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    run(`UPDATE departamentos SET
           nombre = ?, icono = ?, color = ?, orden = ?, activo = ?,
           updated_at = datetime('now','localtime')
         WHERE id = ?`,
        [
          b.nombre !== undefined ? String(b.nombre).trim() : d.nombre,
          b.icono  !== undefined ? b.icono  : d.icono,
          b.color  !== undefined ? b.color  : d.color,
          b.orden  !== undefined ? Number(b.orden) : d.orden,
          b.activo !== undefined ? (b.activo ? 1 : 0) : d.activo,
          id,
        ]);
    res.json(get(`SELECT * FROM departamentos WHERE id = ?`, [id]));
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// DELETE /departamentos/api/:id — eliminar
router.delete('/departamentos/api/:id', (req, res) => {
  try {
    const r = run(`DELETE FROM departamentos WHERE id = ?`, [Number(req.params.id)]);
    r.changes > 0 ? res.json({ ok: true }) : res.status(404).json({ error: 'No encontrado' });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
// ══════════════════════════════════════════════════════════════


// ── Clientes ─────────────────────────────────────────────────
router.get('/clientes', requirePermiso('clientes'), (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  let clientes = [];
  try { const clientesSvc = require('../services/clientes.service'); clientes = clientesSvc.list(); } catch(e) {}
  res.render('pages/clientes', {
    title: 'Clientes', user, active: 'clientes', module: 'Clientes',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'),
    clientes, sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── Ajustes ───────────────────────────────────────────────────
router.get('/ajustes', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  const empresa = {
    nombre:    getConfigValue('empresa_nombre',   'Mi Comercio'),
    cuit:      getConfigValue('empresa_cuit',     ''),
    telefono:  getConfigValue('empresa_telefono', ''),
    direccion: getConfigValue('empresa_direccion',''),
    email:     getConfigValue('empresa_email',    ''),
  };
  let metodosPago = [];
  try { metodosPago = all(`SELECT * FROM payment_methods ORDER BY id ASC`); } catch(e) {
    metodosPago = [{ id:1, name:'Efectivo' }, { id:2, name:'Débito' }, { id:3, name:'Crédito' }, { id:4, name:'Transferencia' }];
  }
  let usuarios = [];
  try { const authSvc = require('../services/auth.service'); usuarios = authSvc.listUsers(); } catch(e) {}
  let config = {};
  try { config = require('../services/config.service').getAll(); } catch(e) {}
  res.render('pages/ajustes', {
    title: 'Ajustes', user, active: 'ajustes', module: 'Ajustes',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'),
    empresa, metodosPago, usuarios, config,
    sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── Sucursales (solo admin) ───────────────────────────────────
router.get('/sucursales', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  if (user.role !== 'admin') return res.redirect('/dashboard');
  const sucSvc = getSucursalesService();
  if (!sucSvc) return res.redirect('/ajustes');
  const sucursales = sucSvc.list();
  const stats = {};
  for (const s of sucursales) {
    try { stats[s.id] = sucSvc.getStats(s.id); } catch(e) { stats[s.id] = { ventasHoy: { total: 0, count: 0 } }; }
  }
  res.render('pages/sucursales', {
    title: 'Sucursales', user, active: 'sucursales', module: 'Sucursales',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'),
    sucursales, stats, es_admin: true,
    sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── Reportes ──────────────────────────────────────────────────
router.get('/reportes/caja', reportesCtrl.caja);
router.get('/reportes',      (req, res) => res.redirect('/reportes/caja'));

// ── Reporte de ventas por rango de fechas ─────────────────────
router.get('/reportes/ventas', requirePermiso('reportes'), (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  res.render('pages/reporte_ventas', {
    title: 'Reporte de Ventas', module: 'Reportes', active: 'reportes', user,
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'),
    sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' },
  });
});

// API: datos JSON para el reporte
router.get('/api/reportes/ventas', (req, res) => {
  try {
    const desde = String(req.query.desde || '').trim();
    const hasta = String(req.query.hasta || '').trim();
    if (!desde || !hasta) return res.status(400).json({ ok: false, error: 'Fechas requeridas' });

    const sucursal_id = res.locals?.sucursal_filtro ?? null;
    const sWhere = sucursal_id ? `AND s.sucursal_id = ${Number(sucursal_id)}` : '';

    const resumen = get(
      `SELECT COALESCE(SUM(s.total),0) as total, COUNT(*) as count
       FROM sales s
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada' ${sWhere}`,
      [desde, hasta]
    );

    const productos = all(
      `SELECT si.name, COALESCE(p.category,'Sin categoría') as category,
              COALESCE(SUM(si.qty),0) as cantidad,
              COALESCE(SUM(si.subtotal), SUM(si.qty * si.price), 0) as total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.sku = si.sku
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada' ${sWhere}
       GROUP BY si.name
       ORDER BY cantidad DESC
       LIMIT 100`,
      [desde, hasta]
    );

    const categorias = all(
      `SELECT COALESCE(p.category,'Sin categoría') as category,
              COUNT(DISTINCT si.name) as productos_distintos,
              COALESCE(SUM(si.qty),0) as cantidad,
              COALESCE(SUM(si.subtotal), SUM(si.qty * si.price), 0) as total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.sku = si.sku
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada' ${sWhere}
       GROUP BY category
       ORDER BY total DESC`,
      [desde, hasta]
    );

    const metodos = all(
      `SELECT COALESCE(payment_method,'Sin método') as payment_method,
              COUNT(*) as count,
              COALESCE(SUM(total),0) as total
       FROM sales s
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada' ${sWhere}
       GROUP BY payment_method
       ORDER BY total DESC`,
      [desde, hasta]
    );

    const departamentos = all(
      `SELECT si.name AS departamento,
              COUNT(DISTINCT s.id) as transacciones,
              COALESCE(SUM(si.qty),0) as cantidad,
              COALESCE(SUM(si.subtotal), SUM(si.qty * si.price), 0) as total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada'
         AND (si.sku LIKE 'DEPTO-%' OR si.sku LIKE 'BAL-%') ${sWhere}
       GROUP BY si.name
       ORDER BY total DESC`,
      [desde, hasta]
    );

    res.json({
      ok: true,
      total_ventas: resumen?.total || 0,
      count_ventas: resumen?.count || 0,
      productos,
      categorias,
      metodos,
      departamentos,
    });
  } catch(e) {
    console.error('API reporte ventas:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Página de Novedades del sistema ───────────────────────────
// Sin requirePermiso: todos los usuarios pueden leer qué cambió.
router.get('/novedades', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  let novedades = [];
  try {
    const fs = require('fs');
    const path = require('path');
    const p = path.join(__dirname, '../../../changelog.json');
    if (fs.existsSync(p)) {
      novedades = JSON.parse(fs.readFileSync(p, 'utf8')).novedades || [];
    }
  } catch(e) { console.error('changelog:', e.message); }

  res.render('pages/novedades', {
    title: 'Novedades', user, active: 'novedades', module: 'Novedades',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'),
    novedades,
    sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── Reporte de descuentos y precios modificados ───────────────
// (se muestra como pestaña dentro de /reportes/ventas)

// API: datos JSON del reporte de descuentos
router.get('/api/reportes/descuentos', (req, res) => {
  try {
    const desde = String(req.query.desde || '').trim();
    const hasta = String(req.query.hasta || '').trim();
    if (!desde || !hasta) return res.status(400).json({ ok: false, error: 'Fechas requeridas' });

    const sucursal_id = res.locals?.sucursal_filtro ?? null;
    const sWhere = sucursal_id ? `AND s.sucursal_id = ${Number(sucursal_id)}` : '';

    // Una fila por venta, con su subtotal real y lo resignado en precios editados a mano
    const ventas = all(
      `SELECT
         s.id, s.created_at, s.total,
         COALESCE(s.usuario, '') AS usuario,
         COALESCE(s.discount_pct, 0)   AS discount_pct,
         COALESCE(s.discount_fixed, 0) AS discount_fixed,
         (SELECT COALESCE(SUM(COALESCE(si.subtotal, si.price * si.qty)), 0)
            FROM sale_items si WHERE si.sale_id = s.id) AS subtotal,
         (SELECT COALESCE(SUM((COALESCE(si.price_original, si.price) - si.price) * si.qty), 0)
            FROM sale_items si WHERE si.sale_id = s.id AND COALESCE(si.precio_editado,0) = 1) AS ajuste_manual,
         (SELECT COUNT(*)
            FROM sale_items si WHERE si.sale_id = s.id AND COALESCE(si.precio_editado,0) = 1) AS precios_editados
       FROM sales s
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada' ${sWhere}
       ORDER BY s.id DESC`,
      [desde, hasta]
    );

    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

    // El descuento general puede ser % o monto fijo: lo llevamos a pesos
    const detalle = ventas.map(v => {
      const subtotal = r2(v.subtotal);
      let descuento_monto = 0;
      if (Number(v.discount_pct) > 0)        descuento_monto = subtotal * (Math.min(Number(v.discount_pct), 100) / 100);
      else if (Number(v.discount_fixed) > 0) descuento_monto = Math.min(Number(v.discount_fixed), subtotal);

      return {
        id: v.id,
        created_at: v.created_at,
        usuario: v.usuario || null,
        total: r2(v.total),
        subtotal,
        discount_pct: Number(v.discount_pct) || 0,
        discount_fixed: r2(v.discount_fixed),
        descuento_monto: r2(descuento_monto),
        ajuste_manual: r2(v.ajuste_manual),
        precios_editados: Number(v.precios_editados) || 0,
        resignado_total: r2(descuento_monto + r2(v.ajuste_manual)),
      };
    });

    // Solo las ventas que efectivamente tuvieron descuento o precio tocado
    const conDescuento = detalle.filter(d => d.descuento_monto > 0 || d.precios_editados > 0);

    // Agrupado por vendedor, para ver quién descuenta más
    const porVendedorMap = new Map();
    for (const d of conDescuento) {
      const k = d.usuario || 'Sin registrar';
      const acc = porVendedorMap.get(k) || {
        usuario: k, ventas: 0, descuento_general: 0, ajuste_manual: 0, total_resignado: 0, precios_editados: 0,
      };
      acc.ventas            += 1;
      acc.descuento_general += d.descuento_monto;
      acc.ajuste_manual     += d.ajuste_manual;
      acc.total_resignado   += d.resignado_total;
      acc.precios_editados  += d.precios_editados;
      porVendedorMap.set(k, acc);
    }
    const porVendedor = [...porVendedorMap.values()]
      .map(a => ({
        ...a,
        descuento_general: r2(a.descuento_general),
        ajuste_manual: r2(a.ajuste_manual),
        total_resignado: r2(a.total_resignado),
      }))
      .sort((a, b) => b.total_resignado - a.total_resignado);

    const sum = (arr, f) => r2(arr.reduce((s, x) => s + f(x), 0));
    const totalVendido = sum(detalle, d => d.total);
    const totalDesc    = sum(detalle, d => d.descuento_monto);
    const totalAjuste  = sum(detalle, d => d.ajuste_manual);
    const totalResign  = r2(totalDesc + totalAjuste);

    res.json({
      ok: true,
      desde, hasta,
      resumen: {
        ventas_total: detalle.length,
        ventas_con_descuento: conDescuento.length,
        total_vendido: totalVendido,
        descuento_general: totalDesc,
        ajuste_manual: totalAjuste,
        total_resignado: totalResign,
        // Cuánto se resignó respecto de lo que se podría haber facturado
        pct_sobre_vendido: totalVendido > 0 ? r2((totalResign / (totalVendido + totalResign)) * 100) : 0,
      },
      por_vendedor: porVendedor,
      ventas: conDescuento,
    });
  } catch(e) {
    console.error('API reporte descuentos:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API: exportar Excel
router.get('/api/reportes/ventas/export', (req, res) => {
  try {
    const desde = String(req.query.desde || '').trim();
    const hasta = String(req.query.hasta || '').trim();
    if (!desde || !hasta) return res.status(400).send('Fechas requeridas');

    const sucursal_id = res.locals?.sucursal_filtro ?? null;
    const sWhere = sucursal_id ? `AND s.sucursal_id = ${Number(sucursal_id)}` : '';

    const productos = all(
      `SELECT si.name as Producto,
              COALESCE(p.category,'Sin categoría') as Categoría,
              COALESCE(SUM(si.qty),0) as "Cant. vendida",
              COALESCE(SUM(si.subtotal), SUM(si.qty * si.price), 0) as "Total $"
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.sku = si.sku
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada' ${sWhere}
       GROUP BY si.name
       ORDER BY "Cant. vendida" DESC`,
      [desde, hasta]
    );

    const categorias = all(
      `SELECT COALESCE(p.category,'Sin categoría') as Categoría,
              COUNT(DISTINCT si.name) as "Productos distintos",
              COALESCE(SUM(si.qty),0) as "Cant. vendida",
              COALESCE(SUM(si.subtotal), SUM(si.qty * si.price), 0) as "Total $"
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.sku = si.sku
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada' ${sWhere}
       GROUP BY Categoría
       ORDER BY "Total $" DESC`,
      [desde, hasta]
    );

    const metodos = all(
      `SELECT COALESCE(payment_method,'Sin método') as "Método de pago",
              COUNT(*) as Transacciones,
              COALESCE(SUM(total),0) as "Total $"
       FROM sales s
       WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND COALESCE(s.status,'completada') != 'anulada' ${sWhere}
       GROUP BY payment_method
       ORDER BY "Total $" DESC`,
      [desde, hasta]
    );

    const XLSX = require('xlsx');
    const wb   = XLSX.utils.book_new();

    // Hoja 1 — Productos
    const wsProds = XLSX.utils.json_to_sheet(productos.map(p => ({
      'Producto':       p.Producto,
      'Categoría':      p['Categoría'],
      'Cant. vendida':  Number(p['Cant. vendida']),
      'Total $':        Number(Number(p['Total $']).toFixed(2)),
    })));
    wsProds['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsProds, 'Productos');

    // Hoja 2 — Categorías
    const wsCats = XLSX.utils.json_to_sheet(categorias.map(c => ({
      'Categoría':           c['Categoría'],
      'Productos distintos': Number(c['Productos distintos']),
      'Cant. vendida':       Number(c['Cant. vendida']),
      'Total $':             Number(Number(c['Total $']).toFixed(2)),
    })));
    wsCats['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsCats, 'Categorías');

    // Hoja 3 — Métodos de pago
    const wsMet = XLSX.utils.json_to_sheet(metodos.map(m => ({
      'Método de pago': m['Método de pago'],
      'Transacciones':  Number(m['Transacciones']),
      'Total $':        Number(Number(m['Total $']).toFixed(2)),
    })));
    wsMet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsMet, 'Métodos de pago');

    const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `reporte_ventas_${desde}_${hasta}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch(e) {
    console.error('Export reporte ventas:', e.message);
    res.status(500).send('Error al exportar');
  }
});

// ── Cambiar sucursal ──────────────────────────────────────────
router.post('/api/cambiar-sucursal', (req, res) => {
  try {
    const sucSvc = getSucursalesService();
    if (!sucSvc) return res.status(404).json({ error: 'Módulo no disponible' });
    const sucursal_id = Number(req.body.sucursal_id);
    if (!sucursal_id) return res.status(400).json({ error: 'sucursal_id requerido' });
    const suc = sucSvc.findById(sucursal_id);
    if (!suc || !suc.activa) return res.status(404).json({ error: 'Sucursal no encontrada' });
    const user = req.session?.user;
    if (user?.role !== 'admin' && user?.sucursal_id !== sucursal_id) {
      return res.status(403).json({ error: 'Sin permiso para cambiar de sucursal' });
    }
    req.session.sucursal_activa = sucursal_id;
    req.session.save(() => { res.json({ ok: true, sucursal: suc }); });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Logout ────────────────────────────────────────────────────
router.get('/logout',  (req, res) => { req.session?.destroy(() => res.redirect('/login')); });
router.post('/logout', (req, res) => { req.session?.destroy(() => res.redirect('/login')); });

// ── Reporte métodos de pago ───────────────────────────────────
router.get('/dashboard/reportes/metodos', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  res.render('pages/reporte_metodos', {
    title: 'Reporte Métodos de Pago', user, active: 'dashboard', activeSub: 'reporte_metodos', module: 'Dashboard',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'),
    sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' },
  });
});

// ── Stock ─────────────────────────────────────────────────────
router.get('/stock', requirePermiso('stock'), (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  const { run: dbRun } = require('../db');
  try { dbRun(`ALTER TABLE products ADD COLUMN hay INTEGER NOT NULL DEFAULT 1`); } catch(e) {}
  let products = [];
  try {
    products = all(`SELECT id, sku, name, category, stock, pesable, hay, COALESCE(venta_sin_stock,0) as venta_sin_stock FROM products ORDER BY category, name`);
  } catch(e) {
    try { products = all(`SELECT id, sku, name, category, stock, pesable, 1 as hay, COALESCE(venta_sin_stock,0) as venta_sin_stock FROM products ORDER BY category, name`); } catch(e2) {}
  }
  res.render('pages/stock', {
    title: 'Stock', user, active: 'stock', module: 'Stock',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'),
    products, sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── Stock qty/hay (solo admin) ────────────────────────────────
router.post('/stock/qty', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  const { id, stock } = req.body;
  if (!id || stock == null || isNaN(parseInt(stock))) return res.json({ ok: false });
  try {
    const existencias = require('../services/existencias.service');
    const prod = get(`SELECT sku, sucursal_id FROM products WHERE id = ?`, [parseInt(id)]);
    if (!prod) return res.json({ ok: false, error: 'Producto no encontrado' });
    // Fuente de verdad = existencias por sucursal. setStock además espeja
    // products.stock, así la pantalla de Stock y el punto de venta quedan en sintonía.
    const sucursalId = res.locals?.sucursal_id || prod.sucursal_id || 1;
    existencias.setStock(prod.sku, sucursalId, parseInt(stock), {
      motivo: 'Ajuste desde pantalla de Stock',
      usuario: user?.name || null,
    });
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/stock/hay', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  const { id, hay } = req.body;
  if (!id || hay == null) return res.json({ ok: false });
  try {
    const { run: dbRun } = require('../db');
    dbRun(`UPDATE products SET hay = ? WHERE id = ?`, [hay ? 1 : 0, parseInt(id)]);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ── PDF Faltantes ─────────────────────────────────────────────
router.get('/stock/pdf-faltantes', (req, res) => {
  const { run: dbRun } = require('../db');
  try { dbRun(`ALTER TABLE products ADD COLUMN hay INTEGER NOT NULL DEFAULT 1`); } catch(e) {}
  let faltantes = [];
  try {
    const normales = all(`SELECT name, sku, category, stock FROM products WHERE pesable = 0 AND stock <= 0 ORDER BY category, name`);
    normales.forEach(p => faltantes.push({ ...p, tipo: 'cantidad', detalle: 'Sin stock' }));
    const pesables = all(`SELECT name, sku, category FROM products WHERE pesable = 1 AND (hay = 0 OR hay IS NULL) ORDER BY category, name`);
    pesables.forEach(p => faltantes.push({ ...p, tipo: 'pesable', detalle: 'No hay' }));
  } catch(e) {}
  const empresaNombre = getConfigValue('empresa_nombre', 'Mi Comercio');
  const fecha = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const hora  = new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
  const porCat = {};
  faltantes.forEach(p => { const cat = p.category || 'Sin categoría'; if (!porCat[cat]) porCat[cat] = []; porCat[cat].push(p); });
  let filas = '';
  for (const [cat, items] of Object.entries(porCat)) {
    filas += `<tr class="cat-row"><td colspan="4">${cat}</td></tr>`;
    items.forEach(p => {
      const badge = p.tipo === 'pesable' ? `<span class="badge-tipo pesable">Pesable</span>` : `<span class="badge-tipo cantidad">Cantidad</span>`;
      filas += `<tr><td>${p.name}</td><td style="font-family:monospace;font-size:11px;color:#888">${p.sku}</td><td>${badge}</td><td><span class="badge-faltante">${p.detalle}</span></td></tr>`;
    });
  }
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Faltantes de Stock</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;padding:30px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;border-bottom:3px solid #f97316;padding-bottom:16px}.header-left h1{font-size:22px;font-weight:800;color:#f97316}.header-right{text-align:right;font-size:12px;color:#888;line-height:1.7}.resumen{background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:14px 18px;margin-bottom:22px;display:flex;align-items:center;gap:12px}.resumen .num{font-size:28px;font-weight:900;color:#f97316}.resumen .txt{font-size:13px;color:#92400e}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f97316;color:#fff;padding:10px 14px;text-align:left;font-weight:700;font-size:11.5px;text-transform:uppercase}td{padding:10px 14px;border-bottom:1px solid #f0f0f0}.cat-row td{background:#fff7ed;color:#c2410c;font-weight:800;font-size:11.5px;text-transform:uppercase}.badge-tipo{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700}.badge-tipo.pesable{background:#ede9fe;color:#6d28d9}.badge-tipo.cantidad{background:#e0f2fe;color:#0369a1}.badge-faltante{display:inline-block;padding:3px 9px;border-radius:20px;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:700}.footer{margin-top:28px;text-align:center;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:14px}@media print{body{padding:15px}}</style>
</head><body>
<div class="header"><div class="header-left"><h1>📦 Reporte de Faltantes</h1><p>${empresaNombre}</p></div><div class="header-right"><strong>Fecha:</strong> ${fecha}<br><strong>Hora:</strong> ${hora}<br><strong>Total:</strong> ${faltantes.length}</div></div>
<div class="resumen"><div class="num">${faltantes.length}</div><div class="txt"><strong>Productos sin stock</strong><br>${faltantes.filter(p=>p.tipo==='cantidad').length} sin cantidad · ${faltantes.filter(p=>p.tipo==='pesable').length} pesables sin existencia</div></div>
${faltantes.length === 0 ? '<div style="text-align:center;padding:50px;color:#aaa;">✅ ¡No hay faltantes!</div>' : `<table><thead><tr><th>Producto</th><th>SKU</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>`}
<div class="footer">AxSoft · ${fecha} ${hora}</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;