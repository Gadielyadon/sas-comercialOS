// src/controllers/dashboard.controller.js
const salesService    = require('../services/sales.service');
const cajaService     = require('../services/caja.service');
const productsService = require('../services/products.service');
const gastosService   = require('../services/gastos.service');
const provsService    = require('../services/proveedores.service');
const { getConfigValue } = require('../services/config.service');

exports.view = (req, res) => {
  try {
    const userId     = req.session?.user?.id;
    const userName   = req.session?.user?.nombre || req.session?.user?.username || 'Admin';
    const role       = req.session?.user?.role || 'admin';
    const sucursal_id = res.locals?.sucursal_filtro ?? null;

    // ── Stats hoy / ayer ──
    const { ventasHoy, ventasAyer, stockBajo, totalProd } = salesService.getStatsDashboard(sucursal_id);

    const pct = ventasAyer.t > 0
      ? (((ventasHoy.t - ventasAyer.t) / ventasAyer.t) * 100).toFixed(1)
      : ventasHoy.t > 0 ? '100' : '0';

    const stats = [
      {
        label: 'Vendido hoy',
        value: `$${ventasHoy.t.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        icon:  'bi-cash-stack',
        color: 'primary',
        trend: `▼ ${Math.abs(pct)}% vs ayer`,
      },
      {
        label: 'Ticket promedio',
        value: ventasHoy.n > 0
          ? `$${(ventasHoy.t / ventasHoy.n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
          : '$0',
        icon:  'bi-receipt',
        color: 'success',
        trend: 'promedio por venta hoy',
      },
      {
        label: 'Ventas del día',
        value: ventasHoy.n,
        icon:  'bi-bag-check',
        color: 'info',
        trend: `${ventasAyer.n} ayer`,
      },
      {
        label: 'Stock crítico',
        value: stockBajo.n,
        icon:  'bi-exclamation-triangle',
        color: stockBajo.n > 0 ? 'alerta' : 'success',
        trend: stockBajo.n > 0 ? 'productos con poco stock' : 'Todo OK',
      }
    ];

    // ── Gráficos ──
    const graficoSemana  = salesService.ventasPorDia(7, sucursal_id);
    const graficoMetodos = salesService.ventasPorMetodo(sucursal_id);
    const graficoTopProd = salesService.productosMasVendidos(8, sucursal_id);

    // ── Caja ──
    const cajaActual = userId ? cajaService.getCajaAbierta(userId) : null;

    // ── Stock crítico ──
    const stockCritico = productsService.listLowStock ? productsService.listLowStock(20) : [];

    // ── Ventas del mes ──
    const ahora   = new Date();
    const mes     = ahora.getMonth() + 1;
    const anio    = ahora.getFullYear();
    const priMes  = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const { db }  = require('../db');
    const { get: dbGet, all: dbAll } = require('../db');

    let ventasMes = { total: 0, count: 0 };
    try {
      const vm = db.prepare(
        `SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count
         FROM sales WHERE created_at >= ? AND COALESCE(status,'completada')!='anulada'`
      ).get(priMes);
      ventasMes = { total: vm?.total || 0, count: vm?.count || 0 };
    } catch(e) {}

    // ── Gastos del mes ──
    let gastosMes = { total: 0, porCat: [] };
    try {
      const gm = gastosService.getResumenMes ? gastosService.getResumenMes(mes, anio) : null;
      if (gm) {
        gastosMes = { total: gm.total || 0, porCat: gm.porCategoria || [] };
      } else {
        const gres = gastosService.getResumen({ desde: priMes, hasta: `${anio}-12-31` });
        gastosMes = { total: gres?.total || 0, porCat: [] };
      }
    } catch(e) {}

    // ── Métricas extra ──
    let metricasExtra = { ticketMes: 0, semanaActual: 0, diffSemPct: null, horaPico: null };
    try {
      const ticketMes = ventasMes.count > 0 ? ventasMes.total / ventasMes.count : 0;

      // Semana actual vs anterior
      const lunes = new Date(); lunes.setDate(lunes.getDate() - lunes.getDay() + 1); lunes.setHours(0,0,0,0);
      const lunesStr = lunes.toISOString().substring(0,10);
      const lunesAnt = new Date(lunes.getTime() - 7*86400000).toISOString().substring(0,10);
      const lunesAntFin = new Date(lunes.getTime() - 1).toISOString().substring(0,10);

      const semAct = db.prepare(`SELECT COALESCE(SUM(total),0) as t FROM sales WHERE created_at>=? AND COALESCE(status,'completada')!='anulada'`).get(lunesStr);
      const semAnt = db.prepare(`SELECT COALESCE(SUM(total),0) as t FROM sales WHERE created_at>=? AND created_at<=? AND COALESCE(status,'completada')!='anulada'`).get(lunesAnt, lunesAntFin);

      const semActT = semAct?.t || 0;
      const semAntT = semAnt?.t || 0;
      const diffSemPct = semAntT > 0 ? Math.round(((semActT - semAntT) / semAntT) * 100) : null;

      // Hora pico
      const horaPicoRow = db.prepare(
        `SELECT strftime('%H',created_at) as hora, COUNT(*) as n FROM sales
         WHERE created_at >= date('now','-30 days') AND COALESCE(status,'completada')!='anulada'
         GROUP BY hora ORDER BY n DESC LIMIT 1`
      ).get();

      metricasExtra = {
        ticketMes,
        semanaActual: semActT,
        diffSemPct,
        horaPico: horaPicoRow ? `${horaPicoRow.hora}:00 hs` : null,
      };
    } catch(e) {}

    // ── Deuda a proveedores ──
    let deudaProvs = 0;
    try {
      const provs = provsService.list ? provsService.list() : [];
      deudaProvs = provs.reduce((acc, p) => acc + Math.max(0, Number(p.saldo || 0)), 0);
    } catch(e) {}

    res.render('pages/dashboard', {
      title:   'Dashboard',
      module:  'Dashboard',
      active:  'dashboard',
      user:    { name: userName, role },
      stats,
      cajaActual,
      graficoSemana:  JSON.stringify(graficoSemana),
      graficoMetodos: JSON.stringify(graficoMetodos),
      graficoTopProd: JSON.stringify(graficoTopProd),
      productosStockBajo: stockCritico,
      stockCritico,
      ventasMes,
      gastosMes,
      metricasExtra,
      deudaProvs,
    });
  } catch (err) {
    console.error('Error dashboard:', err);
    res.status(500).send('Error en dashboard: ' + err.message);
  }
};