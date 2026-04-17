// src/routes/main.routes.js
const express = require('express');
const router  = express.Router();

const productsService = require('../services/products.service');
const cajaService     = require('../services/caja.service');
const { get, all, db } = require('../db');
const reportesCtrl    = require('../controllers/reportes.controller');

// requirePermiso — si auth.middleware falla, usar passthrough
let requirePermiso = (_sec) => (_req, _res, next) => next();
try {
  const authMw = require('../middlewares/auth.middleware');
  if (typeof authMw.requirePermiso === 'function') {
    requirePermiso = authMw.requirePermiso;
  }
} catch(e) { console.warn('[main.routes] auth.middleware no disponible:', e.message); }

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
    return all(`SELECT DATE(created_at) as fecha, COALESCE(SUM(total), 0) as total FROM sales WHERE created_at >= datetime('now', '-6 days') ${where} GROUP BY DATE(created_at) ORDER BY fecha ASC`);
  } catch(e) { return []; }
}

function getVentasPorMetodo(sucursal_id) {
  try {
    const hoy   = new Date().toISOString().split('T')[0];
    const where = sucursal_id ? `AND sucursal_id = ${Number(sucursal_id)}` : '';
    return all(`SELECT payment_method, COALESCE(SUM(total), 0) as total FROM sales WHERE DATE(created_at) = ? ${where} GROUP BY payment_method`, [hoy]);
  } catch(e) { return []; }
}

function getTopProductos(sucursal_id) {
  try {
    const where = sucursal_id ? `AND s.sucursal_id = ${Number(sucursal_id)}` : '';
    return all(`SELECT si.name as name, COALESCE(SUM(si.qty), 0) as cantidad FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.created_at >= datetime('now', '-30 days') ${where} GROUP BY si.name ORDER BY cantidad DESC LIMIT 8`);
  } catch(e) { return []; }
}

function getStats(sucursal_id) {
  try {
    const hoy   = new Date().toISOString().split('T')[0];
    const ayer  = new Date(Date.now() - 86400000).toISOString().split('T')[0];
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
    const inicioMes = new Date(); inicioMes.setDate(1);
    const desdeStr  = inicioMes.toISOString().split('T')[0];
    const mes = get(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE DATE(created_at) >= ? ${where}`, [desdeStr]);
    const ticketMes = mes.count > 0 ? Math.round(mes.total / mes.count) : 0;
    const estaSemana = get(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE created_at >= datetime('now','-6 days') ${where}`);
    const semAnt     = get(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE created_at >= datetime('now','-13 days') AND created_at < datetime('now','-6 days') ${where}`);
    const diffSem    = semAnt.total > 0 ? Math.round(((estaSemana.total - semAnt.total) / semAnt.total) * 100) : null;
    const horaPico = get(`SELECT CAST(strftime('%H', created_at) AS INTEGER) as hora, COUNT(*) as cant FROM sales WHERE created_at >= datetime('now','-30 days') ${where} GROUP BY hora ORDER BY cant DESC LIMIT 1`);
    const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const mejorDia   = get(`SELECT CAST(strftime('%w', created_at) AS INTEGER) as dia, COALESCE(SUM(total),0) as total FROM sales WHERE created_at >= datetime('now','-30 days') ${where} GROUP BY dia ORDER BY total DESC LIMIT 1`);
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
    const desde = new Date(); desde.setDate(1);
    const desdeStr = desde.toISOString().split('T')[0];
    const { get: dbGet, all: dbAll } = require('../db');
    const total = dbGet(`SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE fecha >= ?`, [desdeStr])?.total || 0;
    const porCat = dbAll(`SELECT categoria, SUM(monto) as total FROM gastos WHERE fecha >= ? GROUP BY categoria ORDER BY total DESC LIMIT 5`, [desdeStr]);
    return { total, porCat };
  } catch(e) { return { total: 0, porCat: [] }; }
}

function getVentasMes() {
  try {
    const desde = new Date(); desde.setDate(1);
    const desdeStr = desde.toISOString().split('T')[0];
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
  const sucursal_id = res.locals?.sucursal_filtro ?? null;
  let products = [];
  try       { products = productsService.list(sucursal_id); }
  catch(e)  { products = productsService.list(); }
  res.render('pages/inventario', {
    title: 'Inventario', user, active: 'inventario', module: 'Inventario',
    empresaNombre: getConfigValue('empresa_nombre', 'Mi Comercio'), products
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
  });
});

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
  if (user.role !== 'admin') return res.json({ ok: false, error: 'Sin permiso' });
  const { id, stock } = req.body;
  if (!id || stock == null || isNaN(parseInt(stock))) return res.json({ ok: false });
  try {
    const { run: dbRun } = require('../db');
    dbRun(`UPDATE products SET stock = ? WHERE id = ?`, [parseInt(stock), parseInt(id)]);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.post('/stock/hay', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  if (user.role !== 'admin') return res.json({ ok: false, error: 'Sin permiso' });
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