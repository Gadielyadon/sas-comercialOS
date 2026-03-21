// src/routes/gastos.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/gastos.service');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');

router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  const { desde, hasta, categoria } = req.query;
  const gastos   = svc.list({ desde, hasta, categoria });
  const resumen  = svc.getResumen({ desde, hasta });
  const categorias = svc.getCategorias();
  res.render('pages/gastos', {
    title: 'Gastos', module: 'Gastos', active: 'gastos',
    user: { name: req.session.user.nombre||req.session.user.username, role: req.session.user.role },
    gastos, resumen, categorias,
    filtros: { desde: desde||'', hasta: hasta||'', categoria: categoria||'' }
  });
});

router.post('/api', (req,res) => {
  try { res.status(201).json(svc.create(req.body)); }
  catch(e) { res.status(400).json({error:e.message}); }
});
router.put('/api/:id', (req,res) => {
  const u = svc.update(req.params.id, req.body);
  u ? res.json(u) : res.status(404).json({error:'No encontrado'});
});
router.delete('/api/:id', (req,res) => {
  svc.remove(req.params.id); res.json({ok:true});
});
router.get('/api/resumen', (req,res) => res.json(svc.getResumen(req.query)));

module.exports = router;
