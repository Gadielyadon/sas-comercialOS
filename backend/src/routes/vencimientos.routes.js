// src/routes/vencimientos.routes.js
// Pantalla "Vencimientos": qué mercadería vence y cuándo (lotes), y alta/baja de lotes.
const express = require('express');
const router  = express.Router();
const lotes   = require('../services/lotes.service');
const { requireAuth, requirePermiso } = require('../middlewares/auth.middleware');

router.use(requireAuth, requirePermiso('stock'));

const sucursalDe = res => Number(res.locals.sucursal_id) || 1;
const usuarioDe  = req => req.session?.user?.name || 'sistema';

// ── Pantalla ────────────────────────────────────────────────
router.get('/', (req, res) => {
  const user = req.session?.user || { name: 'Admin' };
  res.render('pages/vencimientos', { title: 'Vencimientos', user, active: 'vencimientos', module: 'Vencimientos' });
});

// ── API ─────────────────────────────────────────────────────
// GET /vencimientos/api/lotes?dias=30   (dias=todos → sin límite)
router.get('/api/lotes', (req, res) => {
  try {
    const dias = req.query.dias === 'todos' ? null : (req.query.dias !== undefined ? Number(req.query.dias) : 30);
    res.json(lotes.listar({ sucursal_id: sucursalDe(res), dias }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /vencimientos/api/lotes   { sku, cantidad, vence, sumar_stock, costo?, nota? }
router.post('/api/lotes', (req, res) => {
  try {
    const { sku, cantidad, vence, sumar_stock, costo, nota } = req.body || {};
    const lote = lotes.registrar({
      sku, cantidad, vence, costo, nota,
      sucursal_id: sucursalDe(res), usuario: usuarioDe(req),
      sumarStock: sumar_stock === true || sumar_stock === 'true' || sumar_stock === 1 || sumar_stock === '1',
      origen: 'manual',
    });
    res.status(201).json(lote);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PUT /vencimientos/api/lotes/:id   { vence?, cantidad? }
router.put('/api/lotes/:id', (req, res) => {
  try { res.json(lotes.actualizar(req.params.id, req.body || {})); }
  catch (e) { res.status(e.message === 'Lote no encontrado' ? 404 : 400).json({ error: e.message }); }
});

// POST /vencimientos/api/lotes/:id/baja   { motivo? }
router.post('/api/lotes/:id/baja', (req, res) => {
  try {
    const motivo = (req.body && String(req.body.motivo || '').trim()) || 'Vencido';
    res.json(lotes.baja(req.params.id, { usuario: usuarioDe(req), motivo }));
  } catch (e) { res.status(e.message === 'Lote no encontrado' ? 404 : 400).json({ error: e.message }); }
});

module.exports = router;
