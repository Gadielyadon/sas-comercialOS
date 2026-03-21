// src/routes/clientes.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/clientes.service');

// GET /api/clientes/buscar?q=...  (DEBE ir antes de /:id)
router.get('/buscar', (req, res) => {
  try {
    const q = req.query.q || '';
    const lista = q ? svc.search(q) : [];
    res.json(lista);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clientes?q=...
router.get('/', (req, res) => {
  try {
    const q = req.query.q || '';
    const lista = q ? svc.search(q) : svc.list();
    res.json(lista);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clientes/:id/movimientos  (DEBE ir antes de /:id)
router.get('/:id/movimientos', (req, res) => {
  try {
    const movs = svc.getMovimientos(Number(req.params.id));
    res.json(movs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clientes/:id
router.get('/:id', (req, res) => {
  try {
    const c = svc.findById(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'No encontrado' });
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clientes
router.post('/', (req, res) => {
  try {
    const { nombre, documento } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const nuevo = svc.create({ nombre, documento });
    res.status(201).json(nuevo);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/clientes/:id
router.put('/:id', (req, res) => {
  try {
    const { nombre, documento } = req.body;
    svc.update(Number(req.params.id), { nombre, documento });
    res.json(svc.findById(Number(req.params.id)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/clientes/:id
router.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === 1) return res.status(400).json({ error: 'No se puede eliminar Consumidor Final' });
    svc.remove(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clientes/:id/cargo
router.post('/:id/cargo', (req, res) => {
  try {
    const { monto, descripcion, sale_id } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });
    svc.registrarCargo(Number(req.params.id), monto, descripcion || 'Cargo manual', sale_id || null);
    res.json(svc.findById(Number(req.params.id)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clientes/:id/pago
router.post('/:id/pago', (req, res) => {
  try {
    const { monto, descripcion } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });
    svc.registrarPago(Number(req.params.id), monto, descripcion || 'Pago manual');
    res.json(svc.findById(Number(req.params.id)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
