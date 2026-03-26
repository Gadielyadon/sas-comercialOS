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
  res.render('pages/login', {
    title: 'Iniciar sesión',
    error: null,
    username: ''
  });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = authSvc.login(username || '', password || '');
  if (!user) {
    return res.render('pages/login', {
      title: 'Iniciar sesión',
      error: 'Usuario o contraseña incorrectos',
      username: username || ''
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
  const returnTo = req.session.returnTo || '/dashboard';
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

module.exports = router;
