// src/services/pedidos.service.js
const { get, all, run, db } = require('../db');

function initPedidosSchema() {
  run(`CREATE TABLE IF NOT EXISTS pedidos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo        TEXT NOT NULL DEFAULT 'pedido',   -- 'pedido' | 'faltante'
    titulo      TEXT NOT NULL,
    descripcion TEXT,
    cliente     TEXT,
    cantidad    TEXT,
    proveedor   TEXT,
    prioridad   TEXT NOT NULL DEFAULT 'normal',   -- 'urgente' | 'normal' | 'baja'
    estado      TEXT NOT NULL DEFAULT 'pendiente',-- 'pendiente' | 'listo' | 'entregado' | 'cancelado'
    fecha_entrega TEXT,
    recordatorio  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  try { run(`ALTER TABLE pedidos ADD COLUMN notas TEXT`); } catch(_) {}
}

function list(filtros = {}) {
  let where = [];
  let params = [];
  if (filtros.tipo)   { where.push(`tipo = ?`);   params.push(filtros.tipo); }
  if (filtros.estado) { where.push(`estado = ?`); params.push(filtros.estado); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return all(`SELECT * FROM pedidos ${w} ORDER BY
    CASE prioridad WHEN 'urgente' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
    CASE estado WHEN 'pendiente' THEN 0 WHEN 'listo' THEN 1 ELSE 2 END,
    created_at DESC`, params);
}

function findById(id) {
  return get(`SELECT * FROM pedidos WHERE id = ?`, [Number(id)]);
}

function create(data) {
  const r = run(
    `INSERT INTO pedidos (tipo, titulo, descripcion, cliente, cantidad, proveedor, prioridad, estado, fecha_entrega, recordatorio, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.tipo        || 'pedido',
      String(data.titulo).trim(),
      data.descripcion || null,
      data.cliente     || null,
      data.cantidad    || null,
      data.proveedor   || null,
      data.prioridad   || 'normal',
      data.estado      || 'pendiente',
      data.fecha_entrega  || null,
      data.recordatorio   || null,
      data.notas          || null,
    ]
  );
  return findById(r.lastInsertRowid);
}

function update(id, data) {
  const p = findById(id);
  if (!p) return null;
  run(
    `UPDATE pedidos SET
      tipo = ?, titulo = ?, descripcion = ?, cliente = ?, cantidad = ?,
      proveedor = ?, prioridad = ?, estado = ?, fecha_entrega = ?,
      recordatorio = ?, notas = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [
      data.tipo        ?? p.tipo,
      data.titulo      !== undefined ? String(data.titulo).trim() : p.titulo,
      data.descripcion !== undefined ? data.descripcion : p.descripcion,
      data.cliente     !== undefined ? data.cliente     : p.cliente,
      data.cantidad    !== undefined ? data.cantidad    : p.cantidad,
      data.proveedor   !== undefined ? data.proveedor   : p.proveedor,
      data.prioridad   ?? p.prioridad,
      data.estado      ?? p.estado,
      data.fecha_entrega  !== undefined ? data.fecha_entrega  : p.fecha_entrega,
      data.recordatorio   !== undefined ? data.recordatorio   : p.recordatorio,
      data.notas          !== undefined ? data.notas          : p.notas,
      Number(id),
    ]
  );
  return findById(id);
}

function remove(id) {
  const r = run(`DELETE FROM pedidos WHERE id = ?`, [Number(id)]);
  return r.changes > 0;
}

// Contar pendientes urgentes para badge en sidebar
function countUrgentes() {
  const r = get(`SELECT COUNT(*) as n FROM pedidos WHERE estado = 'pendiente' AND prioridad = 'urgente'`);
  return r?.n || 0;
}

// Contar recordatorios para hoy
function countRecordatoriosHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  const r = get(`SELECT COUNT(*) as n FROM pedidos WHERE estado = 'pendiente' AND recordatorio <= ?`, [hoy]);
  return r?.n || 0;
}

module.exports = { initPedidosSchema, list, findById, create, update, remove, countUrgentes, countRecordatoriosHoy };
