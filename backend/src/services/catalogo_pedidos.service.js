// src/services/catalogo_pedidos.service.js
// Registro de los pedidos armados desde la vidriera pública. Antes de esta
// función, "enviar por WhatsApp" era solo un mensaje de texto — el sistema
// no se enteraba de nada. Ahora cada pedido queda guardado acá antes de
// abrir WhatsApp, así el dueño puede verlos, marcarlos como atendidos,
// y no se pierde nada si el cliente no llega a mandar el mensaje.
const { all, get, run } = require('../db');

function initSchema() {
  run(`CREATE TABLE IF NOT EXISTS catalogo_pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT NOT NULL,        -- JSON: [{nombre, cantidad, precio}]
    total REAL DEFAULT 0,
    estado TEXT DEFAULT 'nuevo', -- nuevo | atendido | descartado
    origen TEXT DEFAULT 'vidriera',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
}

function parseItems(row) {
  if (!row) return row;
  let items = [];
  try { items = row.items ? JSON.parse(row.items) : []; } catch (_) { items = []; }
  return { ...row, items };
}

function crear({ items, total }) {
  if (!Array.isArray(items) || !items.length) throw new Error('El pedido no tiene items');
  const itemsLimpios = items.map(i => ({
    nombre: String(i.nombre || 'Producto'),
    cantidad: Number(i.cantidad) || 1,
    precio: Number(i.precio) || 0,
  }));
  const totalCalc = total != null ? Number(total) : itemsLimpios.reduce((s, i) => s + i.precio * i.cantidad, 0);

  const info = run(
    `INSERT INTO catalogo_pedidos (items, total) VALUES (?, ?)`,
    [JSON.stringify(itemsLimpios), totalCalc]
  );
  return parseItems(get('SELECT * FROM catalogo_pedidos WHERE id = ?', [info.lastInsertRowid]));
}

function listar({ estado } = {}) {
  const where = estado ? `WHERE estado = ?` : '';
  const params = estado ? [estado] : [];
  return all(`SELECT * FROM catalogo_pedidos ${where} ORDER BY id DESC LIMIT 300`, params).map(parseItems);
}

function contarNuevos() {
  const r = get(`SELECT COUNT(*) as n FROM catalogo_pedidos WHERE estado = 'nuevo'`);
  return r?.n || 0;
}

function cambiarEstado(id, estado) {
  if (!['nuevo', 'atendido', 'descartado'].includes(estado)) throw new Error('Estado inválido');
  run(`UPDATE catalogo_pedidos SET estado = ? WHERE id = ?`, [estado, id]);
  return parseItems(get('SELECT * FROM catalogo_pedidos WHERE id = ?', [id]));
}

module.exports = { initSchema, crear, listar, contarNuevos, cambiarEstado };
