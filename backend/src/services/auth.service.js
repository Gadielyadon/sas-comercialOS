// src/services/auth.service.js
const bcrypt     = require('bcrypt');
const { get, all, run } = require('../db');

const SALT_ROUNDS = 10;

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
  return safe;
}

/* ── CRUD usuarios ── */
function listUsers() {
  return all('SELECT id, username, nombre, role, activo, created_at FROM users ORDER BY id');
}

function findById(id) {
  return get('SELECT id, username, nombre, role, activo FROM users WHERE id = ?', [id]);
}

function createUser({ username, password, nombre, role }) {
  const existing = get('SELECT id FROM users WHERE username = ?', [username.trim().toLowerCase()]);
  if (existing) throw new Error('El nombre de usuario ya existe');
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const r = run(
    'INSERT INTO users (username, password, nombre, role) VALUES (?, ?, ?, ?)',
    [username.trim().toLowerCase(), hash, nombre || username, role || 'empleado']
  );
  return findById(r.lastInsertRowid);
}

function updateUser(id, { nombre, role, activo }) {
  run(
    'UPDATE users SET nombre = COALESCE(?, nombre), role = COALESCE(?, role), activo = COALESCE(?, activo) WHERE id = ?',
    [nombre ?? null, role ?? null, activo ?? null, id]
  );
  return findById(id);
}

function changePassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  run('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
}

function deleteUser(id) {
  // No se puede eliminar el último admin
  const admins = all("SELECT id FROM users WHERE role = 'admin' AND activo = 1");
  const target = findById(id);
  if (target?.role === 'admin' && admins.length <= 1) {
    throw new Error('No podés eliminar el único administrador');
  }
  run('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = { initUsersTable, login, listUsers, findById, createUser, updateUser, changePassword, deleteUser };
