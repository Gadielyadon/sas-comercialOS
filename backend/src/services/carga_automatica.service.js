// src/services/carga_automatica.service.js
// ─────────────────────────────────────────────────────────────
// Carga automática de mercadería por foto/PDF de factura.
// 1) extraerItemsDeFactura   → manda la imagen/PDF a la IA y devuelve
//                               [{codigo, descripcion, cantidad, precio_costo}]
// 2) matchearProductos       → compara cada ítem contra el catálogo existente
//                               (por SKU exacto o por nombre parecido)
// 3) aplicarCarga            → crea productos nuevos / suma stock y
//                               actualiza precios de los que ya existen
// ─────────────────────────────────────────────────────────────

const productsService = require('./products.service');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL   = process.env.ANTHROPIC_MODEL_ESCANEO || 'claude-sonnet-5';

// ── 1) Extracción con IA ────────────────────────────────────────
async function extraerItemsDeFactura({ base64, mediaType }) {
  if (!ANTHROPIC_API_KEY) {
    const e = new Error('Falta configurar ANTHROPIC_API_KEY en el archivo .env del servidor');
    e.configFaltante = true;
    throw e;
  }
  if (!base64 || !mediaType) {
    throw new Error('Falta la imagen o el archivo a escanear');
  }

  const esPdf = mediaType === 'application/pdf';
  const contentBlock = esPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const prompt = `Sos un asistente que lee facturas y remitos de proveedores para un comercio argentino (kiosco, almacén, ferretería, etc).
Analizá la imagen/documento adjunto y devolvé ÚNICAMENTE un JSON válido (sin texto adicional, sin backticks de markdown, sin explicaciones) con esta forma exacta:

{"items":[{"codigo":"<código o SKU tal cual figura en la factura, o null si no hay ninguno>","descripcion":"<nombre del producto tal cual figura>","cantidad":<número>,"precio_costo":<precio unitario que pagó el comercio por ese producto, número>}]}

Reglas:
- Un objeto por cada renglón de producto de la factura o remito. NO incluyas totales, subtotales, IVA, percepciones, ni líneas que no sean productos.
- "cantidad" y "precio_costo" siempre como número (usá punto decimal, nunca coma).
- Si un renglón tiene bonificación o descuento, aplicalo y devolvé el precio_costo ya con el descuento incluido.
- Si el documento tiene varias páginas o fotos de la misma factura, unificá todo en una sola lista de items.
- Si no podés leer algún dato con total certeza, poné tu mejor estimación, pero nunca inventes productos que no estén en el documento.
- Devolvé SOLO el JSON, nada más.`;

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [contentBlock, { type: 'text', text: prompt }],
    }],
  };

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('No se pudo conectar con el servicio de IA: ' + e.message);
  }

  if (!resp.ok) {
    let detalle = '';
    try { detalle = (await resp.text()).slice(0, 300); } catch (_) {}
    throw new Error(`El servicio de IA devolvió un error (${resp.status}): ${detalle}`);
  }

  const data = await resp.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('La IA no devolvió ningún resultado legible');
  }

  let raw = textBlock.text.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('No se pudo interpretar la respuesta de la IA como JSON');
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items
    .filter(it => it && (it.descripcion || it.codigo))
    .map(it => ({
      codigo:       it.codigo != null ? String(it.codigo).trim() : '',
      descripcion:  it.descripcion != null ? String(it.descripcion).trim() : '',
      cantidad:     Number(it.cantidad) || 0,
      precio_costo: Number(it.precio_costo) || 0,
    }));
}

// ── 2) Matching contra el catálogo ──────────────────────────────
function normalizar(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Similaridad simple por tokens en común (Jaccard) — liviana y suficiente
// para sugerir el producto más parecido; el usuario siempre puede corregir.
function similitud(a, b) {
  const ta = new Set(normalizar(a).split(' ').filter(Boolean));
  const tb = new Set(normalizar(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

function matchearProductos(items, sucursal_id) {
  const suc = Number(sucursal_id || 1);
  const catalogo = productsService.list(suc);

  return items.map(it => {
    let match = null;

    // 1) Match exacto por código/SKU si la factura lo trae
    if (it.codigo) {
      match = productsService.findBySku(it.codigo, suc) || null;
    }

    // 2) Si no hubo match por SKU, buscar el nombre más parecido del catálogo
    let score = match ? 1 : 0;
    if (!match && it.descripcion) {
      let mejor = null, mejorScore = 0;
      for (const p of catalogo) {
        const s = similitud(it.descripcion, p.name);
        if (s > mejorScore) { mejorScore = s; mejor = p; }
      }
      if (mejor && mejorScore >= 0.45) { match = mejor; score = mejorScore; }
    }

    const costo = Number(it.precio_costo) || 0;

    return {
      codigo:               it.codigo || (match ? match.sku : ''),
      descripcion:          it.descripcion || (match ? match.name : ''),
      cantidad:             Number(it.cantidad) || 1,
      precio_costo:         costo,
      es_nuevo:             !match,
      match_confianza:      Math.round(score * 100),
      sku_existente:        match ? match.sku : null,
      nombre_existente:     match ? match.name : null,
      price_cost_actual:    match ? match.price_cost : null,
      price_actual:         match ? match.price : null,
      stock_actual:         match ? match.stock : null,
      // Sugerencia de precio de venta: si ya existe, el que tiene hoy;
      // si es nuevo, un margen orientativo del 40% sobre el costo (editable).
      precio_venta_sugerido: match
        ? match.price
        : Math.round(costo * 1.4 * 100) / 100,
    };
  });
}

// ── 3) Aplicar la carga a la base ───────────────────────────────
function generarSkuAuto() {
  return 'AUTO' + Date.now().toString().slice(-8) + Math.floor(10 + Math.random() * 90);
}

function aplicarCarga({ items, sucursal_id, usuario }) {
  const suc = Number(sucursal_id || 1);
  const resumen = { creados: 0, actualizados: 0, errores: [] };

  for (const it of (items || [])) {
    try {
      const cantidad     = Number(it.cantidad) || 0;
      const costo        = Number(it.precio_costo) || 0;
      const precioVenta  = Number(it.precio_venta) || 0;
      const esNuevo       = !!it.es_nuevo || !it.sku_existente;

      if (esNuevo) {
        const nombre = String(it.descripcion || '').trim();
        if (!nombre) throw new Error('Falta la descripción del producto');
        const sku = String(it.codigo || '').trim() || generarSkuAuto();
        productsService.create({
          sku, name: nombre,
          price: precioVenta || costo,
          price_cost: costo || null,
          stock: cantidad,
          sucursal_id: suc,
          category: 'Sin categoría',
        });
        resumen.creados++;
      } else {
        const sku = it.sku_existente;
        if (cantidad) {
          const r = productsService.adjustStock(sku, cantidad, suc, {
            tipo: 'alta', usuario: usuario || null,
            motivo: 'Carga automática (escaneo de factura)',
          });
          if (r && r.error) throw new Error(r.error);
        }
        const fields = {};
        if (it.actualizar_costo && costo > 0)       fields.price_cost = costo;
        if (it.actualizar_precio && precioVenta > 0) fields.price      = precioVenta;
        if (Object.keys(fields).length) productsService.updateBySku(sku, fields, suc);
        resumen.actualizados++;
      }
    } catch (e) {
      resumen.errores.push({ item: it.descripcion || it.codigo || '—', error: e.message });
    }
  }

  return resumen;
}

module.exports = {
  extraerItemsDeFactura,
  matchearProductos,
  aplicarCarga,
};
