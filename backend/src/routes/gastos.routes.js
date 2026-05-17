// src/routes/gastos.routes.js
const express = require('express');
const router  = express.Router();
const svc     = require('../services/gastos.service');
const { requireAuth, requirePermiso } = require('../middlewares/auth.middleware');

router.use(requireAuth, requirePermiso('gastos'));

// ── Vista principal — Gastos Fijos del Mes ────────────────────
router.get('/', (req, res) => {
  const hoy   = new Date();
  const mes   = Number(req.query.mes)  || (hoy.getMonth() + 1);
  const anio  = Number(req.query.anio) || hoy.getFullYear();

  // Nombres de meses en español
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const gastosMes  = svc.getRecurrentesConEstado(mes, anio);
  const resumen    = svc.getResumenMes(mes, anio);
  const categorias = svc.getCategorias();

  // Gastos variables históricos (recurrente_id IS NULL)
  const { all: dbAll } = require('../db');
  const gastosHistoricos = dbAll(
    `SELECT * FROM gastos WHERE recurrente_id IS NULL ORDER BY fecha DESC LIMIT 100`
  );

  // Navegación mes anterior / siguiente
  const mesPrev  = mes === 1  ? 12 : mes - 1;
  const anioPrev = mes === 1  ? anio - 1 : anio;
  const mesSig   = mes === 12 ? 1  : mes + 1;
  const anioSig  = mes === 12 ? anio + 1 : anio;

  res.render('pages/gastos', {
    title: 'Gastos', module: 'Gastos', active: 'gastos',
    user: { name: req.session.user.nombre || req.session.user.username, role: req.session.user.role },
    gastosMes, resumen, categorias, gastosHistoricos,
    mes, anio,
    mesNombre: MESES[mes - 1],
    mesPrev, anioPrev, mesSig, anioSig,
    esHoy: mes === hoy.getMonth() + 1 && anio === hoy.getFullYear(),
    config: {},
  });
});

// ── API: marcar pagado / pendiente (con monto opcional) ───────
router.post('/api/recurrentes/:id/pagar', (req, res) => {
  try {
    const { mes, anio, pagado, fecha_pago, metodo_pago, monto_real, pagar_todo } = req.body;
    const hoy = new Date();
    const result = svc.pagarRecurrenteMes({
      recurrente_id: req.params.id,
      mes:        mes  || (hoy.getMonth() + 1),
      anio:       anio || hoy.getFullYear(),
      pagado:     !!pagado,
      fecha_pago,
      metodo_pago,
      monto_real:  monto_real !== undefined ? Number(monto_real) : undefined,
      pagar_todo:  !!pagar_todo,
    });
    res.json({ ok: true, gasto: result });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── API: estado del mes (para navegación sin reload) ──────────
router.get('/api/recurrentes/estado', (req, res) => {
  try {
    const hoy  = new Date();
    const mes  = Number(req.query.mes)  || (hoy.getMonth() + 1);
    const anio = Number(req.query.anio) || hoy.getFullYear();
    res.json(svc.getRecurrentesConEstado(mes, anio));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: CRUD de gastos fijos (plantillas) ────────────────────
router.get('/api/recurrentes',     (req, res) => res.json(svc.getRecurrentes()));
router.post('/api/recurrentes',    (req, res) => {
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

// ── API: CRUD de categorías ───────────────────────────────────
router.get('/api/categorias',       (req, res) => res.json(svc.getCategorias()));
router.post('/api/categorias',      (req, res) => {
  try { res.status(201).json(svc.createCategoria(req.body)); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
router.put('/api/categorias/:id',   (req, res) => {
  const c = svc.updateCategoria(req.params.id, req.body);
  c ? res.json(c) : res.status(404).json({ error: 'No encontrada' });
});
router.delete('/api/categorias/:id', (req, res) => {
  svc.deleteCategoria(req.params.id); res.json({ ok: true });
});

// ── API: generar mes manualmente (cron / botón admin) ─────────
router.post('/api/recurrentes/generar', (req, res) => {
  try {
    const { mes, anio } = req.body;
    const creados = svc.generarGastosMes({ mes, anio });
    res.json({ ok: true, creados });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Resumen imprimible detallado ──────────────────────────────
router.get('/resumen', (req, res) => {
  try {
    const hoy   = new Date();
    const mes   = Number(req.query.mes)  || (hoy.getMonth() + 1);
    const anio  = Number(req.query.anio) || hoy.getFullYear();
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    // Obtener todos los gastos del mes con estado
    const todos = svc.getRecurrentesConEstado(mes, anio);
    const pagados   = todos.filter(g => g.pagado);
    const pendientes= todos.filter(g => !g.pagado);

    const fmt     = n  => '$' + Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2});
    const fmtDate = d  => d ? new Date(d+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';

    const totalMes      = todos.reduce((s,g)     => s + Number(g.gasto_monto||0), 0);
    const totalPagado   = pagados.reduce((s,g)   => s + Number(g.gasto_monto||0), 0);
    const totalPendiente= pendientes.reduce((s,g)=> s + Number(g.gasto_monto||0), 0);
    const pct = totalMes > 0 ? Math.round(totalPagado / totalMes * 100) : 0;

    // Agrupar por categoría (pagados)
    const gruposPagados = {};
    for (const g of pagados) {
      const cat = g.categoria_nombre || 'Sin categoría';
      if (!gruposPagados[cat]) gruposPagados[cat] = [];
      gruposPagados[cat].push(g);
    }

    // Agrupar por categoría (pendientes)
    const gruposPendientes = {};
    for (const g of pendientes) {
      const cat = g.categoria_nombre || 'Sin categoría';
      if (!gruposPendientes[cat]) gruposPendientes[cat] = [];
      gruposPendientes[cat].push(g);
    }

    // Render filas pagados
    const filasPagados = Object.entries(gruposPagados).sort().map(([cat, items]) => {
      const subtotal = items.reduce((s,i) => s + Number(i.gasto_monto||0), 0);
      const rows = items.map(g => `
        <tr>
          <td style="padding-left:24px;">
            <div style="font-weight:600;color:#111;">${g.descripcion}</div>
            ${g.tiene_arrastre ? `<div style="font-size:10.5px;color:#ef4444;margin-top:1px;">↑ Incluía arrastre de ${MESES[g.mes_arrastre-1]}: ${fmt(g.monto_arrastre)}</div>` : ''}
          </td>
          <td style="color:#6b7280;font-size:12px;">${g.categoria_nombre||'—'}</td>
          <td style="text-align:center;">
            <span style="background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">✓ Pagado</span>
          </td>
          <td style="text-align:center;color:#374151;font-size:12px;">${fmtDate(g.fecha_pago)}</td>
          <td style="text-align:center;color:#6b7280;font-size:12px;">${g.metodo_pago||'—'}</td>
          <td style="text-align:right;font-weight:800;color:#059669;">${fmt(g.gasto_monto)}</td>
        </tr>`).join('');
      return `
        <tr style="background:#f0fdf4;">
          <td colspan="5" style="padding:9px 14px;font-weight:800;font-size:13px;color:#065f46;border-top:2px solid #bbf7d0;">
            <i>▸ ${cat}</i>
            <span style="font-weight:400;font-size:11px;color:#6b7280;margin-left:8px;">${items.length} gasto${items.length!==1?'s':''}</span>
          </td>
          <td style="text-align:right;padding:9px 14px;font-weight:900;color:#059669;border-top:2px solid #bbf7d0;">${fmt(subtotal)}</td>
        </tr>${rows}`;
    }).join('');

    // Render filas pendientes
    const filasPendientes = Object.entries(gruposPendientes).sort().map(([cat, items]) => {
      const subtotal = items.reduce((s,i) => s + Number(i.gasto_monto||0), 0);
      const rows = items.map(g => `
        <tr>
          <td style="padding-left:24px;">
            <div style="font-weight:600;color:#111;">${g.descripcion}</div>
            ${g.tiene_arrastre ? `<div style="font-size:10.5px;color:#ef4444;margin-top:1px;">↑ Arrastre de ${MESES[g.mes_arrastre-1]}: ${fmt(g.monto_arrastre)} · Base este mes: ${fmt(g.monto_base)}</div>` : ''}
          </td>
          <td style="color:#6b7280;font-size:12px;">${g.categoria_nombre||'—'}</td>
          <td style="text-align:center;">
            <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">⏳ Pendiente</span>
          </td>
          <td style="text-align:center;color:#9ca3af;font-size:12px;">—</td>
          <td style="text-align:center;color:#6b7280;font-size:12px;">Vence día ${g.dia_vencimiento}</td>
          <td style="text-align:right;font-weight:800;color:#dc2626;">${fmt(g.gasto_monto)}</td>
        </tr>`).join('');
      return `
        <tr style="background:#fffbeb;">
          <td colspan="5" style="padding:9px 14px;font-weight:800;font-size:13px;color:#92400e;border-top:2px solid #fde68a;">
            <i>▸ ${cat}</i>
            <span style="font-weight:400;font-size:11px;color:#6b7280;margin-left:8px;">${items.length} gasto${items.length!==1?'s':''}</span>
          </td>
          <td style="text-align:right;padding:9px 14px;font-weight:900;color:#dc2626;border-top:2px solid #fde68a;">${fmt(subtotal)}</td>
        </tr>${rows}`;
    }).join('');

    // Distribución por categoría (barra visual para el resumen ejecutivo)
    const catMap = {};
    for (const g of todos) {
      const cat = g.categoria_nombre || 'Sin categoría';
      if (!catMap[cat]) catMap[cat] = { total:0, pagado:0, cant:0 };
      catMap[cat].total  += Number(g.gasto_monto||0);
      catMap[cat].pagado += g.pagado ? Number(g.gasto_monto||0) : 0;
      catMap[cat].cant++;
    }
    const distCats = Object.entries(catMap).sort((a,b) => b[1].total - a[1].total).map(([cat, d]) => {
      const pctCat = totalMes > 0 ? Math.round(d.total / totalMes * 100) : 0;
      const pctPag = d.total > 0  ? Math.round(d.pagado / d.total * 100) : 0;
      return `
        <tr>
          <td style="font-weight:600;">${cat}</td>
          <td style="text-align:center;">${d.cant}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pctCat}%;background:#1B4FD8;border-radius:4px;"></div>
              </div>
              <span style="font-size:11px;color:#6b7280;width:30px;text-align:right;">${pctCat}%</span>
            </div>
          </td>
          <td style="text-align:right;font-weight:700;color:#dc2626;">${fmt(d.total)}</td>
          <td style="text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;">
              <span style="color:#059669;font-weight:700;">${fmt(d.pagado)}</span>
              <span style="color:#9ca3af;">·</span>
              <span style="color:#d97706;font-weight:700;">${fmt(d.total-d.pagado)} pend.</span>
            </div>
          </td>
          <td style="text-align:center;">
            <div style="height:6px;background:#fee2e2;border-radius:3px;overflow:hidden;width:60px;display:inline-block;">
              <div style="height:100%;width:${pctPag}%;background:#10b981;border-radius:3px;"></div>
            </div>
            <span style="font-size:10px;color:#6b7280;margin-left:4px;">${pctPag}%</span>
          </td>
        </tr>`;
    }).join('');

    const generadoEn = new Date().toLocaleString('es-AR', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Gastos ${MESES[mes-1]} ${anio} — AxSoft</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; color:#111; font-size:13px; }

  /* Barra de acción */
  .bar { position:sticky; top:0; z-index:10; background:#1B4FD8; color:#fff;
         padding:10px 40px; display:flex; align-items:center; justify-content:space-between; }
  .bar-title { font-size:14px; font-weight:700; }
  .bar button { padding:7px 18px; border:none; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; }
  .btn-p { background:#fff; color:#1B4FD8; }
  .btn-c { background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.35); margin-left:6px; }

  /* Página */
  .page { max-width:980px; margin:0 auto; background:#fff; padding:36px 44px; min-height:100vh; }

  /* Header del doc */
  .doc-header { display:flex; justify-content:space-between; align-items:flex-start;
                padding-bottom:20px; border-bottom:3px solid #1B4FD8; margin-bottom:28px; }
  .doc-title { font-size:28px; font-weight:900; color:#1B4FD8; letter-spacing:-0.5px; }
  .doc-sub   { font-size:12px; color:#6b7280; margin-top:4px; }
  .doc-right { text-align:right; }
  .doc-empresa { font-size:15px; font-weight:800; color:#111; }
  .doc-gen     { font-size:11px; color:#9ca3af; margin-top:3px; }

  /* KPIs */
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:28px; }
  .kpi { border-radius:10px; padding:16px 18px; }
  .kpi.tot { background:#eff6ff; border:1.5px solid #bfdbfe; }
  .kpi.pag { background:#f0fdf4; border:1.5px solid #bbf7d0; }
  .kpi.pen { background:#fffbeb; border:1.5px solid #fde68a; }
  .kpi.pct { background:#f5f3ff; border:1.5px solid #ddd6fe; }
  .kpi-l { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; margin-bottom:6px; }
  .kpi-v { font-size:22px; font-weight:900; letter-spacing:-0.5px; }
  .kpi.tot .kpi-v { color:#1d4ed8; }
  .kpi.pag .kpi-v { color:#059669; }
  .kpi.pen .kpi-v { color:#d97706; }
  .kpi.pct .kpi-v { color:#7c3aed; }
  .kpi-sub { font-size:11px; color:#6b7280; margin-top:4px; }

  /* Barra progreso */
  .prog-wrap { margin-top:8px; }
  .prog-bg   { height:8px; background:#e9d5ff; border-radius:4px; overflow:hidden; }
  .prog-fill { height:100%; border-radius:4px; background:#7c3aed; }

  /* Secciones */
  .section { margin-bottom:32px; }
  .section-title {
    display:flex; align-items:center; gap:10px;
    font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.6px;
    padding:10px 16px; border-radius:8px; margin-bottom:12px;
  }
  .section-title.pagado   { background:#d1fae5; color:#065f46; border-left:4px solid #10b981; }
  .section-title.pendiente{ background:#fef3c7; color:#92400e; border-left:4px solid #f59e0b; }
  .section-title.resumen  { background:#eff6ff; color:#1e3a8a; border-left:4px solid #1B4FD8; }
  .section-title .badge   { margin-left:auto; font-size:12px; font-weight:900; letter-spacing:0; text-transform:none; }

  /* Tabla */
  table { width:100%; border-collapse:collapse; font-size:12.5px; margin-bottom:8px; }
  thead tr { background:#1B4FD8; color:#fff; }
  th { padding:9px 12px; text-align:left; font-size:10.5px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; }
  td { padding:8px 12px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
  tr:last-child td { border-bottom:none; }

  /* Gran total */
  .gran { display:flex; justify-content:space-between; align-items:center;
          background:#1B4FD8; color:#fff; border-radius:10px; padding:16px 22px; margin-top:12px; }
  .gran-l { font-size:13px; font-weight:700; }
  .gran-v { font-size:28px; font-weight:900; letter-spacing:-1px; }

  /* Tabla dist por cat */
  .dist-table thead tr { background:#374151; }

  /* Vacío */
  .empty { text-align:center; padding:24px; color:#9ca3af; font-size:13px; font-style:italic; }

  /* Footer */
  .footer { margin-top:32px; padding-top:14px; border-top:1px solid #e5e7eb;
            display:flex; justify-content:space-between; color:#9ca3af; font-size:11px; }

  @media print {
    body { background:#fff; }
    .page { padding:20px 28px; }
    .bar { display:none !important; }
    .kpis { grid-template-columns:repeat(4,1fr); }
  }
</style>
</head>
<body>

<!-- Barra de acción -->
<div class="bar">
  <span class="bar-title">📄 Gastos Fijos — ${MESES[mes-1]} ${anio}</span>
  <div>
    <button class="btn-p" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn-c" onclick="window.close()">✕ Cerrar</button>
  </div>
</div>

<div class="page">

  <!-- Header del documento -->
  <div class="doc-header">
    <div>
      <div class="doc-title">Gastos Fijos — ${MESES[mes-1]} ${anio}</div>
      <div class="doc-sub">${todos.length} gasto${todos.length!==1?'s':''} fijo${todos.length!==1?'s':''} configurados · ${pagados.length} pagado${pagados.length!==1?'s':''} · ${pendientes.length} pendiente${pendientes.length!==1?'s':''}</div>
    </div>
    <div class="doc-right">
      <div class="doc-empresa">AxSoft · Sistema de Gestión</div>
      <div class="doc-gen">Generado el ${generadoEn}</div>
    </div>
  </div>

  <!-- KPIs -->
  <div class="kpis">
    <div class="kpi tot">
      <div class="kpi-l">Total comprometido</div>
      <div class="kpi-v">${fmt(totalMes)}</div>
      <div class="kpi-sub">${todos.length} gasto${todos.length!==1?'s':''} fijos</div>
    </div>
    <div class="kpi pag">
      <div class="kpi-l">Pagado</div>
      <div class="kpi-v">${fmt(totalPagado)}</div>
      <div class="kpi-sub">${pagados.length} abonado${pagados.length!==1?'s':''}</div>
    </div>
    <div class="kpi pen">
      <div class="kpi-l">Pendiente</div>
      <div class="kpi-v">${fmt(totalPendiente)}</div>
      <div class="kpi-sub">${pendientes.length} sin pagar</div>
    </div>
    <div class="kpi pct">
      <div class="kpi-l">Progreso del mes</div>
      <div class="kpi-v">${pct}%</div>
      <div class="prog-wrap">
        <div class="prog-bg"><div class="prog-fill" style="width:${pct}%;background:${pct===100?'#10b981':'#7c3aed'};"></div></div>
      </div>
    </div>
  </div>

  <!-- ── SECCIÓN 1: PAGADOS ──────────────────────────────────── -->
  <div class="section">
    <div class="section-title pagado">
      <span>✅ Pagados este mes</span>
      <span class="badge">${fmt(totalPagado)}</span>
    </div>
    ${pagados.length ? `
    <table>
      <thead>
        <tr>
          <th>Gasto</th>
          <th>Categoría</th>
          <th style="text-align:center;">Estado</th>
          <th style="text-align:center;">Fecha de pago</th>
          <th style="text-align:center;">Forma de pago</th>
          <th style="text-align:right;">Monto</th>
        </tr>
      </thead>
      <tbody>${filasPagados}</tbody>
      <tfoot>
        <tr style="background:#f0fdf4;">
          <td colspan="5" style="text-align:right;padding:10px 12px;font-size:12px;font-weight:700;color:#065f46;">
            Subtotal pagado:
          </td>
          <td style="text-align:right;padding:10px 12px;font-size:16px;font-weight:900;color:#059669;">
            ${fmt(totalPagado)}
          </td>
        </tr>
      </tfoot>
    </table>` : '<div class="empty">Sin pagos registrados este mes</div>'}
  </div>

  <!-- ── SECCIÓN 2: PENDIENTES ──────────────────────────────── -->
  <div class="section">
    <div class="section-title pendiente">
      <span>⏳ Pendientes de pago</span>
      <span class="badge">${fmt(totalPendiente)}</span>
    </div>
    ${pendientes.length ? `
    <table>
      <thead>
        <tr>
          <th>Gasto</th>
          <th>Categoría</th>
          <th style="text-align:center;">Estado</th>
          <th style="text-align:center;">Fecha pago</th>
          <th style="text-align:center;">Vencimiento</th>
          <th style="text-align:right;">Monto</th>
        </tr>
      </thead>
      <tbody>${filasPendientes}</tbody>
      <tfoot>
        <tr style="background:#fffbeb;">
          <td colspan="5" style="text-align:right;padding:10px 12px;font-size:12px;font-weight:700;color:#92400e;">
            Total pendiente:
          </td>
          <td style="text-align:right;padding:10px 12px;font-size:16px;font-weight:900;color:#dc2626;">
            ${fmt(totalPendiente)}
          </td>
        </tr>
      </tfoot>
    </table>` : '<div class="empty" style="background:#f0fdf4;border-radius:8px;color:#059669;font-weight:700;">🎉 Todo pagado este mes</div>'}
  </div>

  <!-- ── SECCIÓN 3: RESUMEN EJECUTIVO ──────────────────────── -->
  <div class="section">
    <div class="section-title resumen">
      <span>📊 Distribución por categoría</span>
      <span class="badge">${Object.keys(catMap).length} categoría${Object.keys(catMap).length!==1?'s':''}</span>
    </div>
    <table class="dist-table">
      <thead>
        <tr>
          <th>Categoría</th>
          <th style="text-align:center;">Gastos</th>
          <th>Participación</th>
          <th style="text-align:right;">Total</th>
          <th style="text-align:center;">Pagado · Pendiente</th>
          <th style="text-align:center;">% Pagado</th>
        </tr>
      </thead>
      <tbody>${distCats}</tbody>
    </table>
  </div>

  <!-- Gran total -->
  <div class="gran">
    <div>
      <div class="gran-l">TOTAL COMPROMETIDO — ${MESES[mes-1].toUpperCase()} ${anio}</div>
      <div style="font-size:11px;opacity:.75;margin-top:3px;">
        Pagado: ${fmt(totalPagado)} (${pct}%) · Pendiente: ${fmt(totalPendiente)} · ${todos.length} gastos fijos
      </div>
    </div>
    <div class="gran-v">${fmt(totalMes)}</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>AxSoft · Sistema de Gestión</span>
    <span>${MESES[mes-1]} ${anio} · ${todos.length} gastos fijos · Generado: ${generadoEn}</span>
  </div>

</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) { res.status(500).send('<pre>Error: ' + e.message + '\n' + e.stack + '</pre>'); }
});

// ── DELETE: eliminar gasto (recurrente + sus instancias pendientes) ──
router.delete('/api/gasto/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const { run: dbRun, get: dbGet } = require('../db');

    // El ID que llega es el ID del recurrente (gastos_recurrentes.id)
    const recurrente = dbGet('SELECT * FROM gastos_recurrentes WHERE id=?', [id]);
    if (!recurrente) {
      // Puede ser un gasto variable suelto (recurrente_id IS NULL)
      const gastoSuelto = dbGet('SELECT * FROM gastos WHERE id=? AND recurrente_id IS NULL', [id]);
      if (!gastoSuelto) return res.status(404).json({ error: 'Gasto no encontrado' });
      dbRun('DELETE FROM gastos WHERE id=?', [id]);
      return res.json({ ok: true });
    }

    // Eliminar instancias mensuales NO pagadas
    dbRun('DELETE FROM gastos WHERE recurrente_id=? AND pagado=0', [id]);
    // Eliminar el recurrente raíz para que no se regenere
    dbRun('DELETE FROM gastos_recurrentes WHERE id=?', [id]);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;