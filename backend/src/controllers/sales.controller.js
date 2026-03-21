// src/controllers/sales.controller.js
const salesService = require('../services/sales.service');

exports.create = async (req, res) => {
  try {
    const {
      payment_method, cash_received, change_amount,
      discount_pct, discount_fixed, recargo_pct,
      cliente_id, items, es_cuenta_corriente
    } = req.body;

    if (!payment_method)
      return res.status(400).json({ error: 'payment_method es requerido' });
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'items es requerido y debe tener al menos 1 producto' });

    // Sucursal del usuario autenticado
    const sucursal_id = req.session?.user?.sucursal_id || res.locals?.sucursal_id || 1;

    // Calcular total con descuentos y recargo
    let subtotal = items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
    let descuento = 0;
    if (discount_pct   > 0) descuento = subtotal * (Math.min(Number(discount_pct), 100) / 100);
    if (discount_fixed > 0) descuento = Math.min(Number(discount_fixed), subtotal);
    const base  = Math.max(0, subtotal - descuento);
    const total = base * (1 + (Number(recargo_pct) || 0) / 100);

    const result = salesService.createSale({
      total:                parseFloat(total.toFixed(2)),
      payment_method:       String(payment_method),
      cash_received:        cash_received  != null ? Number(cash_received)  : null,
      change_amount:        change_amount  != null ? Number(change_amount)  : null,
      discount_pct:         Number(discount_pct)   || 0,
      discount_fixed:       Number(discount_fixed) || 0,
      recargo_pct:          Number(recargo_pct)    || 0,
      cliente_id:           cliente_id ? Number(cliente_id) : 1,
      es_cuenta_corriente:  es_cuenta_corriente ? 1 : 0,
      sucursal_id,
      items
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Error creando venta:', err.message);
    res.status(400).json({ error: err.message || 'Error al registrar venta' });
  }
};

exports.recent = (req, res) => {
  try {
    const limit       = parseInt(req.query.limit) || 5;
    const sucursal_id = req.session?.user?.role === 'admin'
      ? null
      : (req.session?.user?.sucursal_id || null);
    res.json(salesService.listRecent(limit, sucursal_id));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error cargando ventas recientes' });
  }
};
