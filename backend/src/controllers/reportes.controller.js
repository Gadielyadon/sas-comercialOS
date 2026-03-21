// src/controllers/reportes.controller.js
const salesService    = require('../services/sales.service');
const cajaService     = require('../services/caja.service');
const productsService = require('../services/products.service');
const { get, all }    = require('../db');

function getEmpresaNombre() {
  try { const r = get(`SELECT value FROM config WHERE key='empresa_nombre'`); return r ? r.value : 'Mi Comercio'; }
  catch(e) { return 'Mi Comercio'; }
}

exports.caja = (req, res) => {
  try {
    const user   = req.session?.user || { name: 'Admin', role: 'admin' };
    const suc_id = user.sucursal_id || 1;

    // Caja actual — NO bloquea si no hay caja abierta
    let cajaActual = null;
    try {
      const r = cajaService.getCurrentCaja(suc_id);
      cajaActual = r?.ok ? r.caja : null;
    } catch(e) {}

    // Ventas de hoy
    let ventasHoy = [];
    try { ventasHoy = salesService.listToday(suc_id); }
    catch(e) { try { ventasHoy = salesService.listToday(); } catch(e2) {} }

    // Stock bajo
    let stockBajo = [];
    try { stockBajo = cajaService.getLowStockProducts(10, suc_id); } catch(e) {}

    // Historial de cajas (usa SQL directo, evita listCajas que no existe)
    let cajas = [];
    try {
      const whereAdmin = user.role === 'admin' ? '' : `AND c.sucursal_id = ${Number(suc_id)}`;
      cajas = all(`
        SELECT c.*,
               COALESCE(su.nombre,'Casa Central') as sucursal_nombre
        FROM caja c
        LEFT JOIN sucursales su ON su.id = c.sucursal_id
        WHERE 1=1 ${whereAdmin}
        ORDER BY c.opened_at DESC
        LIMIT 50
      `);
    } catch(e) {
      try { cajas = all(`SELECT * FROM caja ORDER BY opened_at DESC LIMIT 50`); }
      catch(e2) {}
    }

    res.render('pages/caja_reporte', {
      title:   'Reporte de Caja',
      module:  'Caja',
      active:  'caja',
      empresaNombre: getEmpresaNombre(),
      user: {
        name: user.name || user.nombre || user.username || 'Admin',
        role: user.role || 'admin'
      },
      cajaActual,
      ventasHoy,
      stockBajo,
      cajas,
    });
  } catch (err) {
    console.error('Error generando reporte de caja:', err);
    res.status(500).send('Error generando reporte de caja: ' + err.message);
  }
};
