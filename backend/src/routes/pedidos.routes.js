// src/routes/pedidos.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/pedidos.service');

svc.initPedidosSchema();

// GET /pedidos
router.get('/', (req, res) => {
  const user = req.session?.user || { name: 'Admin', role: 'admin' };
  const items   = svc.list();
  const pedidos  = items.filter(p => p.tipo === 'pedido');
  const faltantes= items.filter(p => p.tipo === 'faltante');
  const urgentes = svc.countUrgentes();
  const recordatorios = svc.countRecordatoriosHoy();
  res.render('pages/pedidos', {
    title: 'Pedidos y Faltantes', user,
    active: 'pedidos', module: 'Pedidos y Faltantes',
    empresaNombre: (() => { try { return require('../services/config.service').getConfigValue('empresa_nombre','Mi Comercio'); } catch(e){ return 'Mi Comercio'; } })(),
    pedidos, faltantes, urgentes, recordatorios,
  });
});

// API REST
router.get('/api',         (req, res) => { try { res.json(svc.list(req.query)); } catch(e){ res.status(500).json({error:e.message}); }});
router.get('/api/:id',     (req, res) => { const p=svc.findById(req.params.id); p?res.json(p):res.status(404).json({error:'No encontrado'}); });
router.post('/api',        (req, res) => { try { res.status(201).json(svc.create(req.body)); } catch(e){ res.status(500).json({error:e.message}); }});
router.put('/api/:id',     (req, res) => { try { const p=svc.update(req.params.id,req.body); p?res.json(p):res.status(404).json({error:'No encontrado'}); } catch(e){ res.status(500).json({error:e.message}); }});
router.delete('/api/:id',  (req, res) => { svc.remove(req.params.id)?res.json({ok:true}):res.status(404).json({error:'No encontrado'}); });

// Badge count para sidebar
router.get('/api/badge',   (req, res) => { res.json({ urgentes: svc.countUrgentes(), recordatorios: svc.countRecordatoriosHoy() }); });

module.exports = router;
