// src/middlewares/caja.middleware.js
// Bloquea el acceso a /ventas si el usuario no tiene caja abierta
const cajaSvc = require('../services/caja.service');

function requireCajaAbierta(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');

  // Admin puede saltear el bloqueo (por si necesita entrar a configurar algo)
  if (req.session.user.role === 'admin') return next();

  const caja = cajaSvc.getCajaAbierta(req.session.user.id);
  if (!caja) {
    // Si es una petición AJAX, responde JSON
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ ok: false, error: 'No tenés caja abierta. Abrí tu caja antes de vender.', redirect: '/caja/abrir' });
    }
    return res.redirect('/caja/abrir');
  }

  // Inyectar caja en req para que los controllers la usen
  req.cajaActual = caja;
  next();
}

module.exports = { requireCajaAbierta };
