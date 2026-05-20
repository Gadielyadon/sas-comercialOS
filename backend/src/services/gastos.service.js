// src/services/gastos.service.js
const { get, all, run } = require('../db');

// ─────────────────────────────────────────────────────────────────────────────
// INIT — migración segura: sólo agrega lo que no existe
// ─────────────────────────────────────────────────────────────────────────────
function initGastosSchema() {
  // Tabla principal de gastos (compatible hacia atrás)
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
    recurrente_id INTEGER DEFAULT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  const safeAlter = (sql) => { try { run(sql); } catch(e) {} };
  safeAlter(`ALTER TABLE gastos ADD COLUMN metodo_pago    TEXT`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN pagado         INTEGER NOT NULL DEFAULT 0`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN fecha_pago     TEXT`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN status         TEXT DEFAULT 'activo'`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN sucursal_id    INTEGER DEFAULT 1`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN recurrente_id  INTEGER DEFAULT NULL`);
  // Columna para registrar de qué mes/año es este gasto generado
  safeAlter(`ALTER TABLE gastos ADD COLUMN mes_origen      TEXT DEFAULT NULL`);
  safeAlter(`ALTER TABLE gastos ADD COLUMN monto_arrastre  REAL DEFAULT 0`);  // monto arrastrado del mes anterior, guardado al generar

  // Fondos — se mantiene para no romper datos existentes pero ya no se usa en UI
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

  // Columnas nuevas — migracion segura
  safeAlter(`ALTER TABLE gastos_recurrentes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'fijo'`); // 'fijo' | 'extraordinario'
  safeAlter(`ALTER TABLE gastos_recurrentes ADD COLUMN cuotas_total INTEGER DEFAULT NULL`); // ej: 12
  safeAlter(`ALTER TABLE gastos_recurrentes ADD COLUMN cuota_actual INTEGER DEFAULT 0`);    // contador interno
  safeAlter(`ALTER TABLE gastos_recurrentes ADD COLUMN fecha_fin TEXT DEFAULT NULL`);       // ej: '2026-12'
  safeAlter(`ALTER TABLE gastos_recurrentes ADD COLUMN notas TEXT DEFAULT NULL`);           // nota general

  // Tabla de pagos parciales por gasto mensual
  run(`CREATE TABLE IF NOT EXISTS gasto_pagos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    gasto_id   INTEGER NOT NULL,
    monto      REAL NOT NULL,
    fecha      TEXT NOT NULL,
    metodo     TEXT,
    nota       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (gasto_id) REFERENCES gastos(id) ON DELETE CASCADE
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
// GASTOS RECURRENTES (plantillas)
// ─────────────────────────────────────────────────────────────────────────────
function getRecurrentes() {
  return all(`
    SELECT r.*, c.color as cat_color, c.icono as cat_icono
    FROM gastos_recurrentes r
    LEFT JOIN categorias_gasto c ON c.id = r.categoria_id
    WHERE r.activo = 1
    ORDER BY r.categoria_nombre ASC, r.descripcion ASC
  `);
}
function getRecurrenteById(id) {
  return get(`SELECT * FROM gastos_recurrentes WHERE id = ?`, [Number(id)]);
}
function createRecurrente({ categoria_id, categoria_nombre, descripcion, monto_estimado, dia_vencimiento, sucursal_id, tipo, cuotas_total, fecha_fin, notas }) {
  if (!descripcion || !descripcion.trim()) throw new Error('La descripcion es obligatoria');
  if (!monto_estimado || isNaN(Number(monto_estimado))) throw new Error('El monto estimado es obligatorio');
  const dia = Number(dia_vencimiento);
  if (!dia || dia < 1 || dia > 31) throw new Error('Dia de vencimiento invalido (1-31)');
  let catNombre = categoria_nombre || 'Otros';
  if (categoria_id) {
    const cat = getCategoriaById(categoria_id);
    if (cat) catNombre = cat.nombre;
  }
  const tipoVal = tipo === 'extraordinario' ? 'extraordinario' : 'fijo';
  const r = run(
    `INSERT INTO gastos_recurrentes (categoria_id, categoria_nombre, descripcion, monto_estimado, dia_vencimiento, sucursal_id, tipo, cuotas_total, cuota_actual, fecha_fin, notas)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [categoria_id || null, catNombre, descripcion.trim(), Number(monto_estimado), dia, sucursal_id || 1,
     tipoVal, cuotas_total ? Number(cuotas_total) : null, 0, fecha_fin || null, notas || null]
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
    `UPDATE gastos_recurrentes SET categoria_id=?, categoria_nombre=?, descripcion=?, monto_estimado=?, dia_vencimiento=?, tipo=?, cuotas_total=?, fecha_fin=?, notas=? WHERE id=?`,
    [
      f.categoria_id    !== undefined ? (f.categoria_id || null) : r.categoria_id,
      catNombre,
      f.descripcion     !== undefined ? f.descripcion     : r.descripcion,
      f.monto_estimado  !== undefined ? Number(f.monto_estimado) : r.monto_estimado,
      f.dia_vencimiento !== undefined ? Number(f.dia_vencimiento): r.dia_vencimiento,
      f.tipo            !== undefined ? f.tipo             : (r.tipo || 'fijo'),
      f.cuotas_total    !== undefined ? (f.cuotas_total ? Number(f.cuotas_total) : null) : r.cuotas_total,
      f.fecha_fin       !== undefined ? (f.fecha_fin || null)    : r.fecha_fin,
      f.notas           !== undefined ? (f.notas || null)        : r.notas,
      Number(id),
    ]
  );
  return getRecurrenteById(id);
}
function deleteRecurrente(id) {
  run(`UPDATE gastos_recurrentes SET activo = 0 WHERE id = ?`, [Number(id)]);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// LÓGICA MENSUAL — generar, estado y arrastre
// ─────────────────────────────────────────────────────────────────────────────
function mesStr(m, a) {
  return `${a}-${String(m).padStart(2, '0')}`;
}

function getGastoDelMes(recurrente_id, mes, anio) {
  return get(
    `SELECT * FROM gastos WHERE recurrente_id = ? AND mes_origen = ?`,
    [Number(recurrente_id), mesStr(mes, anio)]
  ) || null;
}

// Genera los gastos del mes si no existen.
// Si el gasto del mes anterior quedó pendiente, suma ese monto al nuevo.
function generarGastosMes({ mes, anio } = {}) {
  const hoy    = new Date();
  const m      = mes  ? Number(mes)  : hoy.getMonth() + 1;
  const a      = anio ? Number(anio) : hoy.getFullYear();
  const ms     = mesStr(m, a);

  // Mes anterior para arrastre
  const mPrev  = m === 1 ? 12 : m - 1;
  const aPrev  = m === 1 ? a - 1 : a;
  const msPrev = mesStr(mPrev, aPrev);

  const plantillas = getRecurrentes();
  let creados = 0;

  for (const p of plantillas) {
    // ── Verificar si este gasto ya expiró ────────────────────────
    // Por fecha de corte
    if (p.fecha_fin) {
      const [fAnio, fMes] = p.fecha_fin.split('-').map(Number);
      if (a > fAnio || (a === fAnio && m > fMes)) continue;
    }
    // Por cuotas completadas
    if (p.cuotas_total && Number(p.cuota_actual || 0) >= Number(p.cuotas_total)) continue;
    // Extraordinario: solo genera en el mes de creación (cuotas_total=1 implícito si tipo=extraordinario)
    if (p.tipo === 'extraordinario' && !p.cuotas_total) {
      const creadoMs = (p.created_at || '').slice(0, 7); // 'YYYY-MM'
      if (creadoMs !== ms) continue;
    }
    const dia   = Math.min(p.dia_vencimiento, new Date(a, m, 0).getDate());
    const fecha = `${a}-${String(m).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;

    // Buscar arrastre del mes anterior (solo si ese mes sigue pendiente)
    const gastoPrev = get(
      `SELECT * FROM gastos WHERE recurrente_id = ? AND mes_origen = ? AND pagado = 0`,
      [p.id, msPrev]
    );
    const montoArrastre = gastoPrev ? Number(gastoPrev.monto) : 0;
    const montoNuevo    = Number(p.monto_estimado) + montoArrastre;

    const existe = get(
      `SELECT * FROM gastos WHERE recurrente_id = ? AND mes_origen = ?`,
      [p.id, ms]
    );

    if (!existe) {
      // Crear el registro del mes
      run(
        `INSERT INTO gastos (categoria, descripcion, monto, monto_arrastre, fecha, recurrente_id, pagado, sucursal_id, mes_origen)
         VALUES (?,?,?,?,?,?,0,?,?)`,
        [p.categoria_nombre, p.descripcion, montoNuevo, montoArrastre, fecha, p.id, p.sucursal_id || 1, ms]
      );
      // Incrementar contador de cuotas si aplica
      if (p.cuotas_total) {
        run(`UPDATE gastos_recurrentes SET cuota_actual = cuota_actual + 1 WHERE id = ?`, [p.id]);
      }
      creados++;
    } else if (!existe.pagado) {
      // Ya existe y está pendiente → actualizar monto y arrastre por si
      // cambió el estimado o el arrastre desde que se generó
      const montoActual    = Number(existe.monto);
      const arrastreActual = Number(existe.monto_arrastre || 0);
      if (montoActual !== montoNuevo || arrastreActual !== montoArrastre) {
        run(
          `UPDATE gastos SET monto=?, monto_arrastre=? WHERE id=?`,
          [montoNuevo, montoArrastre, existe.id]
        );
      }
    }
    // Si está pagado: no tocar nada
  }
  return creados;
}

// Devuelve las plantillas con el estado del mes solicitado.
// Si no hay gasto generado para ese mes, lo genera al vuelo.
function getRecurrentesConEstado(mes, anio) {
  // Asegurar que los gastos del mes están generados
  generarGastosMes({ mes, anio });

  const plantillas = getRecurrentes();
  const ms = mesStr(mes, anio);

  // Mes anterior para mostrar info de arrastre
  const mPrev  = Number(mes) === 1 ? 12 : Number(mes) - 1;
  const aPrev  = Number(mes) === 1 ? Number(anio) - 1 : Number(anio);
  const msPrev = mesStr(mPrev, aPrev);

  return plantillas.map(p => {
    const gasto = get(`SELECT * FROM gastos WHERE recurrente_id = ? AND mes_origen = ?`, [p.id, ms]);

    // monto_base = estimado actual de la plantilla (siempre fresco)
    const montoBase = Number(p.monto_estimado);

    // Si el gasto ya está pagado, no hay arrastre que mostrar
    // Si está pendiente, leer el arrastre de la columna guardada
    let montoArrastre = 0;
    if (gasto && !gasto.pagado) {
      montoArrastre = Number(gasto.monto_arrastre || 0);
      // Fallback para filas viejas sin la columna
      if (!montoArrastre) {
        const gastoPrev = get(
          `SELECT * FROM gastos WHERE recurrente_id = ? AND mes_origen = ? AND pagado = 0`,
          [p.id, msPrev]
        );
        montoArrastre = gastoPrev ? Number(gastoPrev.monto) : 0;
      }
    }

    // gasto_monto = lo que hay que pagar en total (base + arrastre si pendiente)
    const gastoMonto = gasto
      ? (gasto.pagado ? Number(gasto.monto) : montoBase + montoArrastre)
      : (montoBase + montoArrastre);

    return {
      ...p,
      gasto_id:         gasto ? gasto.id    : null,
      gasto_monto:      gastoMonto,           // total a pagar (base + arrastre)
      monto_base:       montoBase,            // solo este mes (monto_estimado actual)
      monto_arrastre:   montoArrastre,        // deuda del mes anterior
      tiene_arrastre:   montoArrastre > 0,
      mes_arrastre:     montoArrastre > 0 ? mPrev : null,
      anio_arrastre:    montoArrastre > 0 ? aPrev : null,
      pagado:           gasto ? !!gasto.pagado     : false,
      fecha_pago:       gasto ? (gasto.fecha_pago  || null) : null,
      metodo_pago:      gasto ? (gasto.metodo_pago || null) : null,
      generado:         !!gasto,
    };
  });
}

// Marcar pagado / pendiente y permitir editar el monto real
// pagar_todo: true  → cierra también el mes anterior con arrastre
// pagar_todo: false → solo paga el mes actual, el arrastre sigue pendiente
function pagarRecurrenteMes({ recurrente_id, mes, anio, pagado, fecha_pago, metodo_pago, monto_real, pagar_todo }) {
  const m  = Number(mes);
  const a  = Number(anio);
  const ms = mesStr(m, a);

  // Asegurar que existe el registro del mes (y que tiene monto actualizado)
  generarGastosMes({ mes: m, anio: a });

  // Re-leer después de generarGastosMes para tener los valores frescos
  let gasto = get(`SELECT * FROM gastos WHERE recurrente_id = ? AND mes_origen = ?`, [Number(recurrente_id), ms]);
  if (!gasto) throw new Error('No se pudo generar el gasto del mes');

  const hoy = new Date().toISOString().split('T')[0];

  // Leer el arrastre directo de la columna guardada — es la fuente de verdad
  // ya que generarGastosMes lo actualizó si cambió
  const montoArrastre = Number(gasto.monto_arrastre || 0);

  // Obtener el estimado actual de la plantilla
  const plantilla     = getRecurrenteById(Number(recurrente_id));
  const montoEstimado = plantilla ? Number(plantilla.monto_estimado) : Number(gasto.monto) - montoArrastre;

  // Monto a registrar según la elección:
  // - monto_real: si el usuario editó manualmente
  // - solo este mes: solo el estimado actual sin arrastre
  // - pagar todo o sin arrastre: estimado + arrastre
  let nuevoMonto;
  if (monto_real !== undefined) {
    nuevoMonto = Number(monto_real);
  } else if (pagado && !pagar_todo && montoArrastre > 0) {
    nuevoMonto = montoEstimado;
  } else {
    nuevoMonto = montoEstimado + (pagar_todo ? montoArrastre : 0);
  }

  run(
    `UPDATE gastos SET pagado=?, fecha_pago=?, metodo_pago=?, monto=? WHERE id=?`,
    [
      pagado ? 1 : 0,
      pagado ? (fecha_pago || hoy) : null,
      metodo_pago || gasto.metodo_pago || null,
      nuevoMonto,
      gasto.id,
    ]
  );

  // Si eligió "Pagar todo" → cerrar también el registro del mes anterior
  // Buscamos por mes_origen directo para no depender del monto
  if (pagado && pagar_todo && montoArrastre > 0) {
    const mPrev  = m === 1 ? 12 : m - 1;
    const aPrev  = m === 1 ? a - 1 : a;
    const msPrev = mesStr(mPrev, aPrev);
    // Cerrar TODOS los registros pendientes del mes anterior para este recurrente
    // (por si hubo más de un arrastre acumulado)
    run(
      `UPDATE gastos SET pagado=1, fecha_pago=?, metodo_pago=?
       WHERE recurrente_id=? AND mes_origen=? AND pagado=0`,
      [fecha_pago || hoy, metodo_pago || null, Number(recurrente_id), msPrev]
    );
  }

  return get(`SELECT * FROM gastos WHERE id=?`, [gasto.id]);
}

// ─────────────────────────────────────────────────────────────────────────────
// RESUMEN MENSUAL para dashboard
// ─────────────────────────────────────────────────────────────────────────────
function getResumenMes(mes, anio) {
  const ms = mesStr(mes, anio);
  const rows = all(
    `SELECT g.*, r.categoria_nombre as cat
     FROM gastos g
     JOIN gastos_recurrentes r ON r.id = g.recurrente_id
     WHERE g.mes_origen = ?
     ORDER BY r.categoria_nombre ASC, r.descripcion ASC`,
    [ms]
  );
  const total         = rows.reduce((s, g) => s + Number(g.monto), 0);
  const totalPagado   = rows.filter(g => g.pagado).reduce((s, g) => s + Number(g.monto), 0);
  const totalPendiente= total - totalPagado;
  const cantPendiente = rows.filter(g => !g.pagado).length;

  // Agrupar por categoría
  const grupos = {};
  for (const g of rows) {
    const cat = g.categoria || 'Otros';
    if (!grupos[cat]) grupos[cat] = { categoria: cat, items: [], total: 0, pagado: 0 };
    grupos[cat].items.push(g);
    grupos[cat].total  += Number(g.monto);
    grupos[cat].pagado += g.pagado ? Number(g.monto) : 0;
  }

  return {
    total, totalPagado, totalPendiente, cantPendiente,
    grupos: Object.values(grupos).sort((a, b) => a.categoria.localeCompare(b.categoria)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES LEGACY — se mantienen para no romper dashboard ni historial
// ─────────────────────────────────────────────────────────────────────────────
function list({ desde, hasta, categoria } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (desde)     { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta)     { where += ' AND fecha <= ?'; params.push(hasta); }
  if (categoria) { where += ' AND categoria = ?'; params.push(categoria); }
  return all(`SELECT * FROM gastos ${where} ORDER BY fecha DESC, id DESC`, params);
}
function getResumen({ desde, hasta } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (desde) { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta) { where += ' AND fecha <= ?'; params.push(hasta); }
  const total = get(`SELECT COALESCE(SUM(monto),0) as total FROM gastos ${where}`, params)?.total || 0;
  const porCategoria = all(
    `SELECT categoria, COUNT(*) as cantidad, SUM(monto) as total FROM gastos ${where} GROUP BY categoria ORDER BY total DESC`,
    params
  );
  return { total, porCategoria };
}
function getGastadoPagado({ desde, hasta } = {}) {
  let where = `WHERE pagado = 1`;
  const params = [];
  if (desde) { where += ' AND COALESCE(fecha_pago, fecha) >= ?'; params.push(desde); }
  if (hasta) { where += ' AND COALESCE(fecha_pago, fecha) <= ?'; params.push(hasta); }
  return get(`SELECT COALESCE(SUM(monto),0) as total FROM gastos ${where}`, params)?.total || 0;
}
// Fondo — se mantiene pero no se expone en UI nueva
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
function create(f) {
  const r = run(
    `INSERT INTO gastos (categoria, descripcion, monto, fecha, proveedor_id, comprobante, metodo_pago, pagado, fecha_pago, recurrente_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [f.categoria||'Otros', f.descripcion, Number(f.monto),
     f.fecha||new Date().toISOString().split('T')[0],
     f.proveedor_id||null, f.comprobante||null, f.metodo_pago||null,
     f.pagado?1:0, f.pagado?(f.fecha_pago||null):null, f.recurrente_id||null]
  );
  return get(`SELECT * FROM gastos WHERE id=?`, [r.lastInsertRowid]);
}
function update(id, f) {
  const g = get(`SELECT * FROM gastos WHERE id=?`, [Number(id)]);
  if (!g) return null;
  run(
    `UPDATE gastos SET categoria=?, descripcion=?, monto=?, fecha=?, metodo_pago=?, pagado=?, fecha_pago=? WHERE id=?`,
    [
      f.categoria   ?? g.categoria,
      f.descripcion ?? g.descripcion,
      f.monto       ?? g.monto,
      f.fecha       ?? g.fecha,
      f.metodo_pago !== undefined ? (f.metodo_pago||null) : g.metodo_pago,
      f.pagado !== undefined ? (f.pagado?1:0) : (g.pagado||0),
      f.pagado ? (f.fecha_pago||g.fecha_pago||null) : null,
      Number(id),
    ]
  );
  return get(`SELECT * FROM gastos WHERE id=?`, [Number(id)]);
}
function remove(id) { run(`DELETE FROM gastos WHERE id=?`, [Number(id)]); return true; }

function getResumenCompleto({ desde, hasta } = {}) {
  const fondo   = getFondo(desde || new Date().toISOString().split('T')[0]);
  const gastado = getGastadoPagado({ desde, hasta });
  const { total, porCategoria } = getResumen({ desde, hasta });
  return { fondo, montoFondo: fondo?fondo.monto:0, gastadoPagado:gastado,
    restante: fondo?Math.max(fondo.monto-gastado,0):null,
    porcentajeUsado: fondo&&fondo.monto>0?Math.min(Math.round((gastado/fondo.monto)*100),100):null,
    total, porCategoria };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGOS PARCIALES POR GASTO MENSUAL
// ─────────────────────────────────────────────────────────────────────────────
function getPagosGasto(gastoId) {
  return all(
    `SELECT * FROM gasto_pagos WHERE gasto_id = ? ORDER BY fecha ASC, id ASC`,
    [Number(gastoId)]
  );
}

function registrarPagoGasto({ gastoId, monto, fecha, metodo, nota }) {
  const g = get(`SELECT * FROM gastos WHERE id = ?`, [Number(gastoId)]);
  if (!g) throw new Error('Gasto no encontrado');
  if (!monto || Number(monto) <= 0) throw new Error('Monto inválido');
  const hoy = new Date().toISOString().split('T')[0];
  run(
    `INSERT INTO gasto_pagos (gasto_id, monto, fecha, metodo, nota) VALUES (?,?,?,?,?)`,
    [Number(gastoId), Number(monto), fecha || hoy, metodo || null, nota || null]
  );
  // Recalcular estado del gasto
  const pagos = getPagosGasto(gastoId);
  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
  const totalGasto  = Number(g.monto);
  if (totalPagado >= totalGasto) {
    // Marcar como pagado
    run(
      `UPDATE gastos SET pagado=1, fecha_pago=?, metodo_pago=? WHERE id=?`,
      [fecha || hoy, metodo || null, Number(gastoId)]
    );
  }
  return { pagos: getPagosGasto(gastoId), totalPagado, totalGasto, pendiente: Math.max(0, totalGasto - totalPagado) };
}

function eliminarPagoGasto(pagoId) {
  const pg = get(`SELECT * FROM gasto_pagos WHERE id = ?`, [Number(pagoId)]);
  if (!pg) throw new Error('Pago no encontrado');
  run(`DELETE FROM gasto_pagos WHERE id = ?`, [Number(pagoId)]);
  // Si el gasto estaba marcado pagado, revisar si hay que desmarcarlo
  const pagos = getPagosGasto(pg.gasto_id);
  const g     = get(`SELECT * FROM gastos WHERE id = ?`, [pg.gasto_id]);
  if (g && g.pagado) {
    const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
    if (totalPagado < Number(g.monto)) {
      run(`UPDATE gastos SET pagado=0, fecha_pago=NULL WHERE id=?`, [pg.gasto_id]);
    }
  }
  return { ok: true };
}

function getPagosResumen(gastoId) {
  const g     = get(`SELECT * FROM gastos WHERE id = ?`, [Number(gastoId)]);
  if (!g) throw new Error('Gasto no encontrado');
  const pagos = getPagosGasto(gastoId);
  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
  return {
    pagos,
    total:     Number(g.monto),
    pagado:    totalPagado,
    pendiente: Math.max(0, Number(g.monto) - totalPagado),
  };
}

module.exports = {
  initGastosSchema,
  getCategorias, getCategoriaById, createCategoria, updateCategoria, deleteCategoria,
  getRecurrentes, getRecurrenteById, createRecurrente, updateRecurrente, deleteRecurrente,
  generarGastosMes, getGastoDelMes, pagarRecurrenteMes, getRecurrentesConEstado,
  getResumenMes,
  getPagosGasto, registrarPagoGasto, eliminarPagoGasto, getPagosResumen,
  list, getResumen, getResumenCompleto, getGastadoPagado,
  getFondo, setFondo, create, update, remove,
};