// src/routes/caja.routes.js
const express  = require('express');
const router   = express.Router();
const cajaSvc  = require('../services/caja.service');
const salesSvc = require('../services/sales.service');
const { run, get, all } = require('../db');

const getUser = req => req.session?.user?.name || req.session?.user?.username || 'Admin';

function cajaActual(req) {
  try { const r = cajaSvc.getCurrentCaja(req.session?.user?.sucursal_id || 1); return r.ok ? r.caja : null; }
  catch(e) { try { const r = cajaSvc.getCurrentCaja(); return r.ok ? r.caja : null; } catch(e2) { return null; } }
}

function ventasDelTurno(sucursal_id) {
  try { return salesSvc.listToday(sucursal_id); }
  catch(e) { try { return salesSvc.listToday(); } catch(e2) { return []; } }
}

/* ── GET /caja ── panel principal (funciona con o sin caja abierta) */
router.get('/', (req, res) => {
  const user      = req.session?.user || { name: 'Admin', role: 'admin' };
  const suc_id    = user.sucursal_id || 1;
  const caja      = cajaActual(req);
  const ventas    = caja ? ventasDelTurno(suc_id) : [];
  const total     = ventas.reduce((s, v) => s + v.total, 0);
  const porMetodo = {};
  ventas.forEach(v => { porMetodo[v.payment_method] = (porMetodo[v.payment_method] || 0) + v.total; });

  let movimientos = [], totalMov = 0;
  if (caja) {
    try { movimientos = cajaSvc.getMovimientos(caja.id); } catch(e) {}
    totalMov = movimientos.reduce((s, m) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), 0);
  }

  let historial = [];
  try { historial = cajaSvc.getHistorial ? cajaSvc.getHistorial(user.role === 'admin' ? null : suc_id, 20) : []; }
  catch(e) {}

  res.render('pages/caja_turno', {
    title: 'Caja', user, active: 'caja', module: 'Caja',
    cajaActual: caja,
    ventasTurno: ventas,
    totalTurno: total,
    porMetodo,
    movimientos,
    totalMovimientos: totalMov,
    historial,
    sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

/* ── GET /caja/abrir ── formulario separado (si no hay caja abierta) */
router.get('/abrir', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  const caja = cajaActual(req);
  if (caja) return res.redirect('/caja');
  res.render('pages/caja_abrir', {
    title: 'Abrir Caja', user, active: 'caja', module: 'Caja',
    sucursal: res.locals?.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

/* ── GET /caja/resumen/:id  →  JSON con datos completos del turno ── */
router.get('/resumen/:id', (req, res) => {
  try {
    const caja_id = Number(req.params.id);
    const caja    = get(`SELECT * FROM caja WHERE id = ?`, [caja_id]);
    if (!caja) return res.status(404).json({ error: 'Turno no encontrado' });

    const hasta = caja.closed_at || new Date().toISOString();
    const ventas = all(`
      SELECT id, total, payment_method, created_at
      FROM sales
      WHERE created_at >= ? AND created_at <= ?
      ${caja.sucursal_id ? 'AND sucursal_id = ?' : ''}
      ORDER BY id ASC
    `, caja.sucursal_id
        ? [caja.opened_at, hasta, caja.sucursal_id]
        : [caja.opened_at, hasta]
    );

    const desglose = {};
    ventas.forEach(v => {
      const m = v.payment_method || 'Otro';
      if (!desglose[m]) desglose[m] = { total: 0, cantidad: 0 };
      desglose[m].total    += v.total;
      desglose[m].cantidad += 1;
    });
    const desgloseArr = Object.entries(desglose).map(([metodo, d]) => ({
      metodo, total: d.total, cantidad: d.cantidad
    }));

    let movimientos = [];
    try { movimientos = all(`SELECT * FROM caja_movimientos WHERE caja_id = ? ORDER BY id ASC`, [caja_id]); }
    catch(e) {}

    const totalVentas   = ventas.reduce((s, v) => s + v.total, 0);
    const totalEfectivo = ventas.filter(v => (v.payment_method||'').toLowerCase() === 'efectivo')
                                .reduce((s, v) => s + v.total, 0);
    const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + m.monto, 0);
    const retiros  = movimientos.filter(m => m.tipo === 'retiro' ).reduce((s,m) => s + m.monto, 0);
    const efectivoEsperado = (caja.monto_inicial || 0) + totalEfectivo + ingresos - retiros;

    res.json({ caja, ventas, desglose: desgloseArr, movimientos, totalVentas, totalEfectivo, efectivoEsperado, ingresos, retiros });
  } catch(e) {
    console.error('resumen caja:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /caja/api/abrir  →  JSON (usado por el modal en caja_turno) ── */
router.post('/api/abrir', (req, res) => {
  try {
    const monto = parseFloat(req.body.montoInicial) || 0;
    const suc   = req.session?.user?.sucursal_id || 1;
    try { cajaSvc.open(getUser(req), suc, monto); }
    catch(e) { cajaSvc.open(getUser(req), 1, monto); }
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ── POST /caja/abrir  (form tradicional desde caja_abrir.ejs) ── */
router.post('/abrir', (req, res) => {
  const monto = parseFloat(req.body.monto_inicial) || 0;
  const suc   = req.session?.user?.sucursal_id || 1;
  try   { cajaSvc.open(getUser(req), suc, monto); }
  catch(e) { try { cajaSvc.open(getUser(req)); } catch(e2) {} }
  res.redirect('/caja');
});

/* ── POST /caja/cerrar ── */
router.post('/cerrar', (req, res) => {
  const suc = req.session?.user?.sucursal_id || 1;
  try   { cajaSvc.close(getUser(req), suc); }
  catch(e) { try { cajaSvc.close(getUser(req)); } catch(e2) {} }
  res.redirect('/caja');
});

/* ── POST /caja/movimiento ── */
router.post('/movimiento', (req, res) => {
  const caja = cajaActual(req);
  if (!caja) return res.redirect('/caja');
  try {
    run(`INSERT INTO caja_movimientos (caja_id, tipo, monto, descripcion) VALUES (?, ?, ?, ?)`,
      [caja.id, req.body.tipo, parseFloat(req.body.monto) || 0, req.body.descripcion || '']);
  } catch(e) { console.error('movimiento:', e.message); }
  res.redirect('/caja');
});

/* ── Rutas de compatibilidad ── */
router.get('/reporte', (req, res) => res.redirect('/caja'));
router.get('/turno',   (req, res) => res.redirect('/caja'));

module.exports = router;
