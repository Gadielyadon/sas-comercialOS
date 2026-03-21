// src/middlewares/auth.middleware.js

/* ── Requiere estar logueado ── */
function requireAuth(req, res, next) {
  if (req.session?.user) return next();

  // Para API devolver JSON, no redirección HTML
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Guardar URL original para redirigir después del login
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

/* ── Requiere rol admin ── */
function requireAdmin(req, res, next) {
  const role = String(req.session?.user?.role || '').trim().toLowerCase();

  // Acepta variantes comunes
  if (role === 'admin' || role === 'administrador') return next();

  // Para API devolver JSON, no HTML
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  res.status(403).render('pages/403', {
    title: 'Acceso denegado',
    user: req.session?.user || null,
    active: '',
    module: 'Error'
  });
}

/* ── Inyecta req.user en todas las vistas ── */
function injectUser(req, res, next) {
  res.locals.currentUser = req.session?.user || null;
  next();
}

module.exports = { requireAuth, requireAdmin, injectUser };
