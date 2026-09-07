// src/services/catalogo_productos.service.js
// Productos del catálogo digital (vidriera pública) — tabla PROPIA,
// totalmente independiente de `products` (Inventario). El dueño del
// negocio arma su catálogo de vidriera sin tocar nunca su stock real.
const { all, get, run } = require('../db');

function initSchema() {
  run(`CREATE TABLE IF NOT EXISTS catalogo_productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    categoria TEXT,
    precio REAL DEFAULT 0,
    en_promo INTEGER DEFAULT 0,
    precio_promo REAL,
    imagen TEXT,
    activo INTEGER DEFAULT 1,
    orden INTEGER DEFAULT 0,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  // Ficha de producto: descripción larga + galería de fotos extra (JSON array)
  try { run(`ALTER TABLE catalogo_productos ADD COLUMN descripcion TEXT`); } catch (_) {}
  try { run(`ALTER TABLE catalogo_productos ADD COLUMN imagenes TEXT`); } catch (_) {}
}

function parseImagenes(row) {
  if (!row) return row;
  let imagenes = [];
  try { imagenes = row.imagenes ? JSON.parse(row.imagenes) : []; } catch (_) { imagenes = []; }
  return { ...row, imagenes };
}

function list() {
  return all('SELECT * FROM catalogo_productos ORDER BY orden ASC, id DESC').map(parseImagenes);
}

function listPublico() {
  return all('SELECT * FROM catalogo_productos WHERE activo = 1 ORDER BY orden ASC, id DESC').map(parseImagenes);
}

function listCategorias() {
  const rows = all(`SELECT DISTINCT categoria FROM catalogo_productos WHERE categoria IS NOT NULL AND categoria != '' ORDER BY categoria ASC`);
  return rows.map(r => r.categoria);
}

function findById(id) {
  return parseImagenes(get('SELECT * FROM catalogo_productos WHERE id = ?', [id]));
}

function toImagenesJson(imagenes) {
  if (!Array.isArray(imagenes)) return null;
  const limpio = imagenes.filter(Boolean).slice(0, 6);
  return limpio.length ? JSON.stringify(limpio) : null;
}

function create({ nombre, categoria = null, precio = 0, en_promo = 0, precio_promo = null, imagen = null, activo = 1, descripcion = null, imagenes = [] }) {
  const info = run(
    `INSERT INTO catalogo_productos (nombre, categoria, precio, en_promo, precio_promo, imagen, activo, descripcion, imagenes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [String(nombre), categoria || null, Number(precio) || 0, en_promo ? 1 : 0, precio_promo != null && precio_promo !== '' ? Number(precio_promo) : null, imagen || null, activo ? 1 : 0, descripcion || null, toImagenesJson(imagenes)]
  );
  return findById(info.lastInsertRowid);
}

function update(id, fields) {
  const p = findById(id);
  if (!p) return null;
  run(
    `UPDATE catalogo_productos SET
      nombre = ?, categoria = ?, precio = ?, en_promo = ?, precio_promo = ?, imagen = ?, activo = ?, descripcion = ?, imagenes = ?
     WHERE id = ?`,
    [
      fields.nombre !== undefined ? String(fields.nombre) : p.nombre,
      fields.categoria !== undefined ? (fields.categoria || null) : p.categoria,
      fields.precio !== undefined ? (Number(fields.precio) || 0) : p.precio,
      fields.en_promo !== undefined ? (fields.en_promo ? 1 : 0) : p.en_promo,
      fields.precio_promo !== undefined ? (fields.precio_promo != null && fields.precio_promo !== '' ? Number(fields.precio_promo) : null) : p.precio_promo,
      fields.imagen !== undefined ? (fields.imagen || null) : p.imagen,
      fields.activo !== undefined ? (fields.activo ? 1 : 0) : p.activo,
      fields.descripcion !== undefined ? (fields.descripcion || null) : p.descripcion,
      fields.imagenes !== undefined ? toImagenesJson(fields.imagenes) : toImagenesJson(p.imagenes),
      id,
    ]
  );
  return findById(id);
}

function remove(id) {
  run('DELETE FROM catalogo_productos WHERE id = ?', [id]);
  return true;
}

module.exports = { initSchema, list, listPublico, listCategorias, findById, create, update, remove };
