// src/services/catalogo_banners.service.js
// Banner de imágenes promocionales de la vidriera digital — no están
// atadas a ningún producto, son solo para mostrar promos/novedades
// arriba de todo, tipo carrusel de una página web.
const { all, get, run } = require('../db');

function initSchema() {
  run(`CREATE TABLE IF NOT EXISTS catalogo_banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imagen TEXT NOT NULL,
    orden INTEGER DEFAULT 0,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

function list() {
  return all('SELECT * FROM catalogo_banners ORDER BY orden ASC, id ASC');
}

function create(imagen) {
  const info = run('INSERT INTO catalogo_banners (imagen) VALUES (?)', [imagen]);
  return get('SELECT * FROM catalogo_banners WHERE id = ?', [info.lastInsertRowid]);
}

function remove(id) {
  run('DELETE FROM catalogo_banners WHERE id = ?', [id]);
  return true;
}

module.exports = { initSchema, list, create, remove };
