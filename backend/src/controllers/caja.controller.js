// src/controllers/caja.controller.js
const cajaService = require('../services/caja.service');
const salesService = require('../services/sales.service');

exports.view = (req, res) => {
  try {
    const cajaActualResp = cajaService.getCurrentCaja();
    const cajaActual = cajaActualResp.ok ? cajaActualResp.caja : null;
    const ventasHoy = salesService.listToday();

    // Calcular totales por método de pago
    const totalVentasHoy = ventasHoy.reduce((sum, s) => sum + Number(s.total), 0);
    const totalEfectivo = ventasHoy
      .filter(s => s.payment_method === 'efectivo')
      .reduce((sum, s) => sum + Number(s.total), 0);
    const totalTarjeta = totalVentasHoy - totalEfectivo;

    res.render('pages/caja', {
      title: 'Caja',
      user: { name: 'Admin' },
      active: 'caja',
      module: 'Caja',
      cajaActual,
      ventasHoy,
      totalVentasHoy,
      totalEfectivo,
      totalTarjeta
    });
  } catch (err) {
    res.status(500).send('Error cargando caja: ' + err.message);
  }
};

exports.open = (req, res) => {
  const result = cajaService.open(req.body.user || 'Admin');
  res.json(result);
};

exports.close = (req, res) => {
  const result = cajaService.close(req.body.user || 'Admin');
  res.json(result);
};

exports.current = (req, res) => {
  const result = cajaService.getCurrentCaja();
  res.json(result);
};
