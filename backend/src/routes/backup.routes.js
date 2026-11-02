// src/routes/backup.routes.js
const express = require('express');
const router  = express.Router();
const backupSvc = require('../services/backup.service');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');
const auto = require('../services/backup_auto.service');

// POST /api/backups/pre-cambio — copia "previa" antes de una operación masiva (precios, IVA, importar).
// La pueden disparar los usuarios que hacen esas operaciones (no solo admin); no devuelve datos.
router.post('/pre-cambio', requireAuth, (req, res) => {
  try {
    const r = auto.antesDeCambioGrande((req.body || {}).motivo);
    res.json({ ok: true, omitida: !!r.omitida });
  } catch (e) {
    // Si la copia previa falla no se bloquea la operación: se avisa y se sigue
    console.error('[backup] copia previa:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// Todo lo demás de este módulo es solo para admin — es la base de datos entera del negocio.
router.use(requireAdmin);

// GET /api/backups/estado — estado de las copias automáticas y de Google Drive
router.get('/estado', (req, res) => {
  try { res.json(auto.estado()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/backups/auto/ejecutar — correr YA el proceso completo (copia + verificación + subida a Drive)
router.post('/auto/ejecutar', async (req, res) => {
  try {
    const r = await auto.ejecutarAutomatico({ origen: 'manual' });
    res.status(r.ocupado ? 409 : 200).json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Conexión con Google Drive (se muestra un código y se aprueba desde el celular o la PC)
router.post('/drive/conectar', async (req, res) => {
  try { res.json(await auto.conectarIniciar()); }
  catch (e) { res.status(e.red ? 502 : 400).json({ error: e.message }); }
});
router.get('/drive/sondear', async (req, res) => {
  try { res.json(await auto.conectarSondear()); }
  catch (e) { res.status(e.red ? 502 : 400).json({ error: e.message }); }
});
router.post('/drive/desconectar', (req, res) => {
  try { auto.desconectar(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/backups — listar copias disponibles
router.get('/', (req, res) => {
  try {
    res.json(backupSvc.listBackups());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backups — generar una copia manual ahora mismo
router.post('/', (req, res) => {
  try {
    const info = backupSvc.crearBackup('manual');
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/backups/:filename/download — descargar una copia puntual
router.get('/:filename/download', (req, res) => {
  try {
    const fullPath = backupSvc.getBackupPath(req.params.filename);
    if (!fullPath) return res.status(404).json({ error: 'Backup no encontrado' });
    res.download(fullPath, req.params.filename);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/backups/:filename — borrar una copia puntual
router.delete('/:filename', (req, res) => {
  try {
    const ok = backupSvc.eliminarBackup(req.params.filename);
    if (!ok) return res.status(404).json({ error: 'Backup no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
