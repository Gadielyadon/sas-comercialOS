const express = require('express');
const router  = express.Router();
const salesService = require('../services/sales.service');

// POST /api/sales → crear una venta
router.post('/', (req, res) => {
  try {
    const {
      total,
      payment_method,
      cash_received,
      change_amount,
      discount_pct,
      discount_fixed,
      recargo_pct,
      cliente_id,
      sucursal_id,
      es_cuenta_corriente,   // ← AGREGADO
      items,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    if (!payment_method) {
      return res.status(400).json({ error: 'payment_method es obligatorio' });
    }

    const result = salesService.createSale({
      total,
      payment_method,
      cash_received,
      change_amount,
      discount_pct,
      discount_fixed,
      recargo_pct,
      cliente_id,
      sucursal_id,
      es_cuenta_corriente,   // ← AGREGADO
      items,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Error al crear venta' });
  }
});

module.exports = router;