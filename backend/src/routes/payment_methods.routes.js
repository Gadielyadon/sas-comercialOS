// src/routes/payment_methods.routes.js
const express = require('express');
const router  = express.Router();
const pm      = require('../services/payment_methods.service');

// GET /api/payment-methods         → todos los activos (para el POS)
router.get('/', (req, res) => {
  try {
    const todos = req.query.all === '1' ? pm.list() : pm.listActive();
    res.json(todos);
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// GET /api/payment-methods/:id
router.get('/:id', (req, res) => {
  const m = pm.findById(Number(req.params.id));
  if(!m) return res.status(404).json({ error: 'No encontrado' });
  res.json(m);
});

// POST /api/payment-methods        → crear nuevo método
router.post('/', (req, res) => {
  try {
    const { nombre, icono, color, tipo, activo, orden } = req.body;
    if(!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    const nuevo = pm.create({ nombre, icono, color, tipo, activo, orden });
    res.status(201).json(nuevo);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/payment-methods/:id     → actualizar
router.put('/:id', (req, res) => {
  try {
    const updated = pm.update(Number(req.params.id), req.body);
    if(!updated) return res.status(404).json({ error: 'No encontrado' });
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/payment-methods/:id/toggle  → activar/desactivar
router.patch('/:id/toggle', (req, res) => {
  try {
    const cur = pm.findById(Number(req.params.id));
    if(!cur) return res.status(404).json({ error: 'No encontrado' });
    const updated = pm.update(cur.id, { activo: !cur.activo });
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/payment-methods/:id  → eliminar
router.delete('/:id', (req, res) => {
  try {
    pm.remove(Number(req.params.id));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/payment-methods/reorder  → guardar nuevo orden
router.post('/reorder', (req, res) => {
  try {
    const { ids } = req.body; // array de IDs en orden
    if(!Array.isArray(ids)) return res.status(400).json({ error: 'ids debe ser un array' });
    pm.reorder(ids);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
