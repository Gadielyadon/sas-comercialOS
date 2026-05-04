// src/routes/gastos.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/gastos.service');
const { requireAuth, requirePermiso } = require('../middlewares/auth.middleware');

router.use(requireAuth, requirePermiso('gastos'));

// ── Vista principal ────────────────────────────────────────────
router.get('/', (req, res) => {
  const { desde, hasta, categoria, vista } = req.query;
  const hoy = new Date().toISOString().split('T')[0];

  const gastos         = svc.list({ desde, hasta, categoria });
  const gastosAgrupado = svc.listAgrupado({ desde, hasta });
  const resumen        = svc.getResumen({ desde, hasta });
  const categorias     = svc.getCategorias();
  const recurrentes    = svc.getRecurrentes();
  const fondo          = svc.getFondo(desde || hoy);
  const gastadoPagado  = svc.getGastadoPagado({ desde: desde || hoy, hasta: hasta || hoy });

  res.render('pages/gastos', {
    title: 'Gastos', module: 'Gastos', active: 'gastos',
    user: { name: req.session.user.nombre || req.session.user.username, role: req.session.user.role },
    gastos, gastosAgrupado, resumen, categorias, recurrentes,
    fondo: fondo || null,
    gastadoPagado,
    filtros: { desde: desde || '', hasta: hasta || '', categoria: categoria || '', vista: vista || 'agrupado' },
  });
});

// ── API Gastos ─────────────────────────────────────────────────
router.post('/api', (req, res) => {
  try { res.status(201).json(svc.create(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.put('/api/:id', (req, res) => {
  const u = svc.update(req.params.id, req.body);
  u ? res.json(u) : res.status(404).json({ error: 'No encontrado' });
});
router.delete('/api/:id', (req, res) => {
  svc.remove(req.params.id); res.json({ ok: true });
});
router.get('/api/resumen', (req, res) => res.json(svc.getResumen(req.query)));

// ── Fondo de caja ──────────────────────────────────────────────
router.get('/api/fondo', (req, res) => {
  const hoy   = new Date().toISOString().split('T')[0];
  const fecha = req.query.fecha || hoy;
  const fondo = svc.getFondo(fecha);
  const gastado = svc.getGastadoPagado({ desde: fecha, hasta: fecha });
  res.json({
    fondo: fondo || null,
    gastado,
    restante: fondo ? Math.max(fondo.monto - gastado, 0) : null,
  });
});
router.post('/api/fondo', (req, res) => {
  try {
    const { fecha, monto, descripcion } = req.body;
    if (!monto || isNaN(Number(monto))) return res.status(400).json({ error: 'Monto invalido' });
    const f = svc.setFondo({ fecha, monto: Number(monto), descripcion });
    res.json({ ok: true, fondo: f });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API Categorías ─────────────────────────────────────────────
router.get('/api/categorias', (req, res) => { res.json(svc.getCategorias()); });
router.post('/api/categorias', (req, res) => {
  try { res.status(201).json(svc.createCategoria(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.put('/api/categorias/:id', (req, res) => {
  const c = svc.updateCategoria(req.params.id, req.body);
  c ? res.json(c) : res.status(404).json({ error: 'No encontrada' });
});
router.delete('/api/categorias/:id', (req, res) => {
  svc.deleteCategoria(req.params.id); res.json({ ok: true });
});

// ── API Gastos recurrentes ────────────────────────────────────
router.get('/api/recurrentes', (req, res) => { res.json(svc.getRecurrentes()); });
router.post('/api/recurrentes', (req, res) => {
  try { res.status(201).json(svc.createRecurrente(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.put('/api/recurrentes/:id', (req, res) => {
  const r = svc.updateRecurrente(req.params.id, req.body);
  r ? res.json(r) : res.status(404).json({ error: 'No encontrado' });
});
router.delete('/api/recurrentes/:id', (req, res) => {
  svc.deleteRecurrente(req.params.id); res.json({ ok: true });
});
router.get('/api/recurrentes/estado', (req, res) => {
  try {
    const hoy  = new Date();
    const mes  = Number(req.query.mes)  || (hoy.getMonth() + 1);
    const anio = Number(req.query.anio) || hoy.getFullYear();
    res.json(svc.getRecurrentesConEstado(mes, anio));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// MEJORADO: ahora acepta monto_real para ajustar el monto pagado real
router.post('/api/recurrentes/:id/pagar', (req, res) => {
  try {
    const { mes, anio, pagado, fecha_pago, metodo_pago, monto_real } = req.body;
    const hoy = new Date();
    const result = svc.pagarRecurrenteMes({
      recurrente_id: req.params.id,
      mes:   mes  || (hoy.getMonth() + 1),
      anio:  anio || hoy.getFullYear(),
      pagado: !!pagado,
      fecha_pago,
      metodo_pago,
      monto_real: monto_real ? Number(monto_real) : undefined,
    });
    res.json({ ok: true, gasto: result });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

router.post('/api/recurrentes/generar', (req, res) => {
  try {
    const { mes, anio } = req.body;
    const creados = svc.generarGastosMes({ mes, anio });
    res.json({ ok: true, creados });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Resumen descargable MEJORADO ───────────────────────────────
router.get('/resumen', (req, res) => {
  try {
    const { desde, hasta, categoria } = req.query;

    // MEJORA: Si no hay fechas, tomar el mes actual completo en vez de solo hoy
    const hoy     = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
    const dDesde  = desde || primerDiaMes;
    const dHasta  = hasta || hoy.toISOString().split('T')[0];

    const gastos        = svc.list({ desde: dDesde, hasta: dHasta, categoria });
    const fondo         = svc.getFondo(dDesde);
    const gastadoPagado = svc.getGastadoPagado({ desde: dDesde, hasta: dHasta });
    const resumen       = svc.getResumen({ desde: dDesde, hasta: dHasta });

    // Gastos fijos pendientes del mes actual
    const mesActual  = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();
    let recurrentesPendientes = [];
    try {
      const todosFijos = svc.getRecurrentesConEstado(mesActual, anioActual);
      recurrentesPendientes = todosFijos.filter(r => !r.pagado);
    } catch(e) { /* si falla no rompe el resumen */ }

    const fmt      = n => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const fmtFecha = f => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

    const totalPendiente      = resumen.total - gastadoPagado;
    const restante            = fondo ? Math.max(fondo.monto - gastadoPagado, 0) : null;
    const pct                 = fondo && fondo.monto > 0 ? Math.min(Math.round((gastadoPagado / fondo.monto) * 100), 100) : null;
    const promedioPorGasto    = gastos.length > 0 ? resumen.total / gastos.length : 0;
    const totalFijosPendientes= recurrentesPendientes.reduce((a, r) => a + Number(r.monto_estimado || 0), 0);

    // Agrupar por categoría
    const grupos = {};
    for (const g of gastos) {
      const cat = g.categoria || 'Sin categoría';
      if (!grupos[cat]) grupos[cat] = { gastos: [], total: 0, pagado: 0 };
      grupos[cat].gastos.push(g);
      grupos[cat].total  += Number(g.monto) || 0;
      grupos[cat].pagado += g.pagado ? (Number(g.monto) || 0) : 0;
    }

    const filasAgrupadas = Object.entries(grupos).map(([cat, data]) => {
      const filasCat = data.gastos.map(g => `
        <tr>
          <td style="padding-left:32px;color:#555;font-size:12px;">${fmtFecha(g.fecha)}</td>
          <td style="color:#333;">
            ${g.descripcion}
            ${g.comprobante ? `<span style="color:#999;font-size:11px;margin-left:6px;">#${g.comprobante}</span>` : ''}
            ${g.recurrente_id ? `<span style="color:#6366f1;font-size:10px;margin-left:5px;">↻ Fijo</span>` : ''}
          </td>
          <td style="color:#555;font-size:12px;">${g.metodo_pago || '—'}</td>
          <td style="text-align:center;">
            ${g.pagado
              ? `<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">✓ Pagado${g.fecha_pago ? ' · ' + fmtFecha(g.fecha_pago) : ''}</span>`
              : `<span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">⏳ Pendiente</span>`
            }
          </td>
          <td style="text-align:right;font-weight:700;color:#dc2626;">${fmt(g.monto)}</td>
        </tr>`).join('');

      return `
        <!-- Encabezado de categoría -->
        <tr style="background:#eef2ff;">
          <td colspan="4" style="padding:11px 14px;font-weight:800;font-size:13px;color:#1e3a8a;border-top:2px solid #c7d2fe;border-bottom:1px solid #e0e7ff;">
            ▸ ${cat}
            <span style="font-weight:400;font-size:11px;color:#6b7280;margin-left:8px;">${data.gastos.length} gasto${data.gastos.length !== 1 ? 's' : ''}</span>
          </td>
          <td style="text-align:right;padding:11px 14px;font-weight:900;font-size:14px;color:#dc2626;border-top:2px solid #c7d2fe;border-bottom:1px solid #e0e7ff;">${fmt(data.total)}</td>
        </tr>
        ${filasCat}
        <!-- Subtotal de categoría -->
        <tr style="background:#fafafa;border-bottom:2px solid #e5e7eb;">
          <td colspan="3"></td>
          <td style="text-align:right;padding:7px 14px;font-size:11.5px;color:#6b7280;">
            <span style="color:#059669;font-weight:700;">✓ Pagado: ${fmt(data.pagado)}</span>
            &nbsp;&nbsp;
            <span style="color:#d97706;font-weight:700;">⏳ Pendiente: ${fmt(data.total - data.pagado)}</span>
          </td>
          <td style="text-align:right;padding:7px 14px;font-size:12px;font-weight:800;color:#374151;">
            Subtotal: ${fmt(data.total)}
          </td>
        </tr>`;
    }).join('');

    // Sección gastos fijos pendientes
    const seccionFijos = recurrentesPendientes.length > 0 ? `
      <div style="margin-top:32px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">
          ⚠ Gastos fijos pendientes de pago — ${new Date().toLocaleDateString('es-AR',{month:'long',year:'numeric'})}
        </div>
        <table>
          <thead>
            <tr style="background:#7c3aed;">
              <th>Gasto fijo</th>
              <th>Categoría</th>
              <th style="text-align:center;">Vence día</th>
              <th style="text-align:right;">Monto estimado</th>
            </tr>
          </thead>
          <tbody>
            ${recurrentesPendientes.map(r => `
              <tr>
                <td style="font-weight:600;">${r.descripcion}</td>
                <td style="color:#555;">${r.categoria_nombre || '—'}</td>
                <td style="text-align:center;color:#7c3aed;font-weight:700;">día ${r.dia_vencimiento}</td>
                <td style="text-align:right;font-weight:700;color:#7c3aed;">${fmt(r.monto_estimado)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#f5f3ff;">
              <td colspan="3" style="text-align:right;padding:10px 14px;font-size:12px;font-weight:700;color:#5b21b6;">
                Total fijos pendientes:
              </td>
              <td style="text-align:right;padding:10px 14px;font-size:16px;font-weight:900;color:#7c3aed;">
                ${fmt(totalFijosPendientes)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Resumen de Gastos · AxSoft</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI', Arial, sans-serif; color:#1a1a1a; background:#f8fafc; font-size:13px; }
  .page { padding:32px 40px; max-width:960px; margin:0 auto; background:#fff; min-height:100vh; }

  /* Barra de acciones (no imprime) */
  .action-bar { position:sticky; top:0; z-index:10; background:#1B4FD8; color:#fff; padding:10px 40px; display:flex; align-items:center; justify-content:space-between; }
  .action-bar-title { font-size:14px; font-weight:700; }
  .action-bar-btns { display:flex; gap:8px; }
  .btn-print { padding:7px 18px; background:#fff; color:#1B4FD8; border:none; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; }
  .btn-close { padding:7px 18px; background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.3); border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; }

  /* Header */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; padding-bottom:20px; border-bottom:2px solid #1B4FD8; margin-top:24px; }
  .header-left h1 { font-size:26px; font-weight:900; color:#1B4FD8; letter-spacing:-0.5px; }
  .header-left .periodo { font-size:12px; color:#6b7280; margin-top:5px; }
  .header-left .filtro-cat { display:inline-block; margin-top:6px; background:#dbeafe; color:#1e40af; font-size:11px; font-weight:700; padding:2px 10px; border-radius:10px; }
  .header-right { text-align:right; }
  .header-right .empresa { font-size:15px; font-weight:800; color:#111; }
  .header-right .generado { font-size:11px; color:#9ca3af; margin-top:3px; }

  /* Tarjetas resumen */
  .tarjetas { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
  .tarjeta { border-radius:10px; padding:16px 18px; }
  .tarjeta.total    { background:#eff6ff; border:1.5px solid #bfdbfe; }
  .tarjeta.pagado   { background:#f0fdf4; border:1.5px solid #bbf7d0; }
  .tarjeta.pendiente{ background:#fffbeb; border:1.5px solid #fde68a; }
  .tarjeta.promedio { background:#faf5ff; border:1.5px solid #e9d5ff; }
  .tarjeta-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#6b7280; margin-bottom:6px; }
  .tarjeta-val { font-size:20px; font-weight:900; letter-spacing:-0.5px; }
  .tarjeta.total .tarjeta-val     { color:#1d4ed8; }
  .tarjeta.pagado .tarjeta-val    { color:#059669; }
  .tarjeta.pendiente .tarjeta-val { color:#d97706; }
  .tarjeta.promedio .tarjeta-val  { color:#7c3aed; }

  /* Fondo */
  .fondo-box { background:#f0fdf4; border:1.5px solid #6ee7b7; border-radius:10px; padding:16px 20px; margin-bottom:24px; display:flex; gap:28px; align-items:center; flex-wrap:wrap; }
  .fondo-item { display:flex; flex-direction:column; gap:2px; }
  .fondo-lbl  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; }
  .fondo-val  { font-size:18px; font-weight:800; }
  .barra-wrap { flex:1; min-width:150px; }
  .barra-lbl  { font-size:10px; color:#6b7280; margin-bottom:4px; }
  .barra-bg   { height:8px; background:#d1fae5; border-radius:4px; overflow:hidden; }
  .barra-fill { height:100%; border-radius:4px; }

  /* Distribución por categoría */
  .cat-resumen { margin-bottom:24px; }
  .cat-resumen h2 { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; margin-bottom:12px; border-bottom:1px solid #e5e7eb; padding-bottom:6px; }
  .cat-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .cat-name { width:170px; font-size:12px; font-weight:600; color:#374151; flex-shrink:0; }
  .cat-bar-wrap { flex:1; height:10px; background:#f3f4f6; border-radius:5px; overflow:hidden; }
  .cat-bar-fill { height:100%; border-radius:5px; background:#3b82f6; }
  .cat-pct  { width:36px; text-align:right; font-size:11px; color:#9ca3af; flex-shrink:0; }
  .cat-monto{ width:110px; text-align:right; font-size:12px; font-weight:700; color:#dc2626; flex-shrink:0; }
  .cat-cant { width:60px; text-align:right; font-size:11px; color:#9ca3af; flex-shrink:0; }

  /* Tabla */
  .tabla-titulo { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; margin-bottom:10px; border-bottom:1px solid #e5e7eb; padding-bottom:6px; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  thead tr { background:#1B4FD8; color:#fff; }
  th { padding:9px 14px; text-align:left; font-size:10.5px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }
  td { padding:8px 14px; border-bottom:1px solid #f0f0f0; vertical-align:middle; }

  /* Gran total final */
  .gran-total { margin-top:20px; padding:16px 20px; background:#1B4FD8; border-radius:10px; display:flex; justify-content:space-between; align-items:center; color:#fff; }
  .gran-total-label { font-size:14px; font-weight:700; }
  .gran-total-monto { font-size:26px; font-weight:900; letter-spacing:-1px; }

  /* Footer */
  .footer { margin-top:28px; padding-top:14px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; color:#9ca3af; font-size:11px; }

  @media print {
    body { background:#fff; }
    .page { padding:16px 20px; box-shadow:none; }
    .action-bar { display:none !important; }
    .tarjetas { grid-template-columns:repeat(4,1fr); }
  }
</style>
</head>
<body>

<!-- Barra de acción (no se imprime) -->
<div class="action-bar no-print">
  <span class="action-bar-title">📄 Resumen de Gastos — Vista previa</span>
  <div class="action-bar-btns">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>
</div>

<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>Resumen de Gastos</h1>
      <div class="periodo">Período: ${fmtFecha(dDesde)}${dHasta !== dDesde ? ' → ' + fmtFecha(dHasta) : ''}</div>
      ${categoria ? `<div class="filtro-cat">Filtrado por categoría: ${categoria}</div>` : ''}
    </div>
    <div class="header-right">
      <div class="empresa">AxSoft · Sistema de Gestión</div>
      <div class="generado">Generado: ${new Date().toLocaleString('es-AR')}</div>
    </div>
  </div>

  <!-- Tarjetas resumen (4 tarjetas) -->
  <div class="tarjetas">
    <div class="tarjeta total">
      <div class="tarjeta-lbl">Total del período</div>
      <div class="tarjeta-val">${fmt(resumen.total)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${gastos.length} gasto${gastos.length !== 1 ? 's' : ''} registrados</div>
    </div>
    <div class="tarjeta pagado">
      <div class="tarjeta-lbl">Pagado</div>
      <div class="tarjeta-val">${fmt(gastadoPagado)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${gastos.filter(g=>g.pagado).length} abonado${gastos.filter(g=>g.pagado).length !== 1 ? 's' : ''}</div>
    </div>
    <div class="tarjeta pendiente">
      <div class="tarjeta-lbl">Pendiente</div>
      <div class="tarjeta-val">${fmt(totalPendiente)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${gastos.filter(g=>!g.pagado).length} sin abonar</div>
    </div>
    <div class="tarjeta promedio">
      <div class="tarjeta-lbl">Promedio por gasto</div>
      <div class="tarjeta-val">${fmt(promedioPorGasto)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${resumen.porCategoria.length} categoría${resumen.porCategoria.length !== 1 ? 's' : ''}</div>
    </div>
  </div>

  ${fondo ? `
  <!-- Fondo del día -->
  <div class="fondo-box">
    <div class="fondo-item">
      <span class="fondo-lbl">Fondo cargado</span>
      <span class="fondo-val" style="color:#059669;">${fmt(fondo.monto)}</span>
    </div>
    <div class="fondo-item">
      <span class="fondo-lbl">Gastado (pagado)</span>
      <span class="fondo-val" style="color:#dc2626;">${fmt(gastadoPagado)}</span>
    </div>
    <div class="fondo-item">
      <span class="fondo-lbl">Restante</span>
      <span class="fondo-val" style="color:#2563eb;">${fmt(restante)}</span>
    </div>
    ${pct !== null ? `
    <div class="barra-wrap">
      <div class="barra-lbl">Uso del fondo: <strong>${pct}%</strong></div>
      <div class="barra-bg"><div class="barra-fill" style="width:${pct}%;background:${pct>90?'#ef4444':pct>70?'#f59e0b':'#10b981'};"></div></div>
    </div>` : ''}
  </div>` : ''}

  <!-- Distribución por categoría -->
  ${resumen.porCategoria.length ? `
  <div class="cat-resumen">
    <h2>Distribución por categoría</h2>
    ${resumen.porCategoria.map(c => {
      const pctCat = resumen.total > 0 ? Math.round(Number(c.total) / resumen.total * 100) : 0;
      return `<div class="cat-row">
        <div class="cat-name">${c.categoria}</div>
        <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:${pctCat}%;"></div></div>
        <div class="cat-pct">${pctCat}%</div>
        <div class="cat-cant">${c.cantidad} gasto${c.cantidad !== 1 ? 's' : ''}</div>
        <div class="cat-monto">${fmt(c.total)}</div>
      </div>`;
    }).join('')}
  </div>` : ''}

  <!-- Tabla detalle agrupada por categoría -->
  <div class="tabla-titulo">Detalle de gastos por categoría</div>
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Descripción</th>
        <th>Forma de pago</th>
        <th style="text-align:center;">Estado</th>
        <th style="text-align:right;">Monto</th>
      </tr>
    </thead>
    <tbody>
      ${filasAgrupadas || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px;">Sin gastos en el período seleccionado</td></tr>'}
    </tbody>
  </table>

  <!-- Gran total -->
  ${gastos.length > 0 ? `
  <div class="gran-total">
    <div>
      <div class="gran-total-label">TOTAL GENERAL DEL PERÍODO</div>
      <div style="font-size:11px;opacity:.75;margin-top:3px;">${gastos.length} gasto${gastos.length !== 1 ? 's' : ''} · Pagado: ${fmt(gastadoPagado)} · Pendiente: ${fmt(totalPendiente)}</div>
    </div>
    <div class="gran-total-monto">${fmt(resumen.total)}</div>
  </div>` : ''}

  <!-- Gastos fijos pendientes -->
  ${seccionFijos}

  <!-- Footer -->
  <div class="footer">
    <span>AxSoft · Sistema de Gestión</span>
    <span>${fmtFecha(dDesde)}${dHasta !== dDesde ? ' → ' + fmtFecha(dHasta) : ''} · ${gastos.length} registros · Total: ${fmt(resumen.total)}</span>
  </div>

</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) {
    res.status(500).send('Error generando resumen: ' + e.message);
  }
});

module.exports = router;