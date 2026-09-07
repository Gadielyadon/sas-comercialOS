// src/routes/backup.routes.js
const express = require('express');
const router  = express.Router();
const backupSvc = require('../services/backup.service');
const { requireAdmin } = require('../middlewares/auth.middleware');

// Todo este módulo es solo para admin — es la base de datos entera del negocio.
router.use(requireAdmin);

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
