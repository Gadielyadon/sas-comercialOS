const express = require('express');
const router = express.Router();
const configService = require('../services/config.service');

// Aumentar límite para soportar base64 de imágenes (hasta 3MB)
router.use(express.json({ limit: '3mb' }));

// GET /api/config → devuelve todo como objeto
router.get('/', (req, res) => {
  try {
    const config = configService.getAll();
    res.json(config);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/config → guarda múltiples keys
router.put('/', (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body inválido' });
    configService.setMany(body);
    const updated = configService.getAll();
    res.json(updated);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
