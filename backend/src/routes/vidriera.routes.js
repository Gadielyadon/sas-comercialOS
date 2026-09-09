// src/routes/vidriera.routes.js
// Catálogo público (vidriera digital) — sin login, pensado para compartir
// como link a los clientes finales del negocio. Pedido armado en el
// navegador del cliente y enviado como UN mensaje de WhatsApp.
const express = require('express');
const router = express.Router();
const vidrieraService = require('../services/vidriera.service');
const configService = require('../services/config.service');
const catalogoProductosService = require('../services/catalogo_productos.service');
const catalogoBannersService = require('../services/catalogo_banners.service');
const catalogoPedidosService = require('../services/catalogo_pedidos.service');
const catalogoMetricasService = require('../services/catalogo_metricas.service');
const catalogoCarritosService = require('../services/catalogo_carritos.service');
const crypto = require('crypto');

catalogoProductosService.initSchema();
catalogoBannersService.initSchema();
catalogoPedidosService.initSchema();
catalogoMetricasService.initSchema();
catalogoCarritosService.initSchema();

// ── Cookie de visitante anónimo para el carrito server-side ──────
// No usamos cookie-parser (no está entre las dependencias del proyecto):
// alcanza con parsear el header a mano, es una sola cookie.
const VISITOR_COOKIE = 'vid_visitor';
function leerCookie(req, nombre) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(nombre + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}
function getOrSetVisitorId(req, res) {
  let id = leerCookie(req, VISITOR_COOKIE);
  if (!id) {
    id = crypto.randomUUID();
    res.setHeader('Set-Cookie', `${VISITOR_COOKIE}=${id}; Max-Age=${60 * 60 * 24 * 180}; Path=/; HttpOnly; SameSite=Lax`);
  }
  return id;
}

// Aumentar límite para fotos de producto/portada en base64
router.use(express.json({ limit: '4mb' }));

// ── Vidriera pública ────────────────────────────────────────────
router.get('/vidriera', (req, res) => {
  const settings = vidrieraService.getSettings();
  if (!settings.activa) {
    return res.status(404).render('pages/vidriera_inactiva', {
      empresaNombre: configService.getValue('empresa_nombre') || '',
    });
  }
  try { catalogoMetricasService.registrar('visita'); } catch (e) {}
  getOrSetVisitorId(req, res);
  const { categorias, promos } = vidrieraService.getCatalogo();
  const banners = catalogoBannersService.list();
  res.render('pages/vidriera', {
    settings,
    catalogo: categorias,
    promos,
    banners,
    empresaNombre: configService.getValue('empresa_nombre') || '',
    empresaLogo: configService.getValue('empresa_logo') || '',
  });
});

// ── Carrito server-side (respaldo de localStorage, público) ──────
router.get('/vidriera/api/carrito', (req, res) => {
  const visitorId = getOrSetVisitorId(req, res);
  res.json({ items: catalogoCarritosService.obtener(visitorId) });
});

router.post('/vidriera/api/carrito', (req, res) => {
  const visitorId = getOrSetVisitorId(req, res);
  try {
    catalogoCarritosService.guardar(visitorId, req.body?.items || {});
    res.status(204).end();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Evento: agregar al carrito (público, sin login) ─────────────
router.post('/vidriera/api/evento', (req, res) => {
  try {
    catalogoMetricasService.registrar(req.body?.tipo === 'agregar_carrito' ? 'agregar_carrito' : null);
  } catch (e) {}
  res.status(204).end();
});

// ── Guardar el pedido ANTES de abrir WhatsApp (público, sin login) ──
router.post('/vidriera/api/pedido', (req, res) => {
  try {
    const { items, total } = req.body || {};
    const pedido = catalogoPedidosService.crear({ items, total });
    res.status(201).json({ ok: true, id: pedido.id });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Sección "Catálogo" dentro del sistema (requiere login) ─────────
router.get('/catalogo', (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/login');
  const settings = vidrieraService.getSettings();
  res.render('pages/catalogo', {
    activada: true,
    settings,
    user: req.session.user,
  });
});

router.post('/catalogo/api/guardar', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ ok: false });
  try {
    const settings = vidrieraService.saveSettings(req.body || {});
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Productos del catálogo (ABM independiente del Inventario) ─────
function requireCatalogoAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'No autorizado' });
  next();
}

router.get('/catalogo/api/productos', requireCatalogoAuth, (req, res) => {
  res.json(catalogoProductosService.list());
});

router.get('/catalogo/api/categorias', requireCatalogoAuth, (req, res) => {
  res.json(catalogoProductosService.listCategorias());
});

router.post('/catalogo/api/productos', requireCatalogoAuth, (req, res) => {
  try {
    const { nombre, categoria, precio, en_promo, precio_promo, imagen, activo, descripcion, imagenes, agotado, variantes } = req.body || {};
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const creado = catalogoProductosService.create({ nombre, categoria, precio, en_promo, precio_promo, imagen, activo, descripcion, imagenes, agotado, variantes });
    res.status(201).json(creado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/catalogo/api/productos/:id', requireCatalogoAuth, (req, res) => {
  try {
    const actualizado = catalogoProductosService.update(Number(req.params.id), req.body || {});
    if (!actualizado) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(actualizado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/catalogo/api/productos/:id', requireCatalogoAuth, (req, res) => {
  try {
    catalogoProductosService.remove(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Banners promocionales (imágenes sueltas, sin producto asociado) ──
router.get('/catalogo/api/banners', requireCatalogoAuth, (req, res) => {
  res.json(catalogoBannersService.list());
});

router.post('/catalogo/api/banners', requireCatalogoAuth, (req, res) => {
  try {
    const { imagen } = req.body || {};
    if (!imagen) return res.status(400).json({ error: 'Falta la imagen' });
    const creado = catalogoBannersService.create(imagen);
    res.status(201).json(creado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/catalogo/api/banners/:id', requireCatalogoAuth, (req, res) => {
  try {
    catalogoBannersService.remove(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Panel oculto por URL con clave (backup, sin necesidad de login) ──
// Pensado para vos: activar/configurar el catálogo de un cliente por link
// directo, sin tener que loguearte como admin de ese negocio.
function getClaveConfigurada() {
  return process.env.VIDRIERA_ADMIN_KEY || null;
}

function claveValida(req) {
  const clave = getClaveConfigurada();
  if (!clave) return false;
  return req.query.clave === clave || req.body?.clave === clave;
}

router.get('/admin/vidriera', (req, res) => {
  if (!claveValida(req)) return res.status(404).send('No encontrado');
  const settings = vidrieraService.getSettings();
  res.render('pages/vidriera_admin', {
    settings,
    clave: req.query.clave,
    empresaNombre: configService.getValue('empresa_nombre') || '',
  });
});

router.post('/admin/vidriera/api/guardar', (req, res) => {
  if (!claveValida(req)) return res.status(404).json({ error: 'No encontrado' });
  try {
    const { clave, ...fields } = req.body || {};
    const settings = vidrieraService.saveSettings(fields);
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Pedidos recibidos por la vidriera (admin, requiere login) ────
router.get('/catalogo/api/pedidos', requireCatalogoAuth, (req, res) => {
  const estado = req.query.estado || undefined;
  res.json(catalogoPedidosService.listar({ estado }));
});

router.get('/catalogo/api/pedidos/nuevos-count', requireCatalogoAuth, (req, res) => {
  res.json({ n: catalogoPedidosService.contarNuevos() });
});

router.put('/catalogo/api/pedidos/:id/estado', requireCatalogoAuth, (req, res) => {
  try {
    const actualizado = catalogoPedidosService.cambiarEstado(Number(req.params.id), req.body?.estado);
    res.json(actualizado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Métricas para el panel admin ─────────────────────────────────
router.get('/catalogo/api/metricas', requireCatalogoAuth, (req, res) => {
  res.json(catalogoMetricasService.resumen());
});

module.exports = router;
