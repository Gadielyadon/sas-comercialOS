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

    // Usar sucursal del middleware como fuente de verdad
    // Si el frontend manda sucursal_id la usamos, sino la del usuario logueado
    const sucursalFinal = sucursal_id
      ? Number(sucursal_id)
      : (res.locals.sucursal_id || 1);

    const result = salesService.createSale({
      total,
      payment_method,
      cash_received,
      change_amount,
      discount_pct,
      discount_fixed,
      recargo_pct,
      cliente_id,
      sucursal_id: sucursalFinal,
      es_cuenta_corriente,
      items,
    });

    // Auditoría: si algún ítem se vendió con precio editado a mano, lo registramos
    try {
      const auditoriaSvc = require('../services/auditoria.service');
      const usuario = req.session?.vendedorActivo?.nombre || req.session?.user?.nombre || req.session?.user?.username || null;
      for (const it of items) {
        if (it.precio_editado) {
          auditoriaSvc.registrar({
            tipo: 'precio_manual',
            usuario,
            sucursal_id: sucursalFinal,
            detalle: `${it.sku} · ${it.name || ''} — de $${Number(it.price_original ?? 0).toLocaleString('es-AR')} a $${Number(it.price).toLocaleString('es-AR')} (venta #${result.id})`,
            entidad: it.sku,
          });
        }
      }
      // Auditoría: descuento aplicado en el cobro
      const dPct = Number(discount_pct) || 0;
      const dFix = Number(discount_fixed) || 0;
      if (dPct > 0 || dFix > 0) {
        auditoriaSvc.registrar({
          tipo: 'descuento',
          usuario,
          sucursal_id: sucursalFinal,
          detalle: `Venta #${result.id} · ${dPct > 0 ? `${dPct}%` : ''}${dPct > 0 && dFix > 0 ? ' + ' : ''}${dFix > 0 ? `$${dFix.toLocaleString('es-AR')}` : ''} de descuento (total $${Number(result.total ?? total).toLocaleString('es-AR')})`,
          entidad: `venta_${result.id}`,
        });
      }
    } catch (_) {}

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Error al crear venta' });
  }
});

module.exports = router;