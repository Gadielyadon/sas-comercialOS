// src/services/pedidos.service.js
const { get, all, run } = require('../db');

function initPedidosSchema() {
  // Tabla principal — compatible hacia atrás
  run(`CREATE TABLE IF NOT EXISTS pedidos (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo                 TEXT NOT NULL DEFAULT 'pedido',
    titulo               TEXT NOT NULL DEFAULT 'Pedido',
    descripcion          TEXT,
    cliente              TEXT,
    cantidad             TEXT,
    proveedor            TEXT,
    proveedor_id         INTEGER DEFAULT NULL,
    prioridad            TEXT NOT NULL DEFAULT 'normal',
    estado               TEXT NOT NULL DEFAULT 'pendiente',
    estado_recepcion     TEXT DEFAULT NULL,   -- NULL | 'enviado' | 'recibido_parcial' | 'recibido'
    fecha_entrega        TEXT,
    recordatorio         TEXT,
    notas                TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  // Columnas nuevas — safe para bases existentes
  const sa = sql => { try { run(sql); } catch(_) {} };
  sa(`ALTER TABLE pedidos ADD COLUMN proveedor_id     INTEGER DEFAULT NULL`);
  sa(`ALTER TABLE pedidos ADD COLUMN estado_recepcion TEXT DEFAULT NULL`);

  // Tabla de ítems del pedido
  run(`CREATE TABLE IF NOT EXISTS pedido_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id        INTEGER NOT NULL,
    sku              TEXT,                  -- null si es producto manual
    nombre           TEXT NOT NULL,
    cantidad         REAL NOT NULL DEFAULT 1,
    precio_costo     REAL DEFAULT 0,
    es_manual        INTEGER NOT NULL DEFAULT 0,   -- 1 = ingresado a mano, sin SKU
    cantidad_recibida REAL DEFAULT NULL,           -- se completa al recepcionar
    recibido         INTEGER DEFAULT 0,            -- 0 | 1
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
  )`);
  sa(`ALTER TABLE pedido_items ADD COLUMN cantidad_recibida REAL DEFAULT NULL`);
  sa(`ALTER TABLE pedido_items ADD COLUMN recibido INTEGER DEFAULT 0`);
  sa(`ALTER TABLE pedido_items ADD COLUMN precio_venta REAL DEFAULT 0`);

  // Campos de pago por pedido
  sa(`ALTER TABLE pedidos ADD COLUMN pago_estado  TEXT DEFAULT NULL`);  // NULL | 'pagado'
  sa(`ALTER TABLE pedidos ADD COLUMN pago_monto   REAL DEFAULT NULL`);
  sa(`ALTER TABLE pedidos ADD COLUMN pago_fecha   TEXT DEFAULT NULL`);
  sa(`ALTER TABLE pedidos ADD COLUMN pago_metodo  TEXT DEFAULT NULL`);

  // Tabla de pagos parciales por pedido
  run(`CREATE TABLE IF NOT EXISTS pedido_pagos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id    INTEGER NOT NULL,
    monto        REAL NOT NULL,
    fecha        TEXT NOT NULL,
    metodo       TEXT,
    nota         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
  )`);
}

// ── PEDIDOS ───────────────────────────────────────────────────
function list(filtros = {}) {
  let where = [], params = [];
  if (filtros.tipo)         { where.push(`tipo = ?`);         params.push(filtros.tipo); }
  if (filtros.estado)       { where.push(`estado = ?`);       params.push(filtros.estado); }
  if (filtros.proveedor_id) { where.push(`proveedor_id = ?`); params.push(Number(filtros.proveedor_id)); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return all(
    `SELECT * FROM pedidos ${w}
     ORDER BY CASE prioridad WHEN 'urgente' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
              CASE estado WHEN 'pendiente' THEN 0 WHEN 'listo' THEN 1 ELSE 2 END,
              created_at DESC`,
    params
  );
}

function findById(id) {
  return get(`SELECT * FROM pedidos WHERE id = ?`, [Number(id)]);
}

function getItems(pedidoId) {
  return all(`SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id ASC`, [Number(pedidoId)]);
}

function create(data) {
  const titulo = (data.titulo && String(data.titulo).trim()) || 'Pedido';
  const r = run(
    `INSERT INTO pedidos (tipo,titulo,descripcion,cliente,cantidad,proveedor,proveedor_id,prioridad,estado,fecha_entrega,recordatorio,notas)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.tipo         || 'pedido',
      titulo,
      data.descripcion  || null,
      data.cliente      || null,
      data.cantidad     || null,
      data.proveedor    || null,
      data.proveedor_id || null,
      data.prioridad    || 'normal',
      data.estado       || 'pendiente',
      data.fecha_entrega || null,
      data.recordatorio  || null,
      data.notas         || null,
    ]
  );
  const pedidoId = r.lastInsertRowid;

  // Insertar ítems si vienen
  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items) {
      run(
        `INSERT INTO pedido_items (pedido_id, sku, nombre, cantidad, precio_costo, precio_venta, es_manual)
         VALUES (?,?,?,?,?,?,?)`,
        [
          pedidoId,
          item.sku        || null,
          String(item.nombre),
          Number(item.cantidad)     || 1,
          Number(item.precio_costo) || 0,
          Number(item.precio_venta) || 0,
          item.es_manual ? 1 : 0,
        ]
      );
    }
  }
  return findById(pedidoId);
}

function update(id, data) {
  const p = findById(id);
  if (!p) return null;
  run(
    `UPDATE pedidos SET
       tipo=?, titulo=?, descripcion=?, cliente=?, cantidad=?,
       proveedor=?, proveedor_id=?, prioridad=?, estado=?,
       estado_recepcion=?, fecha_entrega=?, recordatorio=?, notas=?,
       updated_at=datetime('now','localtime')
     WHERE id=?`,
    [
      data.tipo              ?? p.tipo,
      data.titulo            !== undefined ? String(data.titulo).trim() : p.titulo,
      data.descripcion       !== undefined ? data.descripcion       : p.descripcion,
      data.cliente           !== undefined ? data.cliente           : p.cliente,
      data.cantidad          !== undefined ? data.cantidad          : p.cantidad,
      data.proveedor         !== undefined ? data.proveedor         : p.proveedor,
      data.proveedor_id      !== undefined ? data.proveedor_id      : p.proveedor_id,
      data.prioridad         ?? p.prioridad,
      data.estado            ?? p.estado,
      data.estado_recepcion  !== undefined ? data.estado_recepcion  : p.estado_recepcion,
      data.fecha_entrega     !== undefined ? data.fecha_entrega     : p.fecha_entrega,
      data.recordatorio      !== undefined ? data.recordatorio      : p.recordatorio,
      data.notas             !== undefined ? data.notas             : p.notas,
      Number(id),
    ]
  );

  // Si vienen ítems en la edición: borrar los existentes y reinsertarlos
  // Solo se borran/recrean los que NO están ya recibidos
  if (data.items && Array.isArray(data.items)) {
    // Borrar solo ítems pendientes (no recibidos)
    run(`DELETE FROM pedido_items WHERE pedido_id=? AND recibido=0`, [Number(id)]);
    for (const item of data.items) {
      run(
        `INSERT INTO pedido_items (pedido_id, sku, nombre, cantidad, precio_costo, precio_venta, es_manual)
         VALUES (?,?,?,?,?,?,?)`,
        [
          Number(id),
          item.sku        || null,
          String(item.nombre),
          Number(item.cantidad)     || 1,
          Number(item.precio_costo) || 0,
          Number(item.precio_venta) || 0,
          item.es_manual ? 1 : 0,
        ]
      );
    }
  }

  return findById(id);
}

function remove(id) {
  run(`DELETE FROM pedido_items WHERE pedido_id=?`, [Number(id)]);
  const r = run(`DELETE FROM pedidos WHERE id=?`, [Number(id)]);
  return r.changes > 0;
}

// Enviar pedido a un proveedor
function enviarAProveedor(pedidoId, proveedorId) {
  const p = findById(pedidoId);
  if (!p) throw new Error('Pedido no encontrado');
  const provSvc = require('./proveedores.service');
  const prov = provSvc.findById(proveedorId);
  if (!prov) throw new Error('Proveedor no encontrado');
  run(
    `UPDATE pedidos SET proveedor_id=?, proveedor=?, estado_recepcion='enviado', updated_at=datetime('now','localtime') WHERE id=?`,
    [Number(proveedorId), prov.nombre, Number(pedidoId)]
  );
  return findById(pedidoId);
}

// Obtener pedidos enviados a un proveedor (para la vista de proveedores)
function getPedidosByProveedor(proveedorId) {
  const pedidos = all(
    `SELECT * FROM pedidos WHERE proveedor_id=? AND estado_recepcion IN ('enviado','recibido_parcial')
     ORDER BY created_at DESC`,
    [Number(proveedorId)]
  );
  return pedidos.map(p => ({
    ...p,
    items: getItems(p.id),
  }));
}

// Recepcionar un pedido (total o parcial)
// recepciones: [{ item_id, cantidad_recibida, recibido, precio_costo }]
// Si recibido=true y no hay SKU → crear producto en inventario
function recepcionarPedido({ pedidoId, recepciones, sucursal_id }) {
  const prodSvc = require('./products.service');
  const pedido  = findById(pedidoId);
  if (!pedido) throw new Error('Pedido no encontrado');

  let todosRecibidos = true;
  let algunoRecibido = false;

  for (const rec of recepciones) {
    const item = get(`SELECT * FROM pedido_items WHERE id=?`, [Number(rec.item_id)]);
    if (!item) continue;

    const cantRecibida = Number(rec.cantidad_recibida) || 0;
    const recibido     = rec.recibido ? 1 : 0;

    run(
      `UPDATE pedido_items SET cantidad_recibida=?, recibido=? WHERE id=?`,
      [cantRecibida, recibido, Number(rec.item_id)]
    );

    if (!recibido || cantRecibida <= 0) {
      todosRecibidos = false;
      continue;
    }

    algunoRecibido = true;

    if (item.sku) {
      // Producto existente → sumar stock y actualizar precios
      prodSvc.adjustStock(item.sku, cantRecibida, sucursal_id || null);
      const camposActualizar = {};
      if (rec.precio_costo !== undefined && Number(rec.precio_costo) > 0) {
        camposActualizar.price_cost = Number(rec.precio_costo);
      }
      if (rec.precio_venta !== undefined && Number(rec.precio_venta) > 0) {
        camposActualizar.price = Number(rec.precio_venta);
      }
      if (Object.keys(camposActualizar).length > 0) {
        prodSvc.updateBySku(item.sku, camposActualizar, sucursal_id || null);
      }
    } else if (rec.crear_producto && rec.producto_nuevo) {
      // Producto nuevo → crear en inventario
      const np = rec.producto_nuevo;
      try {
        prodSvc.create({
          sku:        np.sku        || `PROV-${Date.now()}`,
          name:       np.nombre     || item.nombre,
          price:      Number(np.precio_venta) || Number(rec.precio_venta) || 0,
          price_cost: Number(np.precio_costo) || Number(rec.precio_costo) || Number(item.precio_costo) || 0,
          stock:      cantRecibida,
          category:   np.categoria  || '',
          sucursal_id: sucursal_id  || 1,
        });
        // Actualizar el item con el nuevo SKU
        run(`UPDATE pedido_items SET sku=? WHERE id=?`, [np.sku || `PROV-${Date.now()}`, Number(rec.item_id)]);
      } catch(e) {
        console.error('Error creando producto:', e.message);
      }
    }
  }

  // Actualizar estado del pedido
  const estadoRecepcion = todosRecibidos ? 'recibido' : (algunoRecibido ? 'recibido_parcial' : 'enviado');
  run(
    `UPDATE pedidos SET estado_recepcion=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [estadoRecepcion, Number(pedidoId)]
  );

  return { ok: true, estado_recepcion: estadoRecepcion };
}

function countUrgentes() {
  const r = get(`SELECT COUNT(*) as n FROM pedidos WHERE estado='pendiente' AND prioridad='urgente'`);
  return r?.n || 0;
}

function countRecordatoriosHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  const r = get(`SELECT COUNT(*) as n FROM pedidos WHERE estado='pendiente' AND recordatorio<=?`, [hoy]);
  return r?.n || 0;
}

// ── Pagos parciales por pedido ────────────────────────────────
function getPagosPedido(pedidoId) {
  return all(
    `SELECT * FROM pedido_pagos WHERE pedido_id=? ORDER BY fecha ASC, id ASC`,
    [Number(pedidoId)]
  );
}

function registrarPagoPedido({ pedidoId, monto, fecha, metodo, nota }) {
  const p = findById(pedidoId);
  if (!p) throw new Error('Pedido no encontrado');
  if (!monto || Number(monto) <= 0) throw new Error('Monto inválido');
  const hoy = new Date().toISOString().split('T')[0];
  run(
    `INSERT INTO pedido_pagos (pedido_id, monto, fecha, metodo, nota) VALUES (?,?,?,?,?)`,
    [Number(pedidoId), Number(monto), fecha || hoy, metodo || null, nota || null]
  );
  // Calcular total pagado y actualizar estado del pedido
  const pagos  = getPagosPedido(pedidoId);
  const totalPagado = pagos.reduce((s, pg) => s + Number(pg.monto), 0);
  // Calcular total del pedido por sus ítems
  const items  = getItems(pedidoId);
  const totalPedido = items.reduce((s, i) => s + (Number(i.cantidad) * Number(i.precio_costo || 0)), 0);
  const estado = totalPagado >= totalPedido ? 'pagado' : 'parcial';
  run(
    `UPDATE pedidos SET pago_estado=?, pago_monto=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [estado, totalPagado, Number(pedidoId)]
  );
  return { pagos: getPagosPedido(pedidoId), totalPagado, totalPedido, estado };
}

function eliminarPagoPedido(pagoId) {
  const pg = get(`SELECT * FROM pedido_pagos WHERE id=?`, [Number(pagoId)]);
  if (!pg) throw new Error('Pago no encontrado');
  run(`DELETE FROM pedido_pagos WHERE id=?`, [Number(pagoId)]);
  // Recalcular estado del pedido
  const pagos = getPagosPedido(pg.pedido_id);
  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
  const items = getItems(pg.pedido_id);
  const totalPedido = items.reduce((s, i) => s + (Number(i.cantidad) * Number(i.precio_costo || 0)), 0);
  const estado = pagos.length === 0 ? null : totalPagado >= totalPedido ? 'pagado' : 'parcial';
  run(
    `UPDATE pedidos SET pago_estado=?, pago_monto=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [estado, totalPagado, Number(pg.pedido_id)]
  );
  return { ok: true };
}

// Mantener compatibilidad con la función anterior
function marcarPagoPedido({ pedidoId, pagado, pago_monto, pago_fecha, pago_metodo }) {
  if (pagado && pago_monto) {
    return registrarPagoPedido({ pedidoId, monto: pago_monto, fecha: pago_fecha, metodo: pago_metodo });
  } else {
    // Desmarcar — eliminar todos los pagos
    run(`DELETE FROM pedido_pagos WHERE pedido_id=?`, [Number(pedidoId)]);
    run(`UPDATE pedidos SET pago_estado=NULL, pago_monto=NULL WHERE id=?`, [Number(pedidoId)]);
    return findById(pedidoId);
  }
}

module.exports = {
  initPedidosSchema,
  list, findById, getItems, create, update, remove,
  enviarAProveedor, getPedidosByProveedor, recepcionarPedido,
  marcarPagoPedido, registrarPagoPedido, eliminarPagoPedido, getPagosPedido,
  countUrgentes, countRecordatoriosHoy,
};