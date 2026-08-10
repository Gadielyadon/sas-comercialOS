const express = require('express');
const router  = express.Router();
const svc     = require('../services/remitos.service');
const configSvc = require('../services/config.service');
const productsSvc = require('../services/products.service');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);

// ── GET /remitos — listado ───────────────────────────────────
router.get('/', (req, res) => {
  const user = req.session.user;
  const sucId = user.role === 'admin' ? null : (user.sucursal_id || 1);
  const lista = svc.list(sucId, 200);
  const config = configSvc.getAll();

  const stats = {
    total: lista.length,
    emitidos: lista.filter(r => r.estado === 'Emitido').length,
    entregados: lista.filter(r => r.estado === 'Entregado').length,
    anulados: lista.filter(r => r.estado === 'Anulado').length,
  };

  res.render('pages/remitos', {
    title: 'Remitos',
    active: 'remitos',
    module: 'Remitos',
    user,
    lista,
    stats,
    config,
    sucursal: res.locals.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── GET /remitos/nuevo — formulario en blanco ────────────────
router.get('/nuevo', (req, res) => {
  const user = req.session.user;
  const sucId = user.role === 'admin' ? null : (user.sucursal_id || 1);
  let productos = [];
  try { productos = productsSvc.list(sucId); } catch (e) {}

  res.render('pages/remito_form', {
    title: 'Nuevo Remito',
    active: 'remitos',
    module: 'Remitos',
    user,
    remito: null,
    datosIniciales: null,
    productos,
    sucursal: res.locals.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── GET /remitos/desde-presupuesto/:id — formulario prellenado ──
router.get('/desde-presupuesto/:id', (req, res) => {
  const user = req.session.user;
  const datosIniciales = svc.desdePresupuesto(req.params.id);
  if (!datosIniciales) return res.redirect('/presupuestos');

  const sucId = user.role === 'admin' ? null : (user.sucursal_id || 1);
  let productos = [];
  try { productos = productsSvc.list(sucId); } catch (e) {}

  res.render('pages/remito_form', {
    title: 'Nuevo Remito',
    active: 'remitos',
    module: 'Remitos',
    user,
    remito: null,
    datosIniciales,
    productos,
    sucursal: res.locals.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── GET /remitos/ver/:id — vista de impresión ────────────────
router.get('/ver/:id', (req, res) => {
  const remito = svc.getById(req.params.id);
  if (!remito) return res.redirect('/remitos');
  const config = configSvc.getAll();

  res.render('pages/remito_imprimir', {
    title: remito.numero,
    remito,
    config,
  });
});

// ── POST /remitos/crear ──────────────────────────────────────
router.post('/crear', (req, res) => {
  try {
    const user = req.session.user;
    const items = parsearItems(req.body);
    if (!items.length) return res.redirect(req.get('referer') || '/remitos/nuevo');

    const r = svc.crear({
      presupuesto_id: req.body.presupuesto_id || null,
      cliente_nombre: req.body.cliente_nombre,
      cliente_cuit: req.body.cliente_cuit,
      cliente_direccion: req.body.cliente_direccion,
      cliente_email: req.body.cliente_email,
      cliente_tel: req.body.cliente_tel,
      notas: req.body.notas,
      sucursal_id: user.sucursal_id || 1,
      user_id: user.id,
      items,
    });

    res.redirect(`/remitos/ver/${r.id}`);
  } catch (e) {
    console.error('crear remito:', e);
    res.redirect('/remitos/nuevo');
  }
});

// ── POST /remitos/estado/:id ─────────────────────────────────
router.post('/estado/:id', (req, res) => {
  try {
    svc.actualizarEstado(req.params.id, req.body.estado);
  } catch (e) {
    console.error(e.message);
  }
  res.redirect(req.headers.referer || '/remitos');
});

// ── POST /remitos/eliminar/:id ───────────────────────────────
router.post('/eliminar/:id', (req, res) => {
  try { svc.eliminar(req.params.id); } catch (e) {}
  res.redirect('/remitos');
});

// ─────────────────────────────────────────────────────────────
// Helper: parsear ítems del formulario (sin precios)
// ─────────────────────────────────────────────────────────────
function parsearItems(body) {
  try {
    const raw = body.items_json;
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed
        .map(it => ({
          sku: it.sku || null,
          nombre: it.nombre || '',
          descripcion: it.descripcion || '',
          cantidad: Number(it.cantidad || 1),
          unidad: it.unidad || 'unidad',
        }))
        .filter(it => it.nombre.trim());
    }
  } catch (e) {}
  return [];
}

module.exports = router;