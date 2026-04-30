// src/services/auth.service.js
const bcrypt     = require('bcrypt');
const { get, all, run } = require('../db');

const SALT_ROUNDS = 10;

// Secciones que se pueden restringir a empleados
const SECCIONES = [
  'dashboard', 'ventas', 'historial', 'caja', 'clientes', 'presupuestos',
  'inventario', 'stock', 'proveedores', 'gastos'
];

// Permisos por defecto para empleados nuevos
const PERMISOS_DEFAULT_EMPLEADO = ['dashboard', 'ventas', 'historial', 'caja'];

/* ── Crear tabla + usuario admin inicial ── */
function initUsersTable() {
  run(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      nombre     TEXT NOT NULL DEFAULT '',
      role       TEXT NOT NULL CHECK(role IN ('admin','empleado')) DEFAULT 'empleado',
      activo     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // Migraciones
  try { run(`ALTER TABLE users ADD COLUMN permisos    TEXT    DEFAULT NULL`); } catch(e) {}
  try { run(`ALTER TABLE users ADD COLUMN sucursal_id INTEGER DEFAULT 1`);   } catch(e) {}

  // Insertar admin inicial solo si no existe ningún usuario
  const existe = get('SELECT id FROM users LIMIT 1');
  if (!existe) {
    const hash = bcrypt.hashSync('admin123', SALT_ROUNDS);
    run(
      `INSERT INTO users (username, password, nombre, role) VALUES (?, ?, ?, ?)`,
      ['admin', hash, 'Administrador', 'admin']
    );
    console.log('[Auth] Usuario admin creado — contraseña: admin123');
  }
}

/* ── Parsear permisos JSON → array ── */
function parsePermisos(user) {
  if (user.role === 'admin') return null; // admin ve todo
  try {
    if (!user.permisos) return PERMISOS_DEFAULT_EMPLEADO;
    return JSON.parse(user.permisos);
  } catch(e) {
    return PERMISOS_DEFAULT_EMPLEADO;
  }
}

/* ── Verificar credenciales → devuelve user sin password ── */
function login(username, password) {
  const user = get(
    'SELECT * FROM users WHERE username = ? AND activo = 1',
    [username.trim().toLowerCase()]
  );
  if (!user) return null;
  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) return null;
  const { password: _, ...safe } = user;
  safe.permisosArray = parsePermisos(safe);
  return safe;
}

/* ── CRUD usuarios ── */
function listUsers() {
  return all('SELECT id, username, nombre, role, activo, permisos, sucursal_id, created_at FROM users ORDER BY id');
}

function findById(id) {
  return get('SELECT id, username, nombre, role, activo, permisos, sucursal_id FROM users WHERE id = ?', [id]);
}

function createUser({ username, password, nombre, role, permisos, sucursal_id }) {
  const existing = get('SELECT id FROM users WHERE username = ?', [username.trim().toLowerCase()]);
  if (existing) throw new Error('El nombre de usuario ya existe');
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const permisosJSON = (role === 'empleado' && Array.isArray(permisos))
    ? JSON.stringify(permisos)
    : null;
  const sucId = sucursal_id ? Number(sucursal_id) : 1;
  const r = run(
    'INSERT INTO users (username, password, nombre, role, permisos, sucursal_id) VALUES (?, ?, ?, ?, ?, ?)',
    [username.trim().toLowerCase(), hash, nombre || username, role || 'empleado', permisosJSON, sucId]
  );
  return findById(r.lastInsertRowid);
}

function updateUser(id, { nombre, role, activo, permisos, sucursal_id }) {
  const permisosJSON = (role === 'empleado' && Array.isArray(permisos))
    ? JSON.stringify(permisos)
    : (role === 'admin' ? null : undefined);

  const sucId = sucursal_id !== undefined ? Number(sucursal_id) : null;
  run(
    `UPDATE users SET
      nombre       = COALESCE(?, nombre),
      role         = COALESCE(?, role),
      activo       = COALESCE(?, activo),
      sucursal_id  = COALESCE(?, sucursal_id),
      permisos = CASE WHEN ? IS NOT NULL THEN ? ELSE permisos END
    WHERE id = ?`,
    [
      nombre ?? null,
      role ?? null,
      activo ?? null,
      sucId,
      permisosJSON !== undefined ? permisosJSON : null,
      permisosJSON !== undefined ? permisosJSON : null,
      id
    ]
  );
  return findById(id);
}

function changePassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  run('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
}

function deleteUser(id) {
  const admins = all("SELECT id FROM users WHERE role = 'admin' AND activo = 1");
  const target = findById(id);
  if (target?.role === 'admin' && admins.length <= 1) {
    throw new Error('No podés eliminar el único administrador');
  }
  run('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = {
  initUsersTable, login, listUsers, findById,
  createUser, updateUser, changePassword, deleteUser,
  parsePermisos, SECCIONES, PERMISOS_DEFAULT_EMPLEADO
};