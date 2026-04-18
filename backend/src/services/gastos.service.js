// src/services/gastos.service.js
const { get, all, run } = require('../db');

// ─────────────────────────────────────────────────────────────────────────────
// INIT — migración segura: sólo agrega lo que no existe
// ─────────────────────────────────────────────────────────────────────────────
function initGastosSchema() {
  run(`CREATE TABLE IF NOT EXISTS gastos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria    TEXT NOT NULL DEFAULT 'Otros',
    descripcion  TEXT NOT NULL,
    monto        REAL NOT NULL,
    fecha        TEXT NOT NULL DEFAULT (date('now','localtime')),
    proveedor_id INTEGER DEFAULT NULL,
    comprobante  TEXT,
    metodo_pago  TEXT,
    pagado       INTEGER NOT NULL DEFAULT 0,
    fecha_pago   TEXT,
    status       TEXT DEFAULT 'activo',
    sucursal_id  INTEGER DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  const safeAlter = (sql) => { try { run(sql); } catch(e) {} };
  safeAlter(`ALTER TABLE gastos ADD COLUMN metodo_pago    TEXT`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN pagado         INTEGER NOT NULL DEFAULT 0`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN fecha_pago     TEXT`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN status         TEXT DEFAULT 'activo'`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN sucursal_id    INTEGER DEFAULT 1`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN recurrente_id  INTEGER DEFAULT NULL`);

  run(`CREATE TABLE IF NOT EXISTS fondos_caja (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha       TEXT NOT NULL UNIQUE,
    monto       REAL NOT NULL DEFAULT 0,
    descripcion TEXT,
    sucursal_id INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS categorias_gasto (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    icono       TEXT NOT NULL DEFAULT 'bi-tag',
    color       TEXT NOT NULL DEFAULT '#6b7280',
    sucursal_id INTEGER DEFAULT 1,
    activa      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS gastos_recurrentes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria_id     INTEGER,
    categoria_nombre TEXT NOT NULL DEFAULT 'Otros',
    descripcion      TEXT NOT NULL,
    monto_estimado   REAL NOT NULL DEFAULT 0,
    dia_vencimiento  INTEGER NOT NULL DEFAULT 1,
    activo           INTEGER NOT NULL DEFAULT 1,
    sucursal_id      INTEGER DEFAULT 1,
    created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (categoria_id) REFERENCES categorias_gasto(id) ON DELETE SET NULL
  )`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS
// ─────────────────────────────────────────────────────────────────────────────
function getCategorias() {
  return all(`SELECT * FROM categorias_gasto WHERE activa = 1 ORDER BY nombre ASC`);
}
function getCategoriaById(id) {
  return get(`SELECT * FROM categorias_gasto WHERE id = ?`, [Number(id)]);
}
function createCategoria({ nombre, icono, color, sucursal_id }) {
  if (!nombre || !nombre.trim()) throw new Error('El nombre es obligatorio');
  const r = run(
    `INSERT INTO categorias_gasto (nombre, icono, color, sucursal_id) VALUES (?,?,?,?)`,
    [nombre.trim(), icono || 'bi-tag', color || '#6b7280', sucursal_id || 1]
  );
  return get(`SELECT * FROM categorias_gasto WHERE id = ?`, [r.lastInsertRowid]);
}
function updateCategoria(id, { nombre, icono, color }) {
  const c = getCategoriaById(id);
  if (!c) return null;
  run(
    `UPDATE categorias_gasto SET nombre=?, icono=?, color=? WHERE id=?`,
    [nombre ?? c.nombre, icono ?? c.icono, color ?? c.color, Number(id)]
  );
  return getCategoriaById(id);
}
function deleteCategoria(id) {
  run(`UPDATE categorias_gasto SET activa = 0 WHERE id = ?`, [Number(id)]);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GASTOS RECURRENTES
// ─────────────────────────────────────────────────────────────────────────────
function getRecurrentes() {
  return all(`
    SELECT r.*, c.color as cat_color, c.icono as cat_icono
    FROM gastos_recurrentes r
    LEFT JOIN categorias_gasto c ON c.id = r.categoria_id
    WHERE r.activo = 1
    ORDER BY r.dia_vencimiento ASC, r.descripcion ASC
  `);
}
function getRecurrenteById(id) {
  return get(`SELECT * FROM gastos_recurrentes WHERE id = ?`, [Number(id)]);
}
function createRecurrente({ categoria_id, categoria_nombre, descripcion, monto_estimado, dia_vencimiento, sucursal_id }) {
  if (!descripcion || !descripcion.trim()) throw new Error('La descripcion es obligatoria');
  if (!monto_estimado || isNaN(Number(monto_estimado))) throw new Error('El monto estimado es obligatorio');
  const dia = Number(dia_vencimiento);
  if (!dia || dia < 1 || dia > 31) throw new Error('Dia de vencimiento invalido (1-31)');
  let catNombre = categoria_nombre || 'Otros';
  if (categoria_id) {
    const cat = getCategoriaById(categoria_id);
    if (cat) catNombre = cat.nombre;
  }
  const r = run(
    `INSERT INTO gastos_recurrentes (categoria_id, categoria_nombre, descripcion, monto_estimado, dia_vencimiento, sucursal_id)
     VALUES (?,?,?,?,?,?)`,
    [categoria_id || null, catNombre, descripcion.trim(), Number(monto_estimado), dia, sucursal_id || 1]
  );
  return getRecurrenteById(r.lastInsertRowid);
}
function updateRecurrente(id, f) {
  const r = getRecurrenteById(id);
  if (!r) return null;
  let catNombre = f.categoria_nombre !== undefined ? f.categoria_nombre : r.categoria_nombre;
  if (f.categoria_id) {
    const cat = getCategoriaById(f.categoria_id);
    if (cat) catNombre = cat.nombre;
  }
  run(
    `UPDATE gastos_recurrentes SET categoria_id=?, categoria_nombre=?, descripcion=?, monto_estimado=?, dia_vencimiento=? WHERE id=?`,
    [
      f.categoria_id    !== undefined ? (f.categoria_id || null) : r.categoria_id,
      catNombre,
      f.descripcion     !== undefined ? f.descripcion     : r.descripcion,
      f.monto_estimado  !== undefined ? Number(f.monto_estimado) : r.monto_estimado,
      f.dia_vencimiento !== undefined ? Number(f.dia_vencimiento): r.dia_vencimiento,
      Number(id),
    ]
  );
  return getRecurrenteById(id);
}
function deleteRecurrente(id) {
  run(`UPDATE gastos_recurrentes SET activo = 0 WHERE id = ?`, [Number(id)]);
  return true;
}

function getGastoDelMes(recurrente_id, mes, anio) {
  const mesStr = `${anio}-${String(mes).padStart(2, '0')}`;
  return get(
    `SELECT * FROM gastos WHERE recurrente_id = ? AND strftime('%Y-%m', fecha) = ?`,
    [Number(recurrente_id), mesStr]
  ) || null;
}

function pagarRecurrenteMes({ recurrente_id, mes, anio, pagado, fecha_pago, metodo_pago }) {
  const m      = Number(mes);
  const a      = Number(anio);
  const mesStr = String(m).padStart(2, '0');
  let gasto = getGastoDelMes(recurrente_id, m, a);
  if (!gasto) {
    const p = getRecurrenteById(recurrente_id);
    if (!p) throw new Error('Plantilla no encontrada');
    const dia   = Math.min(p.dia_vencimiento, new Date(a, m, 0).getDate());
    const fecha = `${a}-${mesStr}-${String(dia).padStart(2, '0')}`;
    run(
      `INSERT INTO gastos (categoria, descripcion, monto, fecha, recurrente_id, pagado, sucursal_id) VALUES (?,?,?,?,?,0,?)`,
      [p.categoria_nombre, p.descripcion, p.monto_estimado, fecha, p.id, p.sucursal_id || 1]
    );
    gasto = get(`SELECT * FROM gastos WHERE recurrente_id = ? AND strftime('%Y-%m', fecha) = ?`,
      [Number(recurrente_id), `${a}-${mesStr}`]);
  }
  const hoy = new Date().toISOString().split('T')[0];
  run(
    `UPDATE gastos SET pagado=?, fecha_pago=?, metodo_pago=? WHERE id=?`,
    [pagado ? 1 : 0, pagado ? (fecha_pago || hoy) : null, metodo_pago || gasto.metodo_pago || null, gasto.id]
  );
  return get(`SELECT * FROM gastos WHERE id=?`, [gasto.id]);
}

function getRecurrentesConEstado(mes, anio) {
  const plantillas = getRecurrentes();
  return plantillas.map(p => {
    const gasto = getGastoDelMes(p.id, mes, anio);
    return {
      ...p,
      gasto_id:    gasto ? gasto.id    : null,
      gasto_monto: gasto ? gasto.monto : p.monto_estimado,
      pagado:      gasto ? !!gasto.pagado : false,
      fecha_pago:  gasto ? (gasto.fecha_pago  || null) : null,
      metodo_pago: gasto ? (gasto.metodo_pago || null) : null,
      generado:    !!gasto,
    };
  });
}

function generarGastosMes({ mes, anio } = {}) {
  const hoy    = new Date();
  const m      = mes  ? Number(mes)  : hoy.getMonth() + 1;
  const a      = anio ? Number(anio) : hoy.getFullYear();
  const mesStr = String(m).padStart(2, '0');
  const plantillas = getRecurrentes();
  let creados = 0;
  for (const p of plantillas) {
    const dia   = Math.min(p.dia_vencimiento, new Date(a, m, 0).getDate());
    const fecha = `${a}-${mesStr}-${String(dia).padStart(2, '0')}`;
    const existe = get(
      `SELECT id FROM gastos WHERE recurrente_id = ? AND strftime('%Y-%m', fecha) = ?`,
      [p.id, `${a}-${mesStr}`]
    );
    if (existe) continue;
    run(
      `INSERT INTO gastos (categoria, descripcion, monto, fecha, recurrente_id, pagado, sucursal_id) VALUES (?,?,?,?,?,0,?)`,
      [p.categoria_nombre, p.descripcion, p.monto_estimado, fecha, p.id, p.sucursal_id || 1]
    );
    creados++;
  }
  return creados;
}

// ─────────────────────────────────────────────────────────────────────────────
// GASTOS — originales intactos
// ─────────────────────────────────────────────────────────────────────────────
function list({ desde, hasta, categoria } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (desde)     { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta)     { where += ' AND fecha <= ?'; params.push(hasta); }
  if (categoria) { where += ' AND categoria = ?'; params.push(categoria); }
  return all(`
    SELECT g.*,
           COALESCE(g.metodo_pago,'')  as metodo_pago,
           COALESCE(g.pagado, 0)       as pagado,
           g.fecha_pago,
           p.nombre as proveedor_nombre
    FROM gastos g
    LEFT JOIN proveedores p ON p.id = g.proveedor_id
    ${where}
    ORDER BY fecha DESC, id DESC
  `, params);
}

function listAgrupado({ desde, hasta } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (desde) { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta) { where += ' AND fecha <= ?'; params.push(hasta); }
  const gastos = all(`
    SELECT g.*,
           COALESCE(g.metodo_pago,'') as metodo_pago,
           COALESCE(g.pagado, 0)      as pagado,
           g.fecha_pago,
           p.nombre as proveedor_nombre
    FROM gastos g
    LEFT JOIN proveedores p ON p.id = g.proveedor_id
    ${where}
    ORDER BY g.categoria ASC, g.fecha DESC, g.id DESC
  `, params);
  const grupos = {};
  for (const g of gastos) {
    const cat = g.categoria || 'Otros';
    if (!grupos[cat]) grupos[cat] = { categoria: cat, gastos: [], subtotal: 0, subtotal_pagado: 0, cantidad: 0 };
    grupos[cat].gastos.push(g);
    grupos[cat].subtotal        += Number(g.monto) || 0;
    grupos[cat].subtotal_pagado += g.pagado ? (Number(g.monto) || 0) : 0;
    grupos[cat].cantidad++;
  }
  return Object.values(grupos).sort((a, b) => b.subtotal - a.subtotal);
}

function getResumen({ desde, hasta } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (desde) { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta) { where += ' AND fecha <= ?'; params.push(hasta); }
  const total = get(`SELECT COALESCE(SUM(monto),0) as total FROM gastos ${where}`, params)?.total || 0;
  const porCategoria = all(`
    SELECT categoria, COUNT(*) as cantidad, SUM(monto) as total
    FROM gastos ${where}
    GROUP BY categoria ORDER BY total DESC
  `, params);
  return { total, porCategoria };
}

function create({ categoria, descripcion, monto, fecha, proveedor_id, comprobante, metodo_pago, pagado, fecha_pago, recurrente_id }) {
  const r = run(
    `INSERT INTO gastos (categoria, descripcion, monto, fecha, proveedor_id, comprobante, metodo_pago, pagado, fecha_pago, recurrente_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      categoria    || 'Otros',
      descripcion,
      Number(monto),
      fecha        || new Date().toISOString().split('T')[0],
      proveedor_id || null,
      comprobante  || null,
      metodo_pago  || null,
      pagado ? 1 : 0,
      pagado ? (fecha_pago || null) : null,
      recurrente_id || null,
    ]
  );
  return get(`SELECT * FROM gastos WHERE id=?`, [r.lastInsertRowid]);
}

function update(id, f) {
  const g = get(`SELECT * FROM gastos WHERE id=?`, [Number(id)]);
  if (!g) return null;
  run(
    `UPDATE gastos SET categoria=?, descripcion=?, monto=?, fecha=?, proveedor_id=?, comprobante=?, metodo_pago=?, pagado=?, fecha_pago=? WHERE id=?`,
    [
      f.categoria    ?? g.categoria,
      f.descripcion  ?? g.descripcion,
      f.monto        ?? g.monto,
      f.fecha        ?? g.fecha,
      f.proveedor_id ?? g.proveedor_id,
      f.comprobante  !== undefined ? (f.comprobante || null) : g.comprobante,
      f.metodo_pago  !== undefined ? (f.metodo_pago || null) : g.metodo_pago,
      f.pagado !== undefined ? (f.pagado ? 1 : 0) : (g.pagado || 0),
      f.pagado ? (f.fecha_pago || g.fecha_pago || null) : null,
      Number(id),
    ]
  );
  return get(`SELECT * FROM gastos WHERE id=?`, [Number(id)]);
}

function remove(id) { run(`DELETE FROM gastos WHERE id=?`, [Number(id)]); return true; }

// ─────────────────────────────────────────────────────────────────────────────
// FONDO — original intacto
// ─────────────────────────────────────────────────────────────────────────────
function getFondo(fecha) {
  const f = fecha || new Date().toISOString().split('T')[0];
  return get(`SELECT * FROM fondos_caja WHERE fecha = ?`, [f]) || null;
}
function setFondo({ fecha, monto, descripcion }) {
  const f = fecha || new Date().toISOString().split('T')[0];
  const existing = get(`SELECT id FROM fondos_caja WHERE fecha = ?`, [f]);
  if (existing) {
    run(`UPDATE fondos_caja SET monto=?, descripcion=? WHERE fecha=?`, [Number(monto), descripcion || null, f]);
  } else {
    run(`INSERT INTO fondos_caja (fecha, monto, descripcion) VALUES (?,?,?)`, [f, Number(monto), descripcion || null]);
  }
  return get(`SELECT * FROM fondos_caja WHERE fecha = ?`, [f]);
}
function getGastadoPagado({ desde, hasta } = {}) {
  // Filtra por fecha_pago (cuando realmente se pagó), no por fecha del gasto
  // Si fecha_pago es NULL pero está pagado, usa fecha como fallback
  let where = `WHERE pagado = 1`;
  const params = [];
  if (desde) { where += ' AND COALESCE(fecha_pago, fecha) >= ?'; params.push(desde); }
  if (hasta) { where += ' AND COALESCE(fecha_pago, fecha) <= ?'; params.push(hasta); }
  const r = get(`SELECT COALESCE(SUM(monto),0) as total FROM gastos ${where}`, params);
  return r?.total || 0;
}
function getResumenCompleto({ desde, hasta } = {}) {
  const fondo   = getFondo(desde || new Date().toISOString().split('T')[0]);
  const gastado = getGastadoPagado({ desde, hasta });
  const { total, porCategoria } = getResumen({ desde, hasta });
  return {
    fondo,
    montoFondo:      fondo ? fondo.monto : 0,
    gastadoPagado:   gastado,
    restante:        fondo ? Math.max(fondo.monto - gastado, 0) : null,
    porcentajeUsado: fondo && fondo.monto > 0 ? Math.min(Math.round((gastado / fondo.monto) * 100), 100) : null,
    total,
    porCategoria,
  };
}

module.exports = {
  initGastosSchema,
  getCategorias, getCategoriaById, createCategoria, updateCategoria, deleteCategoria,
  getRecurrentes, getRecurrenteById, createRecurrente, updateRecurrente, deleteRecurrente, generarGastosMes,
  getGastoDelMes, pagarRecurrenteMes, getRecurrentesConEstado,
  list, listAgrupado, getResumen, getResumenCompleto, create, update, remove,
  getFondo, setFondo, getGastadoPagado,
};