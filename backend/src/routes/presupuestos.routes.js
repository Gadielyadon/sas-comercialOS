// src/routes/presupuestos.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/presupuestos.service');
const configSvc = require('../services/config.service');
const { requireAuth } = require('../middlewares/auth.middleware');

router.use(requireAuth);

// ── GET /presupuestos — listado ──────────────────────────────
router.get('/', (req, res) => {
  const user = req.session.user;
  const sucId = user.role === 'admin' ? null : (user.sucursal_id || 1);
  const lista  = svc.list(sucId, 200);
  const config = configSvc.getAll();

  // Stats rápidas
  const stats = {
    total:    lista.length,
    enviados: lista.filter(p => p.estado === 'Enviado').length,
    aprobados:lista.filter(p => p.estado === 'Aprobado').length,
    borradores:lista.filter(p => p.estado === 'Borrador').length,
    montoTotal: lista.reduce((s, p) => s + Number(p.total || 0), 0),
    montoAprobado: lista.filter(p => p.estado === 'Aprobado')
                        .reduce((s, p) => s + Number(p.total || 0), 0),
  };

  res.render('pages/presupuestos', {
    title: 'Presupuestos',
    active: 'presupuestos',
    module: 'Presupuestos',
    user,
    lista,
    stats,
    config,
    sucursal: res.locals.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── GET /presupuestos/nuevo — formulario ─────────────────────
router.get('/nuevo', (req, res) => {
  const user    = req.session.user;
  const sucId   = user.sucursal_id || 1;
  const config  = configSvc.getAll();
  const productos = svc.getProductosConPrecioB(user.role === 'admin' ? null : sucId);
  const catalogo  = svc.listCatalogo();

  res.render('pages/presupuesto_form', {
    title: 'Nuevo Presupuesto',
    active: 'presupuestos',
    module: 'Presupuestos',
    user,
    presupuesto: null,
    productos,
    catalogo,
    config,
    sucursal: res.locals.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── GET /presupuestos/editar/:id ─────────────────────────────
router.get('/editar/:id', (req, res) => {
  const user = req.session.user;
  const p    = svc.findById(req.params.id);
  if (!p) return res.redirect('/presupuestos');

  const sucId     = user.sucursal_id || 1;
  const productos = svc.getProductosConPrecioB(user.role === 'admin' ? null : sucId);
  const catalogo  = svc.listCatalogo();
  const config    = configSvc.getAll();

  res.render('pages/presupuesto_form', {
    title: `Editar ${p.numero}`,
    active: 'presupuestos',
    module: 'Presupuestos',
    user,
    presupuesto: p,
    productos,
    catalogo,
    config,
    sucursal: res.locals.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── GET /presupuestos/ver/:id — vista previa ─────────────────
router.get('/ver/:id', (req, res) => {
  const p = svc.findById(req.params.id);
  if (!p) return res.redirect('/presupuestos');
  const config = configSvc.getAll();

  res.render('pages/presupuesto_ver', {
    title: p.numero,
    active: 'presupuestos',
    module: 'Presupuestos',
    user: req.session.user,
    presupuesto: p,
    config,
    sucursal: res.locals.sucursal || { id: 1, nombre: 'Casa Central' }
  });
});

// ── POST /presupuestos/crear ─────────────────────────────────
router.post('/crear', (req, res) => {
  try {
    const user  = req.session.user;
    const items = parsearItems(req.body);

    const p = svc.create({
      cliente_nombre:  req.body.cliente_nombre,
      cliente_cuit:    req.body.cliente_cuit,
      cliente_email:   req.body.cliente_email,
      cliente_tel:     req.body.cliente_tel,
      condicion_pago:  req.body.condicion_pago,
      validez_dias:    req.body.validez_dias || null,
      notas:           req.body.notas,
      descuento_pct:   req.body.descuento_pct   || 0,
      descuento_monto: req.body.descuento_monto || 0,
      sucursal_id:     user.sucursal_id || 1,
      user_id:         user.id,
      items
    });

    res.redirect(`/presupuestos/ver/${p.id}`);
  } catch (e) {
    console.error('crear presupuesto:', e.message);
    res.redirect('/presupuestos/nuevo');
  }
});

// ── POST /presupuestos/actualizar/:id ───────────────────────
router.post('/actualizar/:id', (req, res) => {
  try {
    const items = parsearItems(req.body);
    svc.update(req.params.id, {
      cliente_nombre:  req.body.cliente_nombre,
      cliente_cuit:    req.body.cliente_cuit,
      cliente_email:   req.body.cliente_email,
      cliente_tel:     req.body.cliente_tel,
      condicion_pago:  req.body.condicion_pago,
      validez_dias:    req.body.validez_dias || null,
      notas:           req.body.notas,
      descuento_pct:   req.body.descuento_pct   || 0,
      descuento_monto: req.body.descuento_monto || 0,
      items
    });
    res.redirect(`/presupuestos/ver/${req.params.id}`);
  } catch (e) {
    console.error('actualizar presupuesto:', e.message);
    res.redirect(`/presupuestos/editar/${req.params.id}`);
  }
});

// ── POST /presupuestos/estado/:id ───────────────────────────
router.post('/estado/:id', (req, res) => {
  try {
    svc.cambiarEstado(req.params.id, req.body.estado);
  } catch(e) { console.error(e.message); }
  res.redirect(req.headers.referer || '/presupuestos');
});

// ── POST /presupuestos/eliminar/:id ─────────────────────────
router.post('/eliminar/:id', (req, res) => {
  try { svc.remove(req.params.id); } catch(e) {}
  res.redirect('/presupuestos');
});

// ─────────────────────────────────────────────────────────────
// API — Catálogo propio
// ─────────────────────────────────────────────────────────────
router.get('/api/catalogo', (req, res) => {
  res.json(svc.listCatalogo());
});

router.post('/api/catalogo', (req, res) => {
  try {
    const item = svc.createCatalogo(req.body);
    res.json(item);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

router.put('/api/catalogo/:id', (req, res) => {
  try {
    const item = svc.updateCatalogo(req.params.id, req.body);
    res.json(item);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

router.delete('/api/catalogo/:id', (req, res) => {
  try {
    svc.deleteCatalogo(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// API — actualizar precio_presupuesto de producto del sistema
router.put('/api/producto-precio/:sku', requireAuth, (req, res) => {
  try {
    const { run } = require('../db');
    run(`UPDATE products SET precio_presupuesto = ? WHERE sku = ?`,
        [Number(req.body.precio_presupuesto), req.params.sku]);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────
// Helper: parsear ítems del formulario
// ─────────────────────────────────────────────────────────────
function parsearItems(body) {
  // Los items vienen como JSON string en un campo oculto
  try {
    const raw = body.items_json;
    if (raw) return JSON.parse(raw);
  } catch(e) {}

  // Fallback: arrays paralelos
  const nombres   = [].concat(body['item_nombre']   || []);
  const cantidades= [].concat(body['item_cantidad']  || []);
  const precios   = [].concat(body['item_precio']    || []);
  const tipos     = [].concat(body['item_tipo']      || []);
  const skus      = [].concat(body['item_sku']       || []);

  return nombres.map((n, i) => ({
    nombre:          n,
    cantidad:        Number(cantidades[i] || 1),
    precio_unitario: Number(precios[i]   || 0),
    tipo:            tipos[i] || 'custom',
    sku:             skus[i]  || null,
  })).filter(it => it.nombre?.trim());
}

module.exports = router;
