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

    // Usar permisosArray (ya parseado al hacer login) o parsear permisos
    let permisos = [];
    if (Array.isArray(user.permisosArray)) {
      permisos = user.permisosArray;
    } else if (Array.isArray(user.permisos)) {
      permisos = user.permisos;
    } else if (typeof user.permisos === 'string') {
      try { permisos = JSON.parse(user.permisos); } catch(e) { permisos = []; }
    }

    // Sin permisos definidos → acceso libre (empleado nuevo)
    if (permisos.length === 0 || permisos.includes(seccion)) return next();

    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    return res.status(403).render('pages/403', {
      title: 'Acceso denegado', user, active: '', module: 'Error'
    });
  };
}

/* ── Inyecta user y permisos en todas las vistas ── */
function injectUser(req, res, next) {
  const user = req.session?.user || null;
  res.locals.currentUser = user;
  if (user) {
    // Usar permisosArray si existe
    let permisos = null;
    if (Array.isArray(user.permisosArray)) {
      permisos = user.permisosArray;
    } else if (typeof user.permisos === 'string') {
      try { permisos = JSON.parse(user.permisos); } catch(e) { permisos = null; }
    } else if (Array.isArray(user.permisos)) {
      permisos = user.permisos;
    }
    res.locals.permisosEmpleado = permisos;
    res.locals.tienePermiso = (sec) => {
      if (user.role === 'admin') return true;
      if (!permisos || permisos.length === 0) return true;
      return Array.isArray(permisos) && permisos.includes(sec);
    };
  } else {
    res.locals.permisosEmpleado = null;
    res.locals.tienePermiso = () => false;
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requirePermiso, injectUser, RUTA_PERMISO };
