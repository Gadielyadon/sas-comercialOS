// src/services/pagos.service.js
// ─────────────────────────────────────────────────────────────────────────────
// ÚNICO lugar donde se calcula "cuánto entró por cada método de pago".
// Reportes, Historial, Caja, Dashboard, Cuenta corriente y los Excel usan esto.
// Si alguna vez cambia una regla (recargos, fiado, etc.) se cambia SOLO acá.
//
// Cómo se guarda una venta en la base:
//   • Pago simple : payment_method = "Efectivo"           → todo el `total` es de ese método
//   • Pago mixto  : payment_method = "Efectivo + Débito"  → el 1° método está en
//                   `cash_received` y el 2° en `monto_mixto2`
// ─────────────────────────────────────────────────────────────────────────────

// "Mercado Pago" = "MercadoPago" = "mercado pago"
function norm(x) {
  return String(x || '').toLowerCase().replace(/\s+/g, '');
}

const num = x => Number(x) || 0;

const esFiadoNombre = n => {
  const k = norm(n);
  return k.includes('fiado') || k.includes('cuentacorriente');
};

// Devuelve las partes en que se dividió la venta: [{ metodo, monto }]
// Una venta simple devuelve 1 parte; una mixta devuelve 2.
function partes(v) {
  const raw = String((v && v.payment_method) || '').trim() || 'Sin método';
  if (raw.includes('+')) {
    const p = raw.split('+').map(x => x.trim()).filter(Boolean);
    if (p.length === 2) {
      return [
        { metodo: p[0], monto: num(v.cash_received) },
        { metodo: p[1], monto: num(v.monto_mixto2) },
      ];
    }
  }
  return [{ metodo: raw, monto: num(v && v.total) }];
}

// ¿Cuánto de esta venta entró por ese método? (0 si no participó)
function montoEnMetodo(v, nombre) {
  const k = norm(nombre);
  return partes(v).reduce((a, p) => a + (norm(p.metodo) === k ? p.monto : 0), 0);
}

const efectivoDe = v => montoEnMetodo(v, 'Efectivo');

// Lo que quedó fiado (a cuenta corriente) de esta venta
function fiadoDe(v) {
  return partes(v).reduce((a, p) => a + (esFiadoNombre(p.metodo) ? p.monto : 0), 0);
}

const esAnulada = v => String((v && v.status) || 'completada') === 'anulada';
const vigentes  = ventas => (ventas || []).filter(v => !esAnulada(v));

// Agrupa por método → [{ payment_method, total, count }] ordenado de mayor a menor.
// Las ventas anuladas NO se cuentan. `count` = cantidad de ventas en que participó el método.
function agruparPorMetodo(ventas) {
  const mapa = new Map();
  vigentes(ventas).forEach(v => {
    partes(v).forEach(p => {
      const k = norm(p.metodo);
      if (!mapa.has(k)) mapa.set(k, { payment_method: p.metodo, total: 0, count: 0 });
      const e = mapa.get(k);
      e.total += p.monto;
      e.count += 1;
    });
  });
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

// Condición SQL para filtrar ventas por método, incluyendo los pagos mixtos.
// Devuelve { sql, params }. `col` es la columna, ej: 's.payment_method'.
function filtroSQL(col, metodo) {
  const k = norm(metodo);
  const n = `REPLACE(LOWER(TRIM(${col})),' ','')`;
  return { sql: `(${n} = ? OR ${n} LIKE ? OR ${n} LIKE ?)`, params: [k, `${k}+%`, `%+${k}`] };
}

// ── Control de coherencia ────────────────────────────────────────────────────
// Detecta ventas mixtas "raras" (como la del 2° monto x100) y verifica que el
// efectivo calculado con esta cuenta coincida con un cálculo hecho directo en SQL.
function detectarAnomalias(ventas) {
  const out = [];
  vigentes(ventas).forEach(v => {
    // Fiado sin cliente: la deuda no figura en ninguna cuenta
    if (fiadoDe(v) > 0 && !(Number(v.cliente_id) > 1)) {
      out.push({ id: v.id, tipo: 'fiado_sin_cliente', detalle: `Se fiaron ${fiadoDe(v)} sin cliente asignado` });
    }
    const raw = String(v.payment_method || '');
    if (!raw.includes('+')) return;
    const total = num(v.total), m1 = num(v.cash_received);
    if (v.monto_mixto2 === null || v.monto_mixto2 === undefined) {
      out.push({ id: v.id, tipo: 'sin_segundo_monto', detalle: 'El pago mixto no guardó el 2° monto' });
      return;
    }
    const m2 = num(v.monto_mixto2), suma = m1 + m2;
    if (total > 0 && suma > total * 1.35) {
      out.push({ id: v.id, tipo: 'monto_inflado', detalle: `Los montos suman ${suma} y el total es ${total}` });
    } else if (total > 0 && suma < total * 0.99) {
      out.push({ id: v.id, tipo: 'monto_faltante', detalle: `Los montos suman ${suma} y el total es ${total}` });
    }
  });
  return out;
}

function controlar(all, desde, hasta) {
  const ventas = all(
    `SELECT id, total, payment_method, cash_received, monto_mixto2, cliente_id,
            COALESCE(status,'completada') AS status
     FROM sales
     WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?`,
    [desde, hasta]
  );
  const porModulo = vigentes(ventas).reduce((a, v) => a + efectivoDe(v), 0);

  // Cálculo independiente, directo en SQL, para contrastar
  const f = `LOWER(TRIM(payment_method))`;
  const r = all(
    `SELECT
       COALESCE(SUM(CASE WHEN ${f}='efectivo' THEN total ELSE 0 END),0)
     + COALESCE(SUM(CASE WHEN ${f} LIKE 'efectivo +%' OR ${f} LIKE 'efectivo+%' THEN COALESCE(cash_received,0) ELSE 0 END),0)
     + COALESCE(SUM(CASE WHEN ${f} LIKE '%+ efectivo' OR ${f} LIKE '%+efectivo' THEN COALESCE(monto_mixto2,0) ELSE 0 END),0) AS ef
     FROM sales
     WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
       AND COALESCE(status,'completada') != 'anulada'`,
    [desde, hasta]
  );
  const porSQL = num(r && r[0] && r[0].ef);
  const anomalias = detectarAnomalias(ventas);

  // Ventas anuladas cuya deuda sigue cargada al cliente (anuladas antes de que la anulación
  // revirtiera la deuda). Se reparan con reparar_deudas_anuladas.js
  try {
    const colgadas = all(
      `SELECT s.id FROM sales s
       WHERE s.status = 'anulada'
         AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         AND EXISTS     (SELECT 1 FROM cuenta_corriente cc WHERE cc.sale_id = s.id AND cc.tipo = 'cargo')
         AND NOT EXISTS (SELECT 1 FROM cuenta_corriente cc WHERE cc.sale_id = s.id AND cc.tipo = 'pago')`,
      [desde, hasta]
    );
    colgadas.forEach(v => anomalias.push({
      id: v.id, tipo: 'deuda_de_venta_anulada',
      detalle: 'La venta está anulada pero el cliente sigue debiendo su importe',
    }));
  } catch (e) { /* tabla inexistente: nada que controlar */ }
  const coincide = Math.abs(porModulo - porSQL) < 0.01;
  return { desde, hasta, efectivo_modulo: porModulo, efectivo_sql: porSQL, coincide, anomalias, ok: coincide && anomalias.length === 0 };
}

module.exports = {
  norm, partes, montoEnMetodo, efectivoDe, fiadoDe, esFiadoNombre,
  esAnulada, vigentes, agruparPorMetodo, filtroSQL, detectarAnomalias, controlar,
};
