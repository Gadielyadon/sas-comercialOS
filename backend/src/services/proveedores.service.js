// src/services/proveedores.service.js
const { get, all, run } = require('../db');

function initProveedoresSchema() {
  run(`CREATE TABLE IF NOT EXISTS proveedores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre     TEXT NOT NULL,
    cuit       TEXT,
    telefono   TEXT,
    email      TEXT,
    rubro      TEXT,
    notas      TEXT,
    saldo      REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS proveedores_movimientos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id INTEGER NOT NULL,
    tipo         TEXT NOT NULL CHECK(tipo IN ('factura','pago','nota')),
    descripcion  TEXT NOT NULL DEFAULT '',
    nro_factura  TEXT,
    monto        REAL NOT NULL,
    saldo_post   REAL NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
  )`);
}

function list()       { return all(`SELECT * FROM proveedores ORDER BY nombre ASC`); }
function findById(id) { return get(`SELECT * FROM proveedores WHERE id=?`, [Number(id)]); }

function search(q) {
  const t = `%${q}%`;
  return all(
    `SELECT * FROM proveedores WHERE nombre LIKE ? OR cuit LIKE ? OR rubro LIKE ? ORDER BY nombre ASC`,
    [t, t, t]
  );
}

function create({ nombre, cuit, telefono, email, rubro, notas }) {
  const r = run(
    `INSERT INTO proveedores (nombre,cuit,telefono,email,rubro,notas) VALUES (?,?,?,?,?,?)`,
    [nombre, cuit || null, telefono || null, email || null, rubro || null, notas || null]
  );
  return findById(r.lastInsertRowid);
}

function update(id, f) {
  const p = findById(id);
  if (!p) return null;
  run(
    `UPDATE proveedores SET nombre=?,cuit=?,telefono=?,email=?,rubro=?,notas=? WHERE id=?`,
    [f.nombre ?? p.nombre, f.cuit ?? p.cuit, f.telefono ?? p.telefono,
     f.email ?? p.email, f.rubro ?? p.rubro, f.notas ?? p.notas, Number(id)]
  );
  return findById(id);
}

function remove(id) {
  run(`DELETE FROM proveedores_movimientos WHERE proveedor_id=?`, [Number(id)]);
  run(`DELETE FROM proveedores WHERE id=?`, [Number(id)]);
  return true;
}

function getMovimientos(proveedorId) {
  return all(
    `SELECT * FROM proveedores_movimientos WHERE proveedor_id=? ORDER BY created_at DESC`,
    [Number(proveedorId)]
  );
}

function registrarFactura(proveedorId, monto, descripcion = 'Factura', nro_factura = null) {
  const p = findById(proveedorId);
  if (!p) throw new Error('No encontrado');
  const nuevoSaldo = (p.saldo || 0) + Number(monto);
  run(`UPDATE proveedores SET saldo=? WHERE id=?`, [nuevoSaldo, Number(proveedorId)]);
  run(
    `INSERT INTO proveedores_movimientos (proveedor_id,tipo,descripcion,nro_factura,monto,saldo_post) VALUES (?,?,?,?,?,?)`,
    [Number(proveedorId), 'factura', descripcion, nro_factura || null, Number(monto), nuevoSaldo]
  );
  return findById(proveedorId);
}

function registrarPago(proveedorId, monto, descripcion = 'Pago') {
  const p = findById(proveedorId);
  if (!p) throw new Error('No encontrado');
  // El saldo nunca puede quedar negativo — si el pago supera la deuda, solo se descuenta hasta 0
  const saldoActual = Number(p.saldo) || 0;
  const montoReal   = Math.min(Number(monto), saldoActual); // no bajar de 0
  const nuevoSaldo  = Math.max(0, saldoActual - Number(monto)); // piso en 0
  run(`UPDATE proveedores SET saldo=? WHERE id=?`, [nuevoSaldo, Number(proveedorId)]);
  run(
    `INSERT INTO proveedores_movimientos (proveedor_id,tipo,descripcion,monto,saldo_post) VALUES (?,?,?,?,?)`,
    [Number(proveedorId), 'pago', descripcion, montoReal, nuevoSaldo]
  );
  return findById(proveedorId);
}

// ── Recepción de mercadería ───────────────────────────────────
function initRecepcionSchema() {
  const { run: dbRun } = require('../db');
  try {
    dbRun(`CREATE TABLE IF NOT EXISTS recepciones_mercaderia (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER NOT NULL,
      nro_factura  TEXT,
      descripcion  TEXT,
      total        REAL NOT NULL DEFAULT 0,
      sucursal_id  INTEGER DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    )`);
    dbRun(`CREATE TABLE IF NOT EXISTS recepcion_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      recepcion_id     INTEGER NOT NULL,
      sku              TEXT NOT NULL,
      nombre           TEXT NOT NULL,
      cantidad         REAL NOT NULL DEFAULT 1,
      precio_costo     REAL NOT NULL DEFAULT 0,
      actualizar_costo INTEGER NOT NULL DEFAULT 0,
      subtotal         REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (recepcion_id) REFERENCES recepciones_mercaderia(id) ON DELETE CASCADE
    )`);
  } catch(e) {}
}

function getRecepciones(proveedorId) {
  return all(
    `SELECT r.*, COUNT(i.id) as cant_items
     FROM recepciones_mercaderia r
     LEFT JOIN recepcion_items i ON i.recepcion_id = r.id
     WHERE r.proveedor_id = ?
     GROUP BY r.id ORDER BY r.created_at DESC`,
    [Number(proveedorId)]
  );
}

function recibirMercaderia({ proveedor_id, nro_factura, descripcion, items, sucursal_id }) {
  const prodSvc = require('./products.service');
  if (!items || !items.length) throw new Error('Ingresá al menos un producto');

  const total = items.reduce((s, i) => s + (Number(i.cantidad) * Number(i.precio_costo)), 0);

  const res = run(
    `INSERT INTO recepciones_mercaderia (proveedor_id, nro_factura, descripcion, total, sucursal_id)
     VALUES (?,?,?,?,?)`,
    [Number(proveedor_id), nro_factura || null, descripcion || null, total, sucursal_id || 1]
  );
  const recepcionId = res.lastInsertRowid;

  for (const item of items) {
    const cant  = Number(item.cantidad)     || 0;
    const costo = Number(item.precio_costo) || 0;
    const sub   = cant * costo;
    const actC  = item.actualizar_costo ? 1 : 0;

    run(
      `INSERT INTO recepcion_items (recepcion_id, sku, nombre, cantidad, precio_costo, actualizar_costo, subtotal)
       VALUES (?,?,?,?,?,?,?)`,
      [recepcionId, String(item.sku), String(item.nombre), cant, costo, actC, sub]
    );

    // Sumar stock
    prodSvc.adjustStock(item.sku, cant, sucursal_id || null);

    // Actualizar precio de costo si el usuario lo marcó
    if (actC && costo > 0) {
      prodSvc.updateBySku(item.sku, { price_cost: costo }, sucursal_id || null);
    }
  }

  // Registrar como factura en la cuenta corriente
  const desc = descripcion || (nro_factura ? `Factura ${nro_factura}` : 'Recepción de mercadería');
  registrarFactura(proveedor_id, total, desc, nro_factura || null);

  return { recepcion_id: recepcionId, total, items_procesados: items.length };
}

// ── Métricas globales de proveedores ─────────────────────────
function getMetricas() {
  const provs = list();
  const movs  = all(`SELECT pm.*, p.nombre as prov_nombre
    FROM proveedores_movimientos pm
    JOIN proveedores p ON p.id = pm.proveedor_id
    ORDER BY pm.created_at DESC`);

  const totalDeuda     = provs.reduce((s,p) => s + Math.max(Number(p.saldo)||0, 0), 0);
  const conDeuda       = provs.filter(p => Number(p.saldo) > 0);
  const totalFacturado = movs.filter(m=>m.tipo==='factura').reduce((s,m)=>s+Number(m.monto),0);
  const totalPagado    = movs.filter(m=>m.tipo==='pago').   reduce((s,m)=>s+Number(m.monto),0);

  const hace30 = new Date(); hace30.setDate(hace30.getDate()-30);
  const h30str = hace30.toISOString().replace('T',' ').slice(0,10);
  const movsRec    = movs.filter(m => (m.created_at||'') >= h30str);
  const facturado30= movsRec.filter(m=>m.tipo==='factura').reduce((s,m)=>s+Number(m.monto),0);
  const pagado30   = movsRec.filter(m=>m.tipo==='pago').   reduce((s,m)=>s+Number(m.monto),0);

  return {
    totalProveedores: provs.length,
    conDeuda:         conDeuda.length,
    alDia:            provs.length - conDeuda.length,
    totalDeuda, totalFacturado, totalPagado,
    facturado30, pagado30,
    movimientos: movs.slice(0,20),
  };
}

module.exports = {
  initProveedoresSchema, initRecepcionSchema,
  list, findById, search,
  create, update, remove, getMovimientos,
  registrarFactura, registrarPago,
  recibirMercaderia, getRecepciones,
  getMetricas,
};