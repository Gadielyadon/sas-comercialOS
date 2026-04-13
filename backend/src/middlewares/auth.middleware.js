// src/middlewares/auth.middleware.js

// Mapa de ruta → clave de permiso
const RUTA_PERMISO = {
  '/ventas':       'ventas',
  '/historial':    'historial',
  '/caja':         'caja',
  '/clientes':     'clientes',
  '/presupuestos': 'presupuestos',
  '/inventario':   'inventario',
  '/stock':        'stock',
  '/proveedores':  'proveedores',
  '/gastos':       'gastos',
};

// Import lazy para evitar problemas de orden de carga
function getParsePermisos() {
  try { return require('../services/auth.service').parsePermisos; } catch(e) { return null; }
}

/* ── Requiere estar logueado ── */
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

/* ── Requiere rol admin ── */
function requireAdmin(req, res, next) {
  const role = String(req.session?.user?.role || '').trim().toLowerCase();
  if (role === 'admin' || role === 'administrador') return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  res.status(403).render('pages/403', {
    title: 'Acceso denegado',
    user: req.session?.user || null,
    active: '', module: 'Error'
  });
}

/* ── Verifica permisos de sección para empleados ── */
function requirePermiso(seccion) {
  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.redirect('/login');
    if (user.role === 'admin') return next();

    const parsePermisos = getParsePermisos();
    const permisos = parsePermisos ? parsePermisos(user) : null;
    if (!permisos || permisos.includes(seccion)) return next();

    return res.redirect('/dashboard?sin_permiso=1');
  };
}

/* ── Inyecta user y permisos en todas las vistas ── */
function injectUser(req, res, next) {
  const user = req.session?.user || null;
  res.locals.currentUser = user;

  if (user) {
    const parsePermisos = getParsePermisos();
    const permisos = parsePermisos ? parsePermisos(user) : null;
    res.locals.permisosEmpleado = permisos;

    res.locals.tienePermiso = (sec) => {
      if (user.role === 'admin') return true;
      return Array.isArray(permisos) && permisos.includes(sec);
    };
  } else {
    res.locals.permisosEmpleado = null;
    res.locals.tienePermiso = () => false;
  }

  next();
}

module.exports = { requireAuth, requireAdmin, requirePermiso, injectUser, RUTA_PERMISO };
