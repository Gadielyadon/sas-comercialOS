// src/services/lotes.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Lotes con fecha de vencimiento.
//
// El stock sigue viviendo en `existencias` (esa es la verdad de "cuánto hay").
// Los lotes solo dicen "de lo que hay, cuánto vence cuándo":
//   • Al vender o sacar stock se gasta primero lo que vence antes (FEFO).
//   • Al anular una venta, las unidades vuelven al MISMO lote del que salieron.
//   • Dar de baja un lote vencido descuenta ese stock como merma.
// Si un producto no tiene lotes cargados, todo sigue funcionando igual que siempre.
// ─────────────────────────────────────────────────────────────────────────────
const { db, get, all, run } = require('../db');

let _listo = false;
function ensureSchema() {
  if (_listo) return;
  run(`CREATE TABLE IF NOT EXISTS lotes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sku              TEXT    NOT NULL,
    sucursal_id      INTEGER NOT NULL DEFAULT 1,
    cantidad_inicial REAL    NOT NULL,
    cantidad         REAL    NOT NULL,
    vence            TEXT    NOT NULL,
    costo            REAL,
    origen           TEXT,
    nota             TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    baja_at          TEXT,
    baja_motivo      TEXT
  )`);
  run(`CREATE INDEX IF NOT EXISTS idx_lotes_sku ON lotes (sku, sucursal_id, vence)`);
  run(`CREATE TABLE IF NOT EXISTS lote_consumos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id     INTEGER NOT NULL,
    sku         TEXT    NOT NULL,
    sucursal_id INTEGER NOT NULL DEFAULT 1,
    cantidad    REAL    NOT NULL,
    sale_id     INTEGER,
    tipo        TEXT,
    restaurado  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  run(`CREATE INDEX IF NOT EXISTS idx_lote_consumos_sale ON lote_consumos (sale_id)`);
  _listo = true;
}

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const r3  = n => Math.round(n * 1000) / 1000;

// Hoy en Argentina (UTC-3), formato YYYY-MM-DD
function hoy() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }

function fechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// ── Registrar un lote ───────────────────────────────────────────────────────
// sumarStock=true  → mercadería NUEVA: suma al stock y anota el vencimiento.
// sumarStock=false → el stock ya estaba cargado: solo anota cuándo vence.
function registrar({ sku, sucursal_id = 1, cantidad, vence, costo = null, origen = null, nota = null,
                     usuario = null, sumarStock = false }) {
  ensureSchema();
  sku = String(sku || '').trim();
  const cant = num(cantidad);
  if (!sku) throw new Error('Falta el producto');
  if (!(cant > 0)) throw new Error('La cantidad tiene que ser mayor a cero');
  if (!fechaValida(vence)) throw new Error('La fecha de vencimiento no es válida (formato AAAA-MM-DD)');
  const prod = get(`SELECT sku, name FROM products WHERE sku = ?`, [sku]);
  if (!prod) throw new Error('No existe un producto con ese código');

  let id;
  db.transaction(() => {
    if (sumarStock) {
      const existencias = require('./existencias.service');
      const r = existencias.adjustStock(sku, sucursal_id, cant, {
        tipo: 'compra', motivo: `Ingreso con vencimiento ${vence}`, usuario,
      });
      if (r.error) throw new Error(r.error);
    }
    id = run(
      `INSERT INTO lotes (sku, sucursal_id, cantidad_inicial, cantidad, vence, costo, origen, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sku, Number(sucursal_id), cant, cant, vence, costo == null ? null : num(costo), origen, nota]
    ).lastInsertRowid;
  })();
  return get(`SELECT * FROM lotes WHERE id = ?`, [id]);
}

// ── Gastar unidades de los lotes, primero los que vencen antes ──────────────
// Nunca deja un lote en negativo: si hay menos unidades en lotes que las pedidas,
// gasta lo que hay (el resto del stock simplemente no tenía fecha cargada).
function consumir(sku, sucursal_id, cantidad, { sale_id = null, tipo = 'ajuste' } = {}) {
  ensureSchema();
  let falta = num(cantidad);
  const usados = [];
  if (falta <= 0) return usados;
  const lotes = all(
    `SELECT id, cantidad, vence FROM lotes
     WHERE sku = ? AND sucursal_id = ? AND baja_at IS NULL AND cantidad > 0
     ORDER BY vence ASC, id ASC`,
    [String(sku), Number(sucursal_id)]
  );
  for (const l of lotes) {
    if (falta <= 0) break;
    const sacar = Math.min(num(l.cantidad), falta);
    run(`UPDATE lotes SET cantidad = ? WHERE id = ?`, [r3(num(l.cantidad) - sacar), l.id]);
    run(`INSERT INTO lote_consumos (lote_id, sku, sucursal_id, cantidad, sale_id, tipo) VALUES (?, ?, ?, ?, ?, ?)`,
      [l.id, String(sku), Number(sucursal_id), sacar, sale_id, tipo]);
    usados.push({ lote_id: l.id, cantidad: sacar, vence: l.vence });
    falta = r3(falta - sacar);
  }
  return usados;
}

// ── Anular una venta: las unidades vuelven al lote del que salieron ─────────
function restaurarVenta(sale_id) {
  ensureSchema();
  const cs = all(`SELECT * FROM lote_consumos WHERE sale_id = ? AND restaurado = 0`, [Number(sale_id)]);
  for (const c of cs) {
    const l = get(`SELECT id, baja_at FROM lotes WHERE id = ?`, [c.lote_id]);
    if (l && !l.baja_at) run(`UPDATE lotes SET cantidad = cantidad + ? WHERE id = ?`, [c.cantidad, c.lote_id]);
    run(`UPDATE lote_consumos SET restaurado = 1 WHERE id = ?`, [c.id]);
  }
  return cs.length;
}

// ── Pasar stock de una sucursal a otra llevándose las fechas ────────────────
function transferir(sku, desde, hacia, cantidad) {
  ensureSchema();
  const usados = consumir(sku, desde, cantidad, { tipo: 'transferencia' });
  for (const u of usados) {
    const orig = get(`SELECT costo, origen FROM lotes WHERE id = ?`, [u.lote_id]);
    run(`INSERT INTO lotes (sku, sucursal_id, cantidad_inicial, cantidad, vence, costo, origen, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(sku), Number(hacia), u.cantidad, u.cantidad, u.vence,
       orig ? orig.costo : null, orig ? orig.origen : null, `Viene de la sucursal ${desde}`]);
  }
  return usados.length;
}

// ── Dar de baja un lote (se vence o se tira): descuenta el stock como merma ──
function baja(id, { usuario = null, motivo = 'Vencido' } = {}) {
  ensureSchema();
  const l = get(`SELECT * FROM lotes WHERE id = ?`, [Number(id)]);
  if (!l) throw new Error('Lote no encontrado');
  if (l.baja_at) throw new Error('Este lote ya fue dado de baja');
  const cant = num(l.cantidad);
  db.transaction(() => {
    if (cant > 0) {
      const existencias = require('./existencias.service');
      existencias.adjustStock(l.sku, l.sucursal_id, -cant, {
        tipo: 'merma', motivo: `${motivo} — lote #${l.id} (vence ${l.vence})`, usuario,
        permitirNegativo: true, sinLotes: true,
      });
    }
    run(`UPDATE lotes SET cantidad = 0, baja_at = datetime('now','localtime'), baja_motivo = ? WHERE id = ?`,
      [String(motivo || 'Vencido'), l.id]);
  })();
  return { ok: true, lote_id: l.id, unidades: cant };
}

// ── Corregir fecha o cantidad de un lote ────────────────────────────────────
function actualizar(id, { vence, cantidad } = {}) {
  ensureSchema();
  const l = get(`SELECT * FROM lotes WHERE id = ?`, [Number(id)]);
  if (!l) throw new Error('Lote no encontrado');
  if (l.baja_at) throw new Error('Este lote ya fue dado de baja');
  if (vence !== undefined) {
    if (!fechaValida(vence)) throw new Error('La fecha de vencimiento no es válida (formato AAAA-MM-DD)');
    run(`UPDATE lotes SET vence = ? WHERE id = ?`, [vence, l.id]);
  }
  if (cantidad !== undefined) {
    const c = num(cantidad, NaN);
    if (!Number.isFinite(c) || c < 0) throw new Error('La cantidad no es válida');
    run(`UPDATE lotes SET cantidad = ? WHERE id = ?`, [c, l.id]);
  }
  return get(`SELECT * FROM lotes WHERE id = ?`, [l.id]);
}

// ── Listado con días que faltan y resumen por urgencia ──────────────────────
// dias: hasta cuántos días hacia adelante mostrar (los vencidos siempre se muestran).
function listar({ sucursal_id = 1, dias = 30 } = {}) {
  ensureSchema();
  const h = hoy();
  const lim = (dias === null || dias === undefined || dias === 'todos') ? null : Math.max(0, num(dias, 30));
  const filas = all(
    `SELECT l.id, l.sku, p.name, p.category, p.price, l.cantidad, l.cantidad_inicial, l.vence, l.origen, l.nota,
            CAST(julianday(l.vence) - julianday(?) AS INTEGER) AS dias
     FROM lotes l
     LEFT JOIN products p ON p.sku = l.sku
     WHERE l.sucursal_id = ? AND l.baja_at IS NULL AND l.cantidad > 0
     ORDER BY l.vence ASC, l.id ASC`,
    [h, Number(sucursal_id)]
  ).map(f => ({ ...f, valor: Math.round(num(f.cantidad) * num(f.price) * 100) / 100 }));

  const bucket = d => d < 0 ? 'vencidos' : d <= 7 ? 'd7' : d <= 15 ? 'd15' : d <= 30 ? 'd30' : 'mas';
  const resumen = { vencidos: {}, d7: {}, d15: {}, d30: {} };
  Object.keys(resumen).forEach(k => { resumen[k] = { lotes: 0, unidades: 0, valor: 0 }; });
  filas.forEach(f => {
    const b = bucket(f.dias);
    if (resumen[b]) { resumen[b].lotes++; resumen[b].unidades = r3(resumen[b].unidades + num(f.cantidad)); resumen[b].valor = Math.round((resumen[b].valor + f.valor) * 100) / 100; }
  });
  const lotes = filas.filter(f => lim === null || f.dias <= lim);
  return { hoy: h, resumen, lotes };
}

// Para el tablero: cuántos lotes ya vencieron y cuántos vencen en 7 días
function resumenCorto(sucursal_id = 1) {
  try {
    ensureSchema();
    const r = listar({ sucursal_id, dias: 7 }).resumen;
    return { vencidos: r.vencidos.lotes, proximos7: r.d7.lotes };
  } catch (e) { return { vencidos: 0, proximos7: 0 }; }
}

module.exports = {
  ensureSchema, hoy, fechaValida,
  registrar, consumir, restaurarVenta, transferir, baja, actualizar, listar, resumenCorto,
};
