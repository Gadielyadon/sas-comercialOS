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

catalogoProductosService.initSchema();
catalogoBannersService.initSchema();

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

// ── Sección "Catálogo" dentro del sistema (requiere login) ─────────
// Gateada por una licencia: hasta que se active con la clave, muestra
// un mensaje de "no disponible, contactate con tu operador".
function licenciaActiva() {
  return configService.getValue('vidriera_licencia_activada') === '1';
}

router.get('/catalogo', (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/login');
  const activada = licenciaActiva();
  const settings = vidrieraService.getSettings();
  res.render('pages/catalogo', {
    activada,
    settings,
    user: req.session.user,
  });
});

router.post('/catalogo/activar', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ ok: false });
  const clave = (req.body && req.body.clave) || '';
  const claveCorrecta = process.env.VIDRIERA_ADMIN_KEY || 'axsoft2026';
  if (clave !== claveCorrecta) return res.json({ ok: false });
  configService.setValue('vidriera_licencia_activada', '1');
  res.json({ ok: true });
});

router.post('/catalogo/api/guardar', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ ok: false });
  if (!licenciaActiva()) return res.status(403).json({ ok: false, error: 'Catálogo no activado' });
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
  if (!licenciaActiva()) return res.status(403).json({ error: 'Catálogo no activado' });
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
    const { nombre, categoria, precio, en_promo, precio_promo, imagen, activo, descripcion, imagenes } = req.body || {};
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const creado = catalogoProductosService.create({ nombre, categoria, precio, en_promo, precio_promo, imagen, activo, descripcion, imagenes });
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
function claveValida(req) {
  const clave = process.env.VIDRIERA_ADMIN_KEY || 'axsoft2026';
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

module.exports = router;
