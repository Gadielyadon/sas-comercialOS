// src/services/importar.service.js
// ---------------------------------------------------------------
// Importación de Ventas y Gastos desde CUALQUIER Excel, mediante
// mapeo manual de columnas (el sistema sugiere, el usuario confirma).
// Flujo en 3 pasos:
//   1) analizarArchivo(base64) → hojas + encabezados + muestra (para armar el mapeo)
//   2) previsualizar({ base64, hoja, tipo, mapeo }, sucursal_id) → resumen, NO escribe nada
//   3) confirmar({ base64, hoja, tipo, mapeo }, { sucursal_id, usuario }) → inserta de verdad
// ---------------------------------------------------------------
const XLSX = require('xlsx');
const { all, get, run } = require('../db');

const CATEGORIA_DEFAULT_ICONO = 'bi-tag';
const CATEGORIA_DEFAULT_COLOR = '#6b7280';

// ── Helpers de lectura ──────────────────────────────────────
function leerLibro(base64) {
  const buffer = Buffer.from(base64, 'base64');
  return XLSX.read(buffer, { type: 'buffer', cellDates: true });
}

function excelFechaToSql(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  return s || null;
}

function clean(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

function leerHojaComoFilas(wb, nombreHoja) {
  const ws = wb.Sheets[nombreHoja];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}

// ── Campos del sistema que se pueden mapear ──────────────────
const CAMPOS_VENTAS = [
  { key: 'fecha',          label: 'Fecha',                 requerido: true },
  { key: 'detalle',        label: 'Detalle / producto',    requerido: false },
  { key: 'cantidad',       label: 'Cantidad',               requerido: false },
  { key: 'precio_unitario',label: 'Precio unitario',        requerido: false },
  { key: 'monto',          label: 'Monto total',            requerido: false },
  { key: 'medio_pago',     label: 'Medio de pago',          requerido: false },
  { key: 'monto_2',        label: 'Monto (2do pago, si está dividido)', requerido: false },
  { key: 'medio_pago_2',   label: 'Medio de pago (2do pago)', requerido: false },
  { key: 'categoria',      label: 'Categoría',              requerido: false },
];

const CAMPOS_GASTOS = [
  { key: 'fecha',        label: 'Fecha',                requerido: true },
  { key: 'categoria',    label: 'Categoría',             requerido: true }, // OBLIGATORIA
  { key: 'monto',        label: 'Monto',                 requerido: true },
  { key: 'descripcion',  label: 'Descripción',           requerido: false },
  { key: 'responsable',  label: 'Responsable',           requerido: false },
  { key: 'metodo_pago',  label: 'Método de pago',        requerido: false },
];

// Alias para sugerir automáticamente el mapeo por nombre de columna
const ALIAS = {
  fecha: ['fecha', 'date'],
  detalle: ['detalle', 'producto', 'item', 'descripcion del item'],
  cantidad: ['cantidad', 'cant'],
  precio_unitario: ['precio unitario', 'precio'],
  monto: ['monto', 'total', 'precio'],
  medio_pago: ['medio', 'medio de pago', 'metodo de pago', 'metodo'],
  monto_2: ['monto2', 'monto 2'],
  medio_pago_2: ['medio2', 'medio 2', 'med2', 'med'],
  categoria: ['categoria', 'categoría', 'rubro'],
  descripcion: ['descripcion', 'detalle', 'concepto'],
  responsable: ['responsable', 'vendedora', 'vendedor', 'empleado'],
  metodo_pago: ['metodo de pago', 'medio de pago', 'medio'],
};

function normalizar(s) {
  return clean(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // saca tildes
}

function sugerirMapeo(headers, campos) {
  const usados = new Set();
  const mapeo = {};
  for (const campo of campos) {
    const alias = (ALIAS[campo.key] || [campo.key]).map(normalizar);
    let idx = headers.findIndex((h, i) => !usados.has(i) && alias.includes(normalizar(h)));
    if (idx === -1) {
      idx = headers.findIndex((h, i) => !usados.has(i) && alias.some(a => normalizar(h).includes(a)));
    }
    if (idx !== -1) { mapeo[campo.key] = idx; usados.add(idx); }
  }
  return mapeo;
}

// ── Analizar archivo: hojas + encabezados + muestra ──────────
function analizarArchivo(base64) {
  const wb = leerLibro(base64);
  const hojas = wb.SheetNames.map(nombre => {
    const filas = leerHojaComoFilas(wb, nombre) || [];
    const headers = (filas[0] || []).map(h => clean(h) || '(sin nombre)');
    const muestra = filas.slice(1, 4);
    return {
      nombre,
      headers,
      muestra,
      sugerenciaVentas: sugerirMapeo(headers, CAMPOS_VENTAS),
      sugerenciaGastos: sugerirMapeo(headers, CAMPOS_GASTOS),
    };
  });
  return { hojas, camposVentas: CAMPOS_VENTAS, camposGastos: CAMPOS_GASTOS };
}

// ── Categorías de gasto: matchear o marcar como nuevas ───────
function getCategoriasExistentes(sucursal_id) {
  return all('SELECT * FROM categorias_gasto WHERE sucursal_id = ? AND activa = 1', [sucursal_id]);
}

function crearCategoriaSiNoExiste(nombre, sucursal_id, cache) {
  const key = nombre.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const existente = get(
    'SELECT * FROM categorias_gasto WHERE sucursal_id = ? AND LOWER(nombre) = ?',
    [sucursal_id, key]
  );
  if (existente) { cache.set(key, existente); return existente; }
  const r = run(
    'INSERT INTO categorias_gasto (nombre, icono, color, sucursal_id) VALUES (?,?,?,?)',
    [nombre, CATEGORIA_DEFAULT_ICONO, CATEGORIA_DEFAULT_COLOR, sucursal_id]
  );
  const creada = get('SELECT * FROM categorias_gasto WHERE id = ?', [r.lastInsertRowid]);
  cache.set(key, creada);
  return creada;
}

// ── Leer una fila usando el mapeo {campo: indiceColumna} ─────
function val(row, mapeo, campo) {
  const idx = mapeo[campo];
  return (idx === undefined || idx === null) ? null : row[idx];
}

// ── Parseo de Ventas (según mapeo elegido por el usuario) ────
function parsearVentas(filas, mapeo) {
  const ok = [];
  const errores = [];
  for (let i = 1; i < filas.length; i++) {
    const row = filas[i] || [];
    const vacia = row.every(c => c === null || c === undefined || String(c).trim() === '');
    if (vacia) continue;

    const filaNro = i + 1;
    const errsFila = [];

    const fecha = val(row, mapeo, 'fecha');
    const cantidad = Number(val(row, mapeo, 'cantidad')) || 1;
    const precioUnit = val(row, mapeo, 'precio_unitario');
    let monto = val(row, mapeo, 'monto');
    if ((monto === null || monto === undefined || monto === '') && precioUnit != null) {
      monto = Number(precioUnit) * cantidad;
    }
    const monto2 = val(row, mapeo, 'monto_2');

    if (!fecha) errsFila.push('Falta la fecha');
    if (monto === null || monto === undefined || monto === '' || isNaN(Number(monto))) errsFila.push('No se pudo calcular el monto');

    if (errsFila.length) {
      errores.push({ fila: filaNro, motivo: errsFila.join(', ') });
      continue;
    }

    const medioPago = clean(val(row, mapeo, 'medio_pago')) || 'Efectivo';
    const medioPago2 = clean(val(row, mapeo, 'medio_pago_2'));
    const montoTotal = Number(monto) + (monto2 ? Number(monto2) : 0);
    const metodoFinal = (monto2 && Number(monto2) > 0)
      ? `${medioPago} + ${medioPago2 || 'otro'}`
      : medioPago;

    ok.push({
      fila: filaNro,
      fecha: excelFechaToSql(fecha),
      detalle: clean(val(row, mapeo, 'detalle')),
      categoria: clean(val(row, mapeo, 'categoria')),
      precio: montoTotal,
      medioPago: metodoFinal,
    });
  }
  return { ok, errores };
}

// ── Parseo de Gastos (categoría OBLIGATORIA) ─────────────────
function parsearGastos(filas, mapeo) {
  const ok = [];
  const errores = [];
  for (let i = 1; i < filas.length; i++) {
    const row = filas[i] || [];
    const vacia = row.every(c => c === null || c === undefined || String(c).trim() === '');
    if (vacia) continue;

    const filaNro = i + 1;
    const errsFila = [];
    const categoriaLimpia = clean(val(row, mapeo, 'categoria'));
    const monto = val(row, mapeo, 'monto');
    const fecha = val(row, mapeo, 'fecha');

    if (!categoriaLimpia) errsFila.push('Falta la categoría (obligatoria)');
    if (monto === null || monto === undefined || monto === '' || isNaN(Number(monto))) errsFila.push('Monto inválido');
    if (!fecha) errsFila.push('Falta la fecha');

    if (errsFila.length) {
      errores.push({ fila: filaNro, motivo: errsFila.join(', ') });
      continue;
    }

    ok.push({
      fila: filaNro,
      fecha: excelFechaToSql(fecha),
      responsable: clean(val(row, mapeo, 'responsable')),
      categoria: categoriaLimpia,
      monto: Number(monto),
      metodoPago: clean(val(row, mapeo, 'metodo_pago')),
      descripcion: clean(val(row, mapeo, 'descripcion')) || categoriaLimpia,
    });
  }
  return { ok, errores };
}

// ── Paso 2: previsualizar (no escribe nada) ──────────────────
function previsualizar({ base64, hoja, tipo, mapeo }, sucursal_id) {
  const wb = leerLibro(base64);
  const filas = leerHojaComoFilas(wb, hoja);
  if (!filas) throw new Error(`No se encontró la hoja "${hoja}" en el archivo.`);

  if (tipo === 'ventas') {
    const ventas = parsearVentas(filas, mapeo);
    return {
      ventas: {
        cantidad: ventas.ok.length,
        total: ventas.ok.reduce((s, v) => s + v.precio, 0),
        errores: ventas.errores,
      },
      gastos: { cantidad: 0, total: 0, errores: [], categoriasNuevas: [] },
    };
  }

  const gastos = parsearGastos(filas, mapeo);
  const categoriasExistentes = getCategoriasExistentes(sucursal_id).map(c => c.nombre.toLowerCase());
  const categoriasNuevas = [...new Set(
    gastos.ok.map(g => g.categoria).filter(c => !categoriasExistentes.includes(c.toLowerCase()))
  )];

  return {
    ventas: { cantidad: 0, total: 0, errores: [] },
    gastos: {
      cantidad: gastos.ok.length,
      total: gastos.ok.reduce((s, g) => s + g.monto, 0),
      errores: gastos.errores,
      categoriasNuevas,
    },
  };
}

// ── Paso 3: confirmar (inserta todo en una transacción) ──────
function confirmar({ base64, hoja, tipo, mapeo }, { sucursal_id, usuario }) {
  const wb = leerLibro(base64);
  const filas = leerHojaComoFilas(wb, hoja);
  if (!filas) throw new Error(`No se encontró la hoja "${hoja}" en el archivo.`);

  const ventas = tipo === 'ventas' ? parsearVentas(filas, mapeo) : { ok: [] };
  const gastos = tipo === 'gastos' ? parsearGastos(filas, mapeo) : { ok: [] };

  const cacheCategorias = new Map();
  let categoriasCreadas = 0;

  const db = require('../db').db; // instancia better-sqlite3 (ver export abajo)
  const insertSale = db.prepare(`
    INSERT INTO sales (total, payment_method, cliente_id, status, sucursal_id, created_at)
    VALUES (?, ?, 1, 'completada', ?, ?)
  `);
  const insertSaleItem = db.prepare(`
    INSERT INTO sale_items (sale_id, sku, name, price, qty, subtotal)
    VALUES (?, 'VARIOS', ?, ?, 1, ?)
  `);
  const insertGasto = db.prepare(`
    INSERT INTO gastos (categoria, descripcion, monto, fecha, metodo_pago, pagado, status, sucursal_id)
    VALUES (?, ?, ?, ?, ?, 1, 'activo', ?)
  `);

  const tx = db.transaction(() => {
    for (const v of ventas.ok) {
      const nombreItem = [v.categoria, v.detalle].filter(Boolean).join(' - ') || 'Venta importada';
      const createdAt = `${v.fecha} 12:00:00`;
      const info = insertSale.run(v.precio, v.medioPago, sucursal_id, createdAt);
      insertSaleItem.run(info.lastInsertRowid, nombreItem, v.precio, v.precio);
    }
    for (const g of gastos.ok) {
      const catKey = g.categoria.toLowerCase();
      const existiaAntes = cacheCategorias.has(catKey) || getCategoriasExistentes(sucursal_id)
        .some(c => c.nombre.toLowerCase() === catKey);
      crearCategoriaSiNoExiste(g.categoria, sucursal_id, cacheCategorias);
      if (!existiaAntes) categoriasCreadas++;

      let descripcionFinal = g.descripcion;
      if (g.responsable) descripcionFinal = `[${g.responsable}] ${descripcionFinal}`;

      insertGasto.run(g.categoria, descripcionFinal, g.monto, g.fecha, g.metodoPago || null, sucursal_id);
    }
  });
  tx();

  return {
    ventasInsertadas: ventas.ok.length,
    gastosInsertados: gastos.ok.length,
    categoriasCreadas,
  };
}

module.exports = {
  analizarArchivo,
  previsualizar,
  confirmar,
};
