// src/middlewares/sucursal.middleware.js
//
// Lee la sucursal del usuario autenticado y la pone en res.locals
// para que todos los controllers y vistas la tengan disponible.
//
// Uso en app.js:
//   const { injectSucursal } = require('./middlewares/sucursal.middleware');
//   app.use(injectSucursal);

const { get } = require('../db');

function injectSucursal(req, res, next) {
  // Si ya hay usuario en locals (desde auth middleware)
  const user = res.locals.user || req.session?.user;

  if (user) {
    // Buscar sucursal_id del user en la DB (más confiable que sesión)
    const dbUser = get(`SELECT sucursal_id FROM users WHERE id = ?`, [user.id]);
    const sucursal_id = dbUser?.sucursal_id || user.sucursal_id || 1;

    // Obtener datos completos de la sucursal
    const sucursal = get(`SELECT * FROM sucursales WHERE id = ?`, [Number(sucursal_id)]);

    res.locals.sucursal_id    = sucursal_id;
    res.locals.sucursal       = sucursal || { id: 1, nombre: 'Casa Central' };
    res.locals.es_admin       = user.role === 'admin';
    // Admin puede ver todas las sucursales → sucursal_id_filtro = null
    // Empleado solo ve la suya
    res.locals.sucursal_filtro = user.role === 'admin' ? null : sucursal_id;
  } else {
    res.locals.sucursal_id     = 1;
    res.locals.sucursal        = { id: 1, nombre: 'Casa Central' };
    res.locals.es_admin        = false;
    res.locals.sucursal_filtro = 1;
  }

  next();
}

module.exports = { injectSucursal };
    