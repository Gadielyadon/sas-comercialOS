// src/app.js
const express = require('express');
const path    = require('path');
const app     = express();

// ── Views ─────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middlewares base ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
// ── Favicon ───────────────────────────────────────────────────
app.get('/favicon.ico', (req, res) => res.redirect('/favicon (3).svg'));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

const session = require('express-session');

app.use(session({
  secret: process.env.SESSION_SECRET || 'comercial-os-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8  // 8 horas
  }
}));


// ── Protección de rutas: redirige al login si no hay sesión ───
app.use((req, res, next) => {
  const openPaths = ['/login', '/logout'];
  if (openPaths.includes(req.path)) return next();

  // Si no hay sesión, redirigir al login
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  // Normalizar: garantizar que user.name siempre tenga el nombre correcto
  const u = req.session.user;
  if (!u.name) {
    u.name = u.nombre || u.username || 'Usuario';
    req.session.user = u;
  }

  next();
});


// ── Init schemas ──────────────────────────────────────────────
// 1. Sucursales PRIMERO (crea tabla + columna sucursal_id en las demás)
try {
  const sucSvc = require('./services/sucursales.service');
  sucSvc.initSucursalesSchema();
  console.log('✅  Sucursales schema OK');
} catch(e) { console.log('⚠️   sucursales.service no encontrado, se omite'); }

// 2. Caja
try {
  const cajaSvc = require('./services/caja.service');
  cajaSvc.initCajaSchema();
  console.log('✅  Caja schema OK');
} catch(e) { console.log('⚠️   Error en caja schema:', e.message); }

// 3. Promo columns en products
try {
  const prodSvc = require('./services/products.service');
  prodSvc.initPromoSchema();
  console.log('✅  Products schema OK');
} catch(e) { console.log('⚠️   Error en products schema:', e.message); }

// 4. Clientes
try {
  const clSvc = require('./services/clientes.service');
  clSvc.initClientesSchema();
  console.log('✅  Clientes schema OK');
} catch(e) { console.log('⚠️   clientes.service no encontrado, se omite'); }

// 5. Proveedores
try {
  const provSvc = require('./services/proveedores.service');
  provSvc.initProveedoresSchema();
  console.log('✅  Proveedores schema OK');
} catch(e) { console.log('⚠️   proveedores.service no encontrado:', e.message); }

// 6. Gastos
try {
  const gastosSvc = require('./services/gastos.service');
  gastosSvc.initGastosSchema();
  console.log('✅  Gastos schema OK');
} catch(e) { console.log('⚠️   gastos.service no encontrado:', e.message); }

// Sales
const salesSvc = require('./services/sales.service');
salesSvc.initSalesSchema();

// Auth — usuarios
try {
  const authSvc = require('./services/auth.service');
  authSvc.initUsersTable();
  console.log('✅  Users schema OK');
} catch(e) { console.log('⚠️   Error en users schema:', e.message); }

// Payment methods
try {
  const pmSvc = require('./services/payment_methods.service');
  if (pmSvc.initPaymentMethodsSchema) pmSvc.initPaymentMethodsSchema();
  console.log('✅  Payment methods schema OK');
} catch(e) { console.log('⚠️   Error en payment_methods schema:', e.message); }

// 7. Presupuestos
try {
  const presupuestosSvc = require('./services/presupuestos.service');
  presupuestosSvc.initPresupuestosSchema();
  console.log('✅  Presupuestos schema OK');
} catch(e) { console.log('⚠️   Error en presupuestos schema:', e.message); }

// 8. AFIP / Factura Electrónica
try {
  const afipSvc = require('./services/afip.service');
  afipSvc.initAfipSchema();
  console.log('✅  AFIP schema OK');
} catch(e) { console.log('⚠️   Error en AFIP schema:', e.message); }

// ── Auth middleware (si existe) ───────────────────────────────
try {
  const { injectUser } = require('./middlewares/auth.middleware');
  app.use(injectUser);
  console.log('✅  Auth middleware OK');
} catch(e) { 
  // Sin auth: inyectar usuario admin por defecto para desarrollo
  app.use((req, res, next) => {
    res.locals.user = res.locals.user || { id: 1, name: 'Admin', role: 'admin', sucursal_id: 1 };
    next();
  });
}

// ── Sucursal middleware (si existe) ───────────────────────────
try {
  const { injectSucursal } = require('./middlewares/sucursal.middleware');
  app.use(injectSucursal);
  console.log('✅  Sucursal middleware OK');
} catch(e) {
  // Fallback: inyectar sucursal 1 por defecto
  app.use((req, res, next) => {
    res.locals.sucursal_id     = 1;
    res.locals.sucursal        = { id: 1, nombre: 'Casa Central' };
    res.locals.sucursal_filtro = null;  // admin ve todo
    res.locals.es_admin        = true;
    next();
  });
  console.log('ℹ️   sucursal.middleware no encontrado, usando fallback');
}

// ── Empresa middleware — inyecta nombre/logo en todas las vistas ──
app.use((req, res, next) => {
  try {
    const { get } = require('./db');
    const getNombre = get(`SELECT value FROM config WHERE key=?`, ['empresa_nombre']);
    const getLogo   = get(`SELECT value FROM config WHERE key=?`, ['empresa_logo']);
    res.locals.empresa_nombre = getNombre ? getNombre.value : '';
    res.locals.empresa_logo   = getLogo   ? getLogo.value   : '';
  } catch(e) {
    res.locals.empresa_nombre = '';
    res.locals.empresa_logo   = '';
  }
  next();
});

// ── Rutas ─────────────────────────────────────────────────────
// Auth
try {
  const authRoutes = require('./routes/auth.routes');
  app.use('/', authRoutes);
} catch(e) {}

// Caja
try {
  const cajaRoutes = require('./routes/caja.routes');
  app.use('/caja', cajaRoutes);
} catch(e) { console.log('⚠️   caja.routes no encontrado'); }

// API
const apiRoutes = require('./routes/api.routes');
app.use('/api', apiRoutes);

// Proveedores
try {
  const provRoutes = require('./routes/proveedores.routes');
  app.use('/proveedores', provRoutes);
  console.log('✅  Proveedores routes OK');
} catch(e) { console.log('⚠️   proveedores.routes no encontrado:', e.message); }

// Gastos
try {
  const gastosRoutes = require('./routes/gastos.routes');
  app.use('/gastos', gastosRoutes);
  console.log('✅  Gastos routes OK');
} catch(e) { console.log('⚠️   gastos.routes no encontrado:', e.message); }

// Presupuestos
try {
  const presupuestosRoutes = require('./routes/presupuestos.routes');
  app.use('/presupuestos', presupuestosRoutes);
  console.log('✅  Presupuestos routes OK');
} catch(e) { console.log('⚠️   presupuestos.routes error:', e.message); }

// AFIP / Factura Electrónica
try {
  const afipRoutes = require('./routes/afip.routes');
  app.use('/afip', afipRoutes);
  console.log('✅  AFIP routes OK');
} catch(e) { console.log('⚠️   afip.routes error:', e.message); }

// Main (dashboard, ventas, inventario, sucursales)
const mainRoutes = require('./routes/main.routes');
app.use('/', mainRoutes);

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  ComercialOS en http://localhost:${PORT}\n`);
});
