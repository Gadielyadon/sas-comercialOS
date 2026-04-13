// src/middlewares/sucursal.middleware.js
const { db } = require('../db');

const stmtUserSuc  = db.prepare(`SELECT sucursal_id FROM users WHERE id = ?`);
const stmtSucursal = db.prepare(`SELECT * FROM sucursales WHERE id = ?`);

function injectSucursal(req, res, next) {
  const user = res.locals.user || req.session?.user;

  if (user) {
    const dbUser      = stmtUserSuc.get(user.id);
    const userSucId   = dbUser?.sucursal_id || user.sucursal_id || 1;

    // Admin puede tener una sucursal_activa elegida desde el selector
    const sucursal_id = (user.role === 'admin' && req.session?.sucursal_activa)
      ? Number(req.session.sucursal_activa)
      : userSucId;

    const sucursal = stmtSucursal.get(Number(sucursal_id));

    res.locals.sucursal_id     = sucursal_id;
    res.locals.sucursal        = sucursal || { id: 1, nombre: 'Casa Central' };
    res.locals.es_admin        = user.role === 'admin';
    // Admin que eligió una sucursal → filtra por ella. Admin sin elección → ve todo.
    res.locals.sucursal_filtro = user.role === 'admin'
      ? (req.session?.sucursal_activa ? sucursal_id : null)
      : sucursal_id;

    // Lista de sucursales disponibles para el selector (solo admins)
    if (user.role === 'admin') {
      try {
        res.locals.sucursales_lista = db.prepare(`SELECT id, nombre FROM sucursales WHERE activa=1 ORDER BY id`).all();
      } catch(e) {
        res.locals.sucursales_lista = [{ id: 1, nombre: 'Casa Central' }];
      }
    } else {
      res.locals.sucursales_lista = [];
    }
  } else {
    res.locals.sucursal_id      = 1;
    res.locals.sucursal         = { id: 1, nombre: 'Casa Central' };
    res.locals.es_admin         = false;
    res.locals.sucursal_filtro  = 1;
    res.locals.sucursales_lista = [];
  }

  next();
}

module.exports = { injectSucursal };
