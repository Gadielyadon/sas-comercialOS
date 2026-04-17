// src/routes/gastos.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/gastos.service');
const { requireAuth, requirePermiso } = require('../middlewares/auth.middleware');

router.use(requireAuth, requirePermiso('gastos'));

router.get('/', (req, res) => {
  const { desde, hasta, categoria } = req.query;
  const gastos     = svc.list({ desde, hasta, categoria });
  const resumen    = svc.getResumen({ desde, hasta });
  const categorias = svc.getCategorias();
  const hoy        = new Date().toISOString().split('T')[0];
  const fondo      = svc.getFondo(desde || hoy);
  const gastadoPagado = svc.getGastadoPagado({ desde: desde || hoy, hasta: hasta || hoy });

  res.render('pages/gastos', {
    title: 'Gastos', module: 'Gastos', active: 'gastos',
    user: { name: req.session.user.nombre || req.session.user.username, role: req.session.user.role },
    gastos, resumen, categorias,
    fondo: fondo || null,
    gastadoPagado,
    filtros: { desde: desde || '', hasta: hasta || '', categoria: categoria || '' }
  });
});

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
  const hoy  = new Date().toISOString().split('T')[0];
  const fecha = req.query.fecha || hoy;
  const fondo = svc.getFondo(fecha);
  const gastado = svc.getGastadoPagado({ desde: fecha, hasta: fecha });
  res.json({
    fondo: fondo || null,
    gastado,
    restante: fondo ? Math.max(fondo.monto - gastado, 0) : null
  });
});

router.post('/api/fondo', (req, res) => {
  try {
    const { fecha, monto, descripcion } = req.body;
    if (!monto || isNaN(Number(monto))) return res.status(400).json({ error: 'Monto inválido' });
    const f = svc.setFondo({ fecha, monto: Number(monto), descripcion });
    res.json({ ok: true, fondo: f });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Resumen descargable (HTML para imprimir / PDF) ─────────────
router.get('/resumen', (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const hoy = new Date().toISOString().split('T')[0];
    const gastos = svc.list({ desde: desde || hoy, hasta: hasta || hoy });
    const fondo  = svc.getFondo(desde || hoy);
    const gastadoPagado = svc.getGastadoPagado({ desde: desde || hoy, hasta: hasta || hoy });
    const resumen = svc.getResumen({ desde: desde || hoy, hasta: hasta || hoy });

    const fmt = n => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const fmtFecha = f => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

    const filas = gastos.map(g => `
      <tr>
        <td>${fmtFecha(g.fecha)}</td>
        <td>${g.categoria}</td>
        <td>${g.descripcion}</td>
        <td style="text-align:right;font-weight:600;">${fmt(g.monto)}</td>
        <td style="text-align:center;">
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;
            background:${g.pagado ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)'};
            color:${g.pagado ? '#059669' : '#d97706'};">
            ${g.pagado ? '✓ Pagado' : '⏳ Pendiente'}
          </span>
        </td>
        <td>${g.metodo_pago || '—'}</td>
      </tr>`).join('');

    const porCat = resumen.porCategoria.map(c =>
      `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f0f0;">
        <span>${c.categoria} <span style="color:#999;font-size:12px;">(${c.cantidad})</span></span>
        <strong>${fmt(c.total)}</strong>
      </div>`
    ).join('');

    const restante = fondo ? Math.max(fondo.monto - gastadoPagado, 0) : null;
    const pct = fondo && fondo.monto > 0 ? Math.min(Math.round((gastadoPagado / fondo.monto) * 100), 100) : null;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Resumen de Gastos</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',sans-serif; color:#111; padding:32px; font-size:13px; }
  h1 { font-size:22px; font-weight:800; margin-bottom:4px; }
  .sub { color:#666; font-size:13px; margin-bottom:28px; }
  .fondo-box { background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:12px; padding:18px 22px; margin-bottom:24px; display:flex; gap:32px; flex-wrap:wrap; }
  .fondo-item { display:flex;flex-direction:column;gap:3px; }
  .fondo-lbl { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; }
  .fondo-val { font-size:20px; font-weight:800; }
  .barra-wrap { width:100%; height:10px; background:#e5e7eb; border-radius:5px; overflow:hidden; margin-top:8px; }
  .barra-fill { height:100%; border-radius:5px; background:#10b981; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; }
  .card { background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px 20px; }
  .card h3 { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr { background:#1B4FD8; color:#fff; }
  th { padding:9px 12px; text-align:left; font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }
  td { padding:9px 12px; border-bottom:1px solid #f0f0f0; }
  tr:last-child td { border-bottom:none; }
  tr:hover td { background:#fafafa; }
  .footer { margin-top:32px; text-align:center; color:#aaa; font-size:11px; }
  @media print { body { padding:20px; } }
</style>
</head><body>
<h1>Resumen de Gastos</h1>
<div class="sub">Período: ${fmtFecha(desde || hoy)} ${hasta && hasta !== desde ? '→ ' + fmtFecha(hasta) : ''} · Generado: ${new Date().toLocaleString('es-AR')}</div>

${fondo ? `
<div class="fondo-box">
  <div class="fondo-item"><span class="fondo-lbl">Fondo disponible</span><span class="fondo-val" style="color:#059669;">${fmt(fondo.monto)}</span></div>
  <div class="fondo-item"><span class="fondo-lbl">Gastado (pagado)</span><span class="fondo-val" style="color:#dc2626;">${fmt(gastadoPagado)}</span></div>
  <div class="fondo-item"><span class="fondo-lbl">Restante</span><span class="fondo-val" style="color:#2563eb;">${fmt(restante)}</span></div>
  ${pct !== null ? `<div class="fondo-item" style="width:100%;"><span class="fondo-lbl">Uso del fondo: ${pct}%</span><div class="barra-wrap"><div class="barra-fill" style="width:${pct}%;background:${pct>90?'#ef4444':pct>70?'#f59e0b':'#10b981'};"></div></div></div>` : ''}
</div>` : ''}

<div class="grid">
  <div class="card">
    <h3>Por categoría</h3>
    ${porCat || '<p style="color:#999;">Sin datos</p>'}
  </div>
  <div class="card">
    <h3>Totales</h3>
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f0f0;"><span>Total gastos</span><strong>$${Number(resumen.total).toLocaleString('es-AR',{minimumFractionDigits:2})}</strong></div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f0f0;"><span>Pagados</span><strong style="color:#059669;">${fmt(gastadoPagado)}</strong></div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;"><span>Pendientes</span><strong style="color:#d97706;">${fmt(resumen.total - gastadoPagado)}</strong></div>
  </div>
</div>

<table>
  <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th style="text-align:right;">Monto</th><th style="text-align:center;">Estado</th><th>Método</th></tr></thead>
  <tbody>${filas || '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Sin gastos en el período</td></tr>'}</tbody>
</table>

<div class="footer">AxSoft · Sistema de Gestión · Resumen generado automáticamente</div>
<script>window.onload = () => window.print();</script>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
});

module.exports = router;
