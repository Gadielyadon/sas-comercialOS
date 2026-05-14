// src/routes/pedidos.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/pedidos.service');

svc.initPedidosSchema();

// ── Vista principal ───────────────────────────────────────────
router.get('/', (req, res) => {
  const user       = req.session?.user || { name: 'Admin', role: 'admin' };
  const pedidos    = svc.list({ tipo: 'pedido' });
  const urgentes   = svc.countUrgentes();
  const recordatorios = svc.countRecordatoriosHoy();
  // Cargar proveedores para el selector
  let proveedores = [];
  try { proveedores = require('../services/proveedores.service').list(); } catch(e) {}

  // Para cada pedido, cargar sus ítems
  const pedidosConItems = pedidos.map(p => ({
    ...p,
    items: svc.getItems(p.id),
  }));

  res.render('pages/pedidos', {
    title: 'Pedidos', user,
    active: 'pedidos', module: 'Pedidos',
    pedidos: pedidosConItems,
    proveedores,
    urgentes, recordatorios,
  });
});

// ── API: buscador de productos (antes de rutas con :id) ───────
router.get('/api/productos/buscar', (req, res) => {
  try {
    const q     = String(req.query.q || '').trim();
    const todos = req.query.todos === '1' || q === '*';
    const suc   = req.session?.user?.sucursal_id || null;
    const { all: dbAll } = require('../db');

    // Nota: la columna es 'category', no 'categoria'
    let rows;
    if (todos || !q) {
      const params = [];
      let where = '';
      if (suc) { where = 'WHERE sucursal_id = ?'; params.push(Number(suc)); }
      rows = dbAll(
        `SELECT sku, name, stock, COALESCE(price_cost,0) as price_cost, price, category
         FROM products ${where}
         ORDER BY name ASC`,
        params
      );
    } else {
      const term   = `%${q}%`;
      const params = [term, term, `${q}%`];
      let where    = 'WHERE (name LIKE ? OR sku LIKE ?)';
      if (suc) { where += ' AND sucursal_id = ?'; params.push(Number(suc)); params.push(`${q}%`); }
      else { params.push(`${q}%`); }
      rows = dbAll(
        `SELECT sku, name, stock, COALESCE(price_cost,0) as price_cost, price, category
         FROM products ${where}
         ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name ASC`,
        params
      );
    }
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: badge (antes de :id) ─────────────────────────────────
router.get('/api/badge', (req, res) => {
  res.json({ urgentes: svc.countUrgentes(), recordatorios: svc.countRecordatoriosHoy() });
});

// ── API REST pedidos ──────────────────────────────────────────
router.get('/api',     (req, res) => { try { res.json(svc.list(req.query)); } catch(e) { res.status(500).json({error:e.message}); }});
router.get('/api/:id', (req, res) => { const p=svc.findById(req.params.id); p?res.json(p):res.status(404).json({error:'No encontrado'}); });

router.post('/api', (req, res) => {
  try { res.status(201).json(svc.create(req.body)); }
  catch(e) { res.status(500).json({error:e.message}); }
});

router.put('/api/:id', (req, res) => {
  try {
    const p = svc.update(req.params.id, req.body);
    p ? res.json(p) : res.status(404).json({error:'No encontrado'});
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.delete('/api/:id', (req, res) => {
  svc.remove(req.params.id) ? res.json({ok:true}) : res.status(404).json({error:'No encontrado'});
});

// ── API: ítems de un pedido ───────────────────────────────────
router.get('/api/:id/items', (req, res) => {
  try { res.json(svc.getItems(req.params.id)); }
  catch(e) { res.status(500).json({error:e.message}); }
});

// ── API: enviar pedido a proveedor ────────────────────────────
router.post('/api/:id/enviar', (req, res) => {
  try {
    const result = svc.enviarAProveedor(req.params.id, req.body.proveedor_id);
    res.json({ ok: true, pedido: result });
  } catch(e) { res.status(400).json({error:e.message}); }
});

// ── API: recepcionar pedido (desde proveedores) ───────────────
router.post('/api/:id/recepcionar', (req, res) => {
  try {
    const sucursal_id = req.session?.user?.sucursal_id || 1;
    const result = svc.recepcionarPedido({
      pedidoId:     req.params.id,
      recepciones:  req.body.recepciones,
      sucursal_id,
    });
    res.json(result);
  } catch(e) { res.status(400).json({error:e.message}); }
});

module.exports = router;