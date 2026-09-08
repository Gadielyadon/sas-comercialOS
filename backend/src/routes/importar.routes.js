// src/routes/importar.routes.js
const express = require('express');
const router  = express.Router();
const { requireAuth, requirePermiso } = require('../middlewares/auth.middleware');

router.use(requireAuth, requirePermiso('importar'));

// ── Vista principal ────────────────────────────────────────
router.get('/', (req, res) => {
  res.render('pages/importar', {
    title: 'Importar', module: 'Importar', active: 'importar',
    user: { name: req.session.user.nombre || req.session.user.username, role: req.session.user.role },
  });
});

// ── Descargar plantilla personalizada con los valores reales de este negocio ──
router.get('/plantilla', (req, res) => {
  const svc = require('../services/importar.service');
  const sucursal_id = res.locals.sucursal_id || 1;
  const buffer = svc.generarPlantilla(sucursal_id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-importacion.xlsx"');
  res.send(buffer);
});

// ── Paso 1: analizar archivo (hojas, encabezados, sugerencia de mapeo) ──
router.post('/api/analizar', (req, res) => {
  try {
    const { base64 } = req.body || {};
    if (!base64) return res.status(400).json({ error: 'Falta el archivo' });

    const svc = require('../services/importar.service');
    const resultado = svc.analizarArchivo(base64);
    res.json({ ok: true, ...resultado });
  } catch (e) {
    res.status(400).json({ error: 'No se pudo leer el archivo: ' + e.message });
  }
});

// ── Paso 2: previsualizar con el mapeo elegido (no escribe nada) ──
router.post('/api/preview', (req, res) => {
  try {
    const { base64, hoja, tipo, mapeo } = req.body || {};
    if (!base64 || !hoja || !tipo || !mapeo) return res.status(400).json({ error: 'Faltan datos del mapeo' });

    const svc = require('../services/importar.service');
    const sucursal_id = res.locals.sucursal_id || 1;
    const resultado = svc.previsualizar({ base64, hoja, tipo, mapeo }, sucursal_id);
    res.json({ ok: true, ...resultado });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Paso 3: confirmar (inserta de verdad) ──────────────────
router.post('/api/confirmar', (req, res) => {
  try {
    const { base64, hoja, tipo, mapeo } = req.body || {};
    if (!base64 || !hoja || !tipo || !mapeo) return res.status(400).json({ error: 'Faltan datos del mapeo' });

    const svc = require('../services/importar.service');
    const sucursal_id = res.locals.sucursal_id || 1;
    const usuario = req.session?.user?.nombre || req.session?.user?.username || null;
    const resultado = svc.confirmar({ base64, hoja, tipo, mapeo }, { sucursal_id, usuario });
    res.json({ ok: true, ...resultado });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
