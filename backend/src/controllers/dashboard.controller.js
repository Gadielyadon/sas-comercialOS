// src/controllers/dashboard.controller.js
const salesService    = require('../services/sales.service');
const cajaService     = require('../services/caja.service');
const productsService = require('../services/products.service');

exports.view = (req, res) => {
  try {
    const userId   = req.session?.user?.id;
    const userName = req.session?.user?.nombre || req.session?.user?.username || 'Admin';
    const role     = req.session?.user?.role || 'admin';

    const { ventasHoy, ventasAyer, stockBajo, totalProd } = salesService.getStatsDashboard();

    // Variación vs ayer
    const pct = ventasAyer.t > 0
      ? (((ventasHoy.t - ventasAyer.t) / ventasAyer.t) * 100).toFixed(1)
      : ventasHoy.t > 0 ? '100' : '0';

    const stats = [
      {
        label: 'Ventas hoy',
        value: `$${ventasHoy.t.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        icon:  'bi-cash-stack',
        color: 'primary',
        trend: `${pct >= 0 ? '+' : ''}${pct}%`
      },
      {
        label: 'Ticket promedio',
        value: ventasHoy.n > 0
          ? `$${(ventasHoy.t / ventasHoy.n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
          : '$0',
        icon:  'bi-receipt',
        color: 'success',
        trend: 'promedio por venta'
      },
      {
        label: 'Transacciones',
        value: ventasHoy.n,
        icon:  'bi-bag-check',
        color: 'info',
        trend: 'ventas del día'
      },
      {
        label: 'Stock bajo',
        value: stockBajo.n,
        icon:  'bi-exclamation-triangle',
        color: stockBajo.n > 0 ? 'alerta' : 'success',
        trend: stockBajo.n > 0 ? 'productos críticos' : 'Todo OK'
      }
    ];

    // Datos para gráficos
    const graficoSemana  = salesService.ventasPorDia(7);
    const graficoMetodos = salesService.ventasPorMetodo();
    const graficoTopProd = salesService.productosMasVendidos(8);

    // Caja del usuario
    const cajaActual = userId ? cajaService.getCajaAbierta(userId) : null;

    // Productos con stock bajo o sin stock para mostrar en dashboard
    const productosStockBajo = productsService.listLowStock(20);

    res.render('pages/dashboard', {
      title:  'Dashboard',
      module: 'Dashboard',
      active: 'dashboard',
      user:   { name: userName, role },
      stats,
      cajaActual,
      graficoSemana:  JSON.stringify(graficoSemana),
      graficoMetodos: JSON.stringify(graficoMetodos),
      graficoTopProd: JSON.stringify(graficoTopProd),
      productosStockBajo,
    });
  } catch (err) {
    console.error('Error dashboard:', err);
    res.status(500).send('Error en dashboard: ' + err.message);
  }
};
