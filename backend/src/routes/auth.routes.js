// src/routes/auth.routes.js
const express  = require('express');
const router   = express.Router();
const authSvc  = require('../services/auth.service');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');

/* ────────────────────────────────────────
   LOGIN
──────────────────────────────────────── */
router.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  // Leer logo y nombre de empresa desde la config
  const { get: dbGet } = require('../db');
  let empresa_logo   = '';
  let empresa_nombre = 'ComercialOS';
  try {
    const cfgLogo   = dbGet('SELECT value FROM config WHERE key=?', ['empresa_logo']);
    const cfgNombre = dbGet('SELECT value FROM config WHERE key=?', ['empresa_nombre']);
    if (cfgLogo   && cfgLogo.value)   empresa_logo   = cfgLogo.value;
    if (cfgNombre && cfgNombre.value) empresa_nombre = cfgNombre.value;
  } catch(e) {}
  res.render('pages/login', {
    title: 'Iniciar sesión',
    error: null,
    username: '',
    empresa_logo,
    empresa_nombre
  });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = authSvc.login(username || '', password || '');
  if (!user) {
    const { get: dbGet } = require('../db');
    let empresa_logo   = '';
    let empresa_nombre = 'ComercialOS';
    try {
      const cfgLogo   = dbGet('SELECT value FROM config WHERE key=?', ['empresa_logo']);
      const cfgNombre = dbGet('SELECT value FROM config WHERE key=?', ['empresa_nombre']);
      if (cfgLogo   && cfgLogo.value)   empresa_logo   = cfgLogo.value;
      if (cfgNombre && cfgNombre.value) empresa_nombre = cfgNombre.value;
    } catch(e) {}
    return res.render('pages/login', {
      title: 'Iniciar sesión',
      error: 'Usuario o contraseña incorrectos',
      username: username || '',
      empresa_logo,
      empresa_nombre
    });
  }const { get: dbGet } = require('../db');

let sucursal_id = 1; // valor por defecto

try {
  const userFull = dbGet('SELECT sucursal_id FROM users WHERE id = ?', [user.id]);
  if (userFull && userFull.sucursal_id) {
    sucursal_id = userFull.sucursal_id;
  }
} catch (err) {
  console.log('⚠️ sucursal_id no existe todavía, usando default');
}

req.session.user = {
  ...user,
  name: user.nombre || user.username,
  sucursal_id
};
  try {
    require('../services/auditoria.service').registrar({
      tipo: 'login',
      usuario: user.nombre || user.username,
      sucursal_id,
      detalle: `Inicio de sesión de ${user.nombre || user.username}`,
      entidad: 'sesion',
    });
  } catch (_) {}
  const returnTo = req.session.returnTo || (req.session.user?.role !== 'admin' ? '/ventas' : '/dashboard');
  delete req.session.returnTo;
  res.redirect(returnTo);
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

/* ────────────────────────────────────────
   API USUARIOS (solo admin)
──────────────────────────────────────── */
router.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  res.json(authSvc.listUsers());
});

router.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const user = authSvc.createUser(req.body);
    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    // No puede degradarse a sí mismo si es el único admin
    const target = authSvc.findById(Number(req.params.id));
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const updated = authSvc.updateUser(Number(req.params.id), req.body);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/api/users/:id/password', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  // Solo admin puede cambiar contraseña de otros; cualquiera puede cambiar la suya
  if (req.session.user.role !== 'admin' && req.session.user.id !== id) {
    return res.status(403).json({ error: 'Sin permiso' });
  }
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  }
  authSvc.changePassword(id, password);
  res.json({ ok: true });
});

router.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    authSvc.deleteUser(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ────────────────────────────────────────
   VENDEDOR ACTIVO — cambio rápido de "quién está
   atendiendo" en el POS, sin cerrar sesión ni pedir
   usuario/contraseña completos. Usa PIN corto.
──────────────────────────────────────── */

// Lista liviana de empleados para el selector (sin datos sensibles)
router.get('/api/empleados-activos', requireAuth, (req, res) => {
  const sucursal_id = req.session.user?.sucursal_id;
  res.json(authSvc.listEmpleadosActivos(req.session.user?.role === 'admin' ? null : sucursal_id));
});

// Quién es el vendedor activo ahora mismo (si no eligieron a nadie,
// es el usuario logueado)
router.get('/api/vendedor-activo', requireAuth, (req, res) => {
  const activo = req.session.vendedorActivo || {
    id: req.session.user.id,
    nombre: req.session.user.nombre || req.session.user.username,
  };
  res.json(activo);
});

// Cambiar el vendedor activo verificando su PIN
router.post('/api/vendedor-activo', requireAuth, (req, res) => {
  const { user_id, pin } = req.body;
  if (!user_id || !pin) return res.status(400).json({ error: 'Elegí un empleado e ingresá el PIN' });
  const user = authSvc.verificarPin(Number(user_id), pin);
  if (!user) {
    try {
      require('../services/auditoria.service').registrar({
        tipo: 'pin_fallido',
        usuario: req.session?.user?.nombre || req.session?.user?.username || null,
        sucursal_id: res.locals?.sucursal_id || null,
        detalle: `Intento de PIN incorrecto para el empleado #${user_id}`,
        entidad: `user_${user_id}`,
      });
    } catch (_) {}
    return res.status(401).json({ error: 'PIN incorrecto' });
  }
  req.session.vendedorActivo = { id: user.id, nombre: user.nombre };
  res.json(req.session.vendedorActivo);
});

module.exports = router;