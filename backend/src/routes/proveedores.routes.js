// src/routes/proveedores.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/proveedores.service');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');

router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  let pedidosPorProveedor = {};
  try {
    const pedSvc = require('../services/pedidos.service');
    const proveedores = svc.list();
    proveedores.forEach(p => {
      pedidosPorProveedor[p.id] = pedSvc.getPedidosByProveedor(p.id);
    });
  } catch(e) {}
  const metricas = svc.getMetricas ? svc.getMetricas() : null;
  res.render('pages/Proveedores', {
    title: 'Proveedores', module: 'Proveedores', active: 'proveedores',
    user: { name: req.session.user.nombre || req.session.user.username, role: req.session.user.role },
    proveedores: svc.list(),
    pedidosPorProveedor,
    metricas,
  });
});

// API métricas
router.get('/api/metricas', (req, res) => {
  try { res.json(svc.getMetricas()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// API
router.get('/api',                     (req, res) => res.json(svc.list()));

// ⚠️  Esta ruta DEBE ir antes de /api/:id o Express toma 'productos' como :id
router.get('/api/productos/buscar', (req, res) => {
  try {
    const q   = String(req.query.q || '').trim();
    const suc = req.session?.user?.sucursal_id || null;
    if (!q) return res.json([]);
    const { all: dbAll } = require('../db');
    const term    = `%${q}%`;
    const sucFilt = suc ? `AND sucursal_id = ${Number(suc)}` : '';
    const params2 = [term, term];
    let where2 = 'WHERE (name LIKE ? OR sku LIKE ?)';
    if (suc) { where2 += ` AND sucursal_id = ${Number(suc)}`; }
    params2.push(`${q}%`);
    const rows = dbAll(
      `SELECT sku, name, stock, COALESCE(price_cost,0) as price_cost, price, category
       FROM products ${where2}
       ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name ASC LIMIT 12`,
      params2
    );
    res.json(rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/:id/movs', (req, res) => res.json(svc.getMovimientos(req.params.id)));
router.get('/api/:id',      (req, res) => {
  const p = svc.findById(req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'No encontrado' });
});

router.post('/api', (req, res) => {
  try { res.status(201).json(svc.create(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

router.put('/api/:id', (req, res) => {
  const u = svc.update(req.params.id, req.body);
  u ? res.json(u) : res.status(404).json({ error: 'No encontrado' });
});

router.delete('/api/:id', (req, res) => {
  svc.remove(req.params.id);
  res.json({ ok: true });
});

router.post('/api/:id/factura', (req, res) => {
  try { res.json(svc.registrarFactura(req.params.id, req.body.monto, req.body.descripcion, req.body.nro_factura)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

router.post('/api/:id/pago', (req, res) => {
  try { res.json(svc.registrarPago(req.params.id, req.body.monto, req.body.descripcion)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Recepción de mercadería ───────────────────────────────────
router.get('/api/:id/recepciones', (req, res) => {
  try { res.json(svc.getRecepciones(req.params.id)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/:id/recepcion', (req, res) => {
  try {
    const { nro_factura, descripcion, items } = req.body;
    const sucursal_id = req.session?.user?.sucursal_id || 1;
    const result = svc.recibirMercaderia({
      proveedor_id: req.params.id,
      nro_factura, descripcion, items, sucursal_id,
    });
    res.status(201).json({ ok: true, ...result });
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Pagos parciales por pedido ────────────────────────────────
// GET pagos de un pedido
router.get('/api/pedido/:pedidoId/pagos', (req, res) => {
  try {
    const pedSvc = require('../services/pedidos.service');
    const pagos  = pedSvc.getPagosPedido(req.params.pedidoId);
    const items  = pedSvc.getItems(req.params.pedidoId);
    const total  = items.reduce((s,i) => s + (Number(i.cantidad)*Number(i.precio_costo||0)), 0);
    const pagado = pagos.reduce((s,p) => s + Number(p.monto), 0);
    res.json({ pagos, total, pagado, pendiente: Math.max(0, total - pagado) });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// POST registrar un pago parcial
router.post('/api/pedido/:pedidoId/pago', (req, res) => {
  try {
    const pedSvc = require('../services/pedidos.service');
    const { monto, fecha, metodo, nota } = req.body;
    const result = pedSvc.registrarPagoPedido({
      pedidoId: req.params.pedidoId,
      monto, fecha, metodo, nota
    });
    res.json({ ok: true, ...result });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// DELETE eliminar un pago puntual
router.delete('/api/pago/:pagoId', (req, res) => {
  try {
    const pedSvc = require('../services/pedidos.service');
    const result = pedSvc.eliminarPagoPedido(req.params.pagoId);
    res.json(result);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Recepcionar pedido desde proveedores ─────────────────────
router.post('/api/pedido/:pedidoId/recepcionar', (req, res) => {
  try {
    const pedSvc = require('../services/pedidos.service');
    const sucursal_id = req.session?.user?.sucursal_id || 1;
    const result = pedSvc.recepcionarPedido({
      pedidoId:    req.params.pedidoId,
      recepciones: req.body.recepciones,
      sucursal_id,
    });
    res.json(result);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Reparar saldos incorrectos (recalcula desde movimientos) ──
router.post('/api/reparar-saldos', (req, res) => {
  try {
    const { all: dbAll, run: dbRun } = require('../db');
    const proveedores = svc.list();
    let reparados = 0;
    for (const p of proveedores) {
      const movs = dbAll(
        `SELECT tipo, monto FROM proveedores_movimientos WHERE proveedor_id = ?`,
        [p.id]
      );
      const facturado = movs.filter(m => m.tipo === 'factura').reduce((s, m) => s + Number(m.monto), 0);
      const pagado    = movs.filter(m => m.tipo === 'pago').   reduce((s, m) => s + Number(m.monto), 0);
      const saldoReal = Math.max(0, facturado - pagado);
      if (Math.abs(saldoReal - Number(p.saldo)) > 0.01) {
        dbRun(`UPDATE proveedores SET saldo=? WHERE id=?`, [saldoReal, p.id]);
        reparados++;
      }
    }
    res.json({ ok: true, reparados });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;