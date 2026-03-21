// src/routes/proveedores.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/proveedores.service');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');

router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  res.render('pages/Proveedores', {
    title: 'Proveedores', module: 'Proveedores', active: 'proveedores',
    user: { name: req.session.user.nombre || req.session.user.username, role: req.session.user.role },
    proveedores: svc.list()
  });
});

// API
router.get('/api',          (req, res) => res.json(svc.list()));
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

module.exports = router;
