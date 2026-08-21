// src/services/clientes.service.js
const { get, all, run } = require('../db');

function initClientesSchema() {
  ['documento TEXT', 'saldo REAL NOT NULL DEFAULT 0'].forEach(col => {
    try { run(`ALTER TABLE clientes ADD COLUMN ${col}`); } catch(e) {}
  });
  // Nuevas columnas opcionales
  ['telefono TEXT', 'email TEXT', 'direccion TEXT', 'limite_credito REAL DEFAULT NULL', 'categoria TEXT DEFAULT NULL'].forEach(col => {
    try { run(`ALTER TABLE clientes ADD COLUMN ${col}`); } catch(e) {}
  });

  run(`CREATE TABLE IF NOT EXISTS clientes_movimientos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id  INTEGER NOT NULL,
    tipo        TEXT    NOT NULL CHECK(tipo IN ('cargo','pago')),
    monto       REAL    NOT NULL,
    descripcion TEXT    NOT NULL DEFAULT '',
    sale_id     INTEGER,
    saldo_post  REAL    NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )`);
}

function list() {
  return all(`SELECT * FROM clientes ORDER BY CASE WHEN id = 1 THEN 0 ELSE 1 END, nombre ASC`);
}

// Búsqueda por nombre o documento (solo columnas que existen siempre)
function search(q, limit = 8) {
  const term = `%${q}%`;
  return all(
    `SELECT id, nombre, documento, saldo FROM clientes
     WHERE nombre LIKE ? OR documento LIKE ?
     ORDER BY CASE WHEN nombre LIKE ? THEN 0 ELSE 1 END, nombre ASC
     LIMIT ?`,
    [term, term, `${q}%`, limit]
  );
}

function findById(id) {
  return get(`SELECT * FROM clientes WHERE id = ?`, [Number(id)]);
}

function create({ nombre, documento, telefono, email, direccion, limite_credito, categoria }) {
  const r = run(
    `INSERT INTO clientes (nombre, documento, telefono, email, direccion, limite_credito, categoria) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [String(nombre), documento || null, telefono || null, email || null, direccion || null,
     limite_credito != null && limite_credito !== '' ? Number(limite_credito) : null,
     categoria || null]
  );
  return findById(r.lastInsertRowid);
}

function update(id, fields) {
  const c = findById(id);
  if (!c) return null;
  run(`UPDATE clientes SET nombre=?, documento=?, telefono=?, email=?, direccion=?, limite_credito=?, categoria=? WHERE id=?`,
    [
      fields.nombre     ?? c.nombre,
      fields.documento  ?? c.documento,
      fields.telefono   !== undefined ? (fields.telefono  || null) : c.telefono,
      fields.email      !== undefined ? (fields.email     || null) : c.email,
      fields.direccion  !== undefined ? (fields.direccion || null) : c.direccion,
      fields.limite_credito !== undefined
        ? (fields.limite_credito === '' || fields.limite_credito === null ? null : Number(fields.limite_credito))
        : c.limite_credito,
      fields.categoria !== undefined ? (fields.categoria || null) : (c.categoria || null),
      Number(id)
    ]);
  return findById(id);
}

// Verifica si una venta supera el límite de crédito
// Retorna { ok: true } o { ok: false, saldo, limite, disponible }
function checkLimite(clienteId, montoVenta) {
  const c = findById(clienteId);
  if (!c || c.limite_credito == null) return { ok: true };
  const saldoActual   = c.saldo || 0;
  const disponible    = c.limite_credito - saldoActual;
  if (montoVenta > disponible) {
    return { ok: false, saldo: saldoActual, limite: c.limite_credito, disponible };
  }
  return { ok: true };
}

// Importación masiva — recibe array de objetos normalizados
// Retorna { creados, actualizados, errores }
function importMasivo(rows) {
  let creados = 0, actualizados = 0, errores = 0;
  for (const r of rows) {
    try {
      if (!r.nombre) { errores++; continue; }
      // Buscar duplicado por documento o nombre exacto
      let existente = null;
      if (r.documento) {
        existente = get(`SELECT * FROM clientes WHERE documento = ?`, [String(r.documento)]);
      }
      if (!existente) {
        existente = get(`SELECT * FROM clientes WHERE LOWER(nombre) = LOWER(?)`, [String(r.nombre)]);
      }
      if (existente) {
        update(existente.id, r);
        actualizados++;
      } else {
        create(r);
        creados++;
      }
    } catch(e) { errores++; }
  }
  return { creados, actualizados, errores };
}

function remove(id) {
  if (Number(id) === 1) return false;
  const r = run(`DELETE FROM clientes WHERE id = ?`, [Number(id)]);
  return r.changes > 0;
}

function getMovimientos(clienteId) {
  // Todos los movimientos manuales + ventas pagadas registradas
  const movs = all(
    `SELECT * FROM clientes_movimientos WHERE cliente_id = ? ORDER BY created_at ASC`,
    [Number(clienteId)]
  );

  // Ventas fiadas ya están en clientes_movimientos
  // Ventas pagadas también (tipo='venta_pagada')
  // Agregar items a cada movimiento que tenga sale_id
  return movs.map(m => {
    if (m.sale_id) {
      const items = all(
        `SELECT name as nombre, qty as cantidad, price as precio_unitario FROM sale_items WHERE sale_id = ?`,
        [m.sale_id]
      );
      return { ...m, items };
    }
    return m;
  });
}

function registrarCargo(clienteId, monto, descripcion = 'Cargo', saleId = null) {
  const c = findById(clienteId);
  if (!c) throw new Error('Cliente no encontrado');
  const nuevoSaldo = (c.saldo || 0) + Number(monto);
  run(`UPDATE clientes SET saldo = ? WHERE id = ?`, [nuevoSaldo, Number(clienteId)]);
  run(
    `INSERT INTO clientes_movimientos (cliente_id, tipo, monto, descripcion, sale_id, saldo_post)
     VALUES (?, 'cargo', ?, ?, ?, ?)`,
    [Number(clienteId), Number(monto), descripcion, saleId || null, nuevoSaldo]
  );
  return findById(clienteId);
}

function registrarPago(clienteId, monto, descripcion = 'Pago') {
  const c = findById(clienteId);
  if (!c) throw new Error('Cliente no encontrado');
  const nuevoSaldo = (c.saldo || 0) - Number(monto);
  run(`UPDATE clientes SET saldo = ? WHERE id = ?`, [nuevoSaldo, Number(clienteId)]);
  run(
    `INSERT INTO clientes_movimientos (cliente_id, tipo, monto, descripcion, saldo_post)
     VALUES (?, 'pago', ?, ?, ?)`,
    [Number(clienteId), Number(monto), descripcion, nuevoSaldo]
  );
  return findById(clienteId);
}

// ─────────────────────────────────────────────────────────────
// Historial de ventas del cliente (pagadas + fiadas)
// ─────────────────────────────────────────────────────────────
function getHistorialVentas(clienteId, limit = 200) {
  const ventas = all(
    `SELECT
       s.id,
       s.total,
       s.payment_method,
       s.status,
       s.discount_pct,
       s.discount_fixed,
       s.created_at
     FROM sales s
     WHERE s.cliente_id = ?
       AND s.status != 'anulada'
     ORDER BY s.created_at DESC
     LIMIT ?`,
    [Number(clienteId), limit]
  );

  return ventas.map(v => {
    const items = all(
      `SELECT name, qty, price, subtotal FROM sale_items WHERE sale_id = ?`,
      [v.id]
    );
    return { ...v, items };
  });
}

// Estadísticas resumidas del cliente
function getEstadisticasCliente(clienteId) {
  const row = get(
    `SELECT
       COUNT(*)                          AS total_ventas,
       COALESCE(SUM(total), 0)           AS total_comprado,
       COALESCE(AVG(total), 0)           AS ticket_promedio,
       COALESCE(MAX(total), 0)           AS venta_maxima,
       MAX(created_at)                   AS ultima_compra
     FROM sales
     WHERE cliente_id = ?
       AND status != 'anulada'`,
    [Number(clienteId)]
  );

  const topProducto = get(
    `SELECT si.name, SUM(si.qty) AS veces
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.cliente_id = ?
       AND s.status != 'anulada'
     GROUP BY si.name
     ORDER BY veces DESC
     LIMIT 1`,
    [Number(clienteId)]
  );

  return { ...row, top_producto: topProducto || null };
}

module.exports = {
  initClientesSchema, list, search, findById,
  create, update, remove,
  getMovimientos, registrarCargo, registrarPago,
  checkLimite, importMasivo,
  getHistorialVentas, getEstadisticasCliente,
};