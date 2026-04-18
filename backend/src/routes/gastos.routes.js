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

// ── API Gastos (originales) ─────────────────────────────────────
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

// ── Fondo de caja (original) ───────────────────────────────────
router.get('/api/fondo', (req, res) => {
  const hoy  = new Date().toISOString().split('T')[0];
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

// ── API Categorías (nuevo) ─────────────────────────────────────
router.get('/api/categorias', (req, res) => {
  res.json(svc.getCategorias());
});
router.post('/api/categorias', (req, res) => {
  try { res.status(201).json(svc.createCategoria(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.put('/api/categorias/:id', (req, res) => {
  const c = svc.updateCategoria(req.params.id, req.body);
  c ? res.json(c) : res.status(404).json({ error: 'No encontrada' });
});
router.delete('/api/categorias/:id', (req, res) => {
  svc.deleteCategoria(req.params.id);
  res.json({ ok: true });
});

// ── API Gastos recurrentes (nuevo) ────────────────────────────
router.get('/api/recurrentes', (req, res) => {
  res.json(svc.getRecurrentes());
});
router.post('/api/recurrentes', (req, res) => {
  try { res.status(201).json(svc.createRecurrente(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.put('/api/recurrentes/:id', (req, res) => {
  const r = svc.updateRecurrente(req.params.id, req.body);
  r ? res.json(r) : res.status(404).json({ error: 'No encontrado' });
});
router.delete('/api/recurrentes/:id', (req, res) => {
  svc.deleteRecurrente(req.params.id);
  res.json({ ok: true });
});
router.get('/api/recurrentes/estado', (req, res) => {
  try {
    const hoy  = new Date();
    const mes  = Number(req.query.mes)  || (hoy.getMonth() + 1);
    const anio = Number(req.query.anio) || hoy.getFullYear();
    res.json(svc.getRecurrentesConEstado(mes, anio));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/recurrentes/:id/pagar', (req, res) => {
  try {
    const { mes, anio, pagado, fecha_pago, metodo_pago } = req.body;
    const hoy = new Date();
    const result = svc.pagarRecurrenteMes({
      recurrente_id: req.params.id,
      mes:   mes  || (hoy.getMonth() + 1),
      anio:  anio || hoy.getFullYear(),
      pagado: !!pagado,
      fecha_pago, metodo_pago,
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

// ── Resumen descargable (original intacto) ─────────────────────
router.get('/resumen', (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const hoy = new Date().toISOString().split('T')[0];
    const dDesde = desde || hoy;
    const dHasta = hasta || hoy;

    const gastos        = svc.list({ desde: dDesde, hasta: dHasta });
    const fondo         = svc.getFondo(dDesde);
    const gastadoPagado = svc.getGastadoPagado({ desde: dDesde, hasta: dHasta });
    const resumen       = svc.getResumen({ desde: dDesde, hasta: dHasta });

    const fmt      = n => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const fmtFecha = f => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

    const totalPendiente = resumen.total - gastadoPagado;
    const restante = fondo ? Math.max(fondo.monto - gastadoPagado, 0) : null;
    const pct = fondo && fondo.monto > 0 ? Math.min(Math.round((gastadoPagado / fondo.monto) * 100), 100) : null;

    // Agrupar por categoría para la tabla principal
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
          <td style="padding-left:28px;color:#555;">${fmtFecha(g.fecha)}</td>
          <td style="color:#333;">${g.descripcion}${g.comprobante ? `<span style="color:#999;font-size:11px;margin-left:6px;">#${g.comprobante}</span>` : ''}</td>
          <td style="color:#555;">${g.metodo_pago || '—'}</td>
          <td style="text-align:center;">
            ${g.pagado
              ? `<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">✓ Pagado${g.fecha_pago ? ' · ' + fmtFecha(g.fecha_pago) : ''}</span>`
              : `<span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">⏳ Pendiente</span>`
            }
          </td>
          <td style="text-align:right;font-weight:700;color:#dc2626;">${fmt(g.monto)}</td>
        </tr>`).join('');

      return `
        <tr style="background:#f8faff;">
          <td colspan="4" style="padding:10px 14px;font-weight:800;font-size:13px;color:#1e3a8a;border-top:2px solid #dbeafe;border-bottom:1px solid #e5e7eb;">
            ${cat}
            <span style="font-weight:400;font-size:11px;color:#6b7280;margin-left:8px;">${data.gastos.length} gasto${data.gastos.length !== 1 ? 's' : ''}</span>
          </td>
          <td style="text-align:right;padding:10px 14px;font-weight:800;font-size:13px;color:#dc2626;border-top:2px solid #dbeafe;border-bottom:1px solid #e5e7eb;">${fmt(data.total)}</td>
        </tr>
        ${filasCat}
        <tr style="background:#fff7f7;">
          <td colspan="4" style="text-align:right;padding:6px 14px;font-size:11px;color:#6b7280;font-style:italic;">
            Pagado: <strong style="color:#059669;">${fmt(data.pagado)}</strong>
            &nbsp;·&nbsp; Pendiente: <strong style="color:#d97706;">${fmt(data.total - data.pagado)}</strong>
          </td>
          <td style="border-bottom:2px solid #e5e7eb;"></td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Resumen de Gastos · AxSoft</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI', Arial, sans-serif; color:#1a1a1a; background:#fff; font-size:13px; }
  .page { padding:32px 40px; max-width:900px; margin:0 auto; }

  /* Header */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; padding-bottom:20px; border-bottom:2px solid #1B4FD8; }
  .header-left h1 { font-size:24px; font-weight:900; color:#1B4FD8; letter-spacing:-0.5px; }
  .header-left .periodo { font-size:12px; color:#6b7280; margin-top:4px; }
  .header-right { text-align:right; }
  .header-right .empresa { font-size:15px; font-weight:800; color:#111; }
  .header-right .generado { font-size:11px; color:#9ca3af; margin-top:3px; }

  /* Resumen tarjetas */
  .tarjetas { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:24px; }
  .tarjeta { border-radius:10px; padding:16px 18px; }
  .tarjeta.total    { background:#eff6ff; border:1.5px solid #bfdbfe; }
  .tarjeta.pagado   { background:#f0fdf4; border:1.5px solid #bbf7d0; }
  .tarjeta.pendiente{ background:#fffbeb; border:1.5px solid #fde68a; }
  .tarjeta-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#6b7280; margin-bottom:6px; }
  .tarjeta-val { font-size:22px; font-weight:900; letter-spacing:-0.5px; }
  .tarjeta.total .tarjeta-val     { color:#1d4ed8; }
  .tarjeta.pagado .tarjeta-val    { color:#059669; }
  .tarjeta.pendiente .tarjeta-val { color:#d97706; }

  /* Fondo */
  .fondo-box { background:#f0fdf4; border:1.5px solid #6ee7b7; border-radius:10px; padding:16px 20px; margin-bottom:24px; display:flex; gap:28px; align-items:center; flex-wrap:wrap; }
  .fondo-item { display:flex; flex-direction:column; gap:2px; }
  .fondo-lbl  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; }
  .fondo-val  { font-size:18px; font-weight:800; }
  .barra-wrap { flex:1; min-width:150px; }
  .barra-lbl  { font-size:10px; color:#6b7280; margin-bottom:4px; }
  .barra-bg   { height:8px; background:#d1fae5; border-radius:4px; overflow:hidden; }
  .barra-fill { height:100%; border-radius:4px; }

  /* Por categoría resumen */
  .cat-resumen { margin-bottom:24px; }
  .cat-resumen h2 { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; margin-bottom:12px; border-bottom:1px solid #e5e7eb; padding-bottom:6px; }
  .cat-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .cat-name { width:160px; font-size:12px; font-weight:600; color:#374151; flex-shrink:0; }
  .cat-bar-wrap { flex:1; height:10px; background:#f3f4f6; border-radius:5px; overflow:hidden; }
  .cat-bar-fill { height:100%; border-radius:5px; background:#3b82f6; }
  .cat-pct  { width:36px; text-align:right; font-size:11px; color:#9ca3af; flex-shrink:0; }
  .cat-monto{ width:100px; text-align:right; font-size:12px; font-weight:700; color:#dc2626; flex-shrink:0; }

  /* Tabla */
  .tabla-titulo { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; margin-bottom:10px; border-bottom:1px solid #e5e7eb; padding-bottom:6px; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  thead tr { background:#1B4FD8; color:#fff; }
  th { padding:9px 14px; text-align:left; font-size:10.5px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }
  td { padding:8px 14px; border-bottom:1px solid #f0f0f0; vertical-align:middle; }
  tbody tr:hover td { background:#fafafa; }

  /* Footer */
  .footer { margin-top:36px; padding-top:14px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; color:#9ca3af; font-size:11px; }

  @media print {
    body { background:#fff; }
    .page { padding:20px 24px; }
    .no-print { display:none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>Resumen de Gastos</h1>
      <div class="periodo">Período: ${fmtFecha(dDesde)}${dHasta !== dDesde ? ' → ' + fmtFecha(dHasta) : ''}</div>
    </div>
    <div class="header-right">
      <div class="empresa">AxSoft · Sistema de Gestión</div>
      <div class="generado">Generado: ${new Date().toLocaleString('es-AR')}</div>
      <button class="no-print" onclick="window.print()" style="margin-top:8px;padding:6px 14px;background:#1B4FD8;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">🖨️ Imprimir</button>
    </div>
  </div>

  <!-- Tarjetas resumen -->
  <div class="tarjetas">
    <div class="tarjeta total">
      <div class="tarjeta-lbl">Total del período</div>
      <div class="tarjeta-val">${fmt(resumen.total)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${gastos.length} gasto${gastos.length !== 1 ? 's' : ''} registrados</div>
    </div>
    <div class="tarjeta pagado">
      <div class="tarjeta-lbl">Pagado</div>
      <div class="tarjeta-val">${fmt(gastadoPagado)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${gastos.filter(g=>g.pagado).length} gasto${gastos.filter(g=>g.pagado).length !== 1 ? 's' : ''} abonados</div>
    </div>
    <div class="tarjeta pendiente">
      <div class="tarjeta-lbl">Pendiente</div>
      <div class="tarjeta-val">${fmt(totalPendiente)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">${gastos.filter(g=>!g.pagado).length} gasto${gastos.filter(g=>!g.pagado).length !== 1 ? 's' : ''} sin abonar</div>
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

  <!-- Por categoría -->
  ${resumen.porCategoria.length ? `
  <div class="cat-resumen">
    <h2>Distribución por categoría</h2>
    ${resumen.porCategoria.map(c => {
      const pctCat = resumen.total > 0 ? Math.round(Number(c.total) / resumen.total * 100) : 0;
      return `<div class="cat-row">
        <div class="cat-name">${c.categoria} <span style="color:#9ca3af;font-size:10px;">(${c.cantidad})</span></div>
        <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:${pctCat}%;"></div></div>
        <div class="cat-pct">${pctCat}%</div>
        <div class="cat-monto">${fmt(c.total)}</div>
      </div>`;
    }).join('')}
  </div>` : ''}

  <!-- Tabla detalle agrupada por categoría -->
  <div class="tabla-titulo">Detalle de gastos</div>
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

  <!-- Footer -->
  <div class="footer">
    <span>AxSoft · Sistema de Gestión</span>
    <span>${fmtFecha(dDesde)}${dHasta !== dDesde ? ' → ' + fmtFecha(dHasta) : ''} · ${gastos.length} registros · Total: ${fmt(resumen.total)}</span>
  </div>

</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) {
    res.status(500).send('Error generando resumen: ' + e.message);
  }
});

module.exports = router;