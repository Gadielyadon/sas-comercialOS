// src/services/email.service.js
// Envío de comprobantes por email via Gmail SMTP
// Requiere: npm install nodemailer

const nodemailer  = require('nodemailer');
const path        = require('path');
const fs          = require('fs');
const { get, all } = require('../db');
const configService = require('./config.service');

// ─────────────────────────────────────────────
// Crear transporter Gmail con la config guardada
// ─────────────────────────────────────────────
function crearTransporter() {
  const cfg = configService.getAll();
  const user = String(cfg.email_gmail  || '').trim();
  const pass = String(cfg.email_app_pass || '').trim();

  if (!user || !pass) {
    throw new Error('Gmail no configurado. Completá Email y Contraseña de app en Ajustes.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

// ─────────────────────────────────────────────
// Generar HTML del ticket
// ─────────────────────────────────────────────
function generarTicketHTML(sale, items, cfg) {
  const fecha = new Date(sale.created_at).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });

  const filas = items.map(it => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:14px;">${it.name}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${it.qty}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:14px;text-align:right;">${fmt(it.price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:14px;text-align:right;font-weight:700;">${fmt(it.subtotal || it.price * it.qty)}</td>
    </tr>`).join('');

  const logoHTML = cfg.empresa_logo
    ? `<img src="${cfg.empresa_logo}" style="max-height:60px;max-width:160px;object-fit:contain;margin-bottom:10px;" alt="Logo">`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

    <!-- Header azul -->
    <div style="background:#1B4FD8;padding:28px 32px;text-align:center;">
      ${logoHTML}
      <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-.3px;">${cfg.empresa_nombre || 'AxSoft'}</div>
      ${cfg.empresa_direccion ? `<div style="color:rgba(255,255,255,.75);font-size:13px;margin-top:4px;">${cfg.empresa_direccion}</div>` : ''}
      ${cfg.empresa_telefono  ? `<div style="color:rgba(255,255,255,.65);font-size:12px;margin-top:2px;">Tel: ${cfg.empresa_telefono}</div>` : ''}
    </div>

    <!-- Cuerpo -->
    <div style="padding:28px 32px;">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9CA3AF;margin-bottom:4px;">Comprobante</div>
          <div style="font-size:20px;font-weight:800;color:#111827;">Ticket #${sale.id}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9CA3AF;margin-bottom:4px;">Fecha</div>
          <div style="font-size:14px;font-weight:600;color:#374151;">${fecha}</div>
        </div>
      </div>

      <!-- Tabla items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:#1B4FD8;">
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#fff;text-align:left;border-radius:8px 0 0 8px;">Producto</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#fff;text-align:center;">Cant.</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#fff;text-align:right;">P. Unit.</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#fff;text-align:right;border-radius:0 8px 8px 0;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <!-- Totales -->
      <div style="background:#F7F8FA;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        ${sale.discount_pct > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:13px;color:#6B7280;">Subtotal</span>
          <span style="font-size:13px;color:#374151;">${fmt(sale.subtotal || sale.total)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:13px;color:#6B7280;">Descuento (${sale.discount_pct}%)</span>
          <span style="font-size:13px;color:#EF4444;">-${fmt(sale.subtotal * sale.discount_pct / 100)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:${sale.discount_pct > 0 ? '10px;border-top:1px solid #E5E7EB' : '0'};">
          <span style="font-size:16px;font-weight:800;color:#111827;">TOTAL</span>
          <span style="font-size:22px;font-weight:900;color:#1B4FD8;letter-spacing:-.5px;">${fmt(sale.total)}</span>
        </div>
      </div>

      <!-- Método de pago -->
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#EEF2FF;border-radius:10px;margin-bottom:24px;">
        <div style="width:36px;height:36px;background:#1B4FD8;border-radius:8px;display:flex;align-items:center;justify-content:center;">
          <span style="color:#fff;font-size:16px;">💳</span>
        </div>
        <div>
          <div style="font-size:11px;color:#6B7280;font-weight:600;">Método de pago</div>
          <div style="font-size:14px;font-weight:700;color:#1B4FD8;">${sale.payment_method || 'Efectivo'}</div>
        </div>
      </div>

      <!-- Footer mensaje -->
      <div style="text-align:center;padding-top:16px;border-top:1px solid #F3F4F6;">
        <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px;">${cfg.ticket_footer || '¡Gracias por su compra!'}</div>
        ${cfg.empresa_email ? `<div style="font-size:12px;color:#9CA3AF;">Consultas: ${cfg.empresa_email}</div>` : ''}
      </div>
    </div>

    <!-- Footer email -->
    <div style="background:#F7F8FA;padding:16px 32px;text-align:center;border-top:1px solid #E5E7EB;">
      <div style="font-size:11px;color:#9CA3AF;">Este comprobante fue generado por AxSoft · Sistema de Gestión</div>
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// Función principal — enviar comprobante
// ─────────────────────────────────────────────
async function enviarComprobante({ sale_id, email_destino }) {
  const cfg = configService.getAll();
  const gmailUser = String(cfg.email_gmail || '').trim();

  // Obtener venta
  const sale = get(`SELECT * FROM sales WHERE id = ?`, [Number(sale_id)]);
  if (!sale) throw new Error(`Venta #${sale_id} no encontrada`);

  // Obtener items
  const items = all(`SELECT * FROM sale_items WHERE sale_id = ?`, [Number(sale_id)]);

  // Generar ticket HTML
  const ticketHTML = generarTicketHTML(sale, items, cfg);

  // Armar adjuntos
  const adjuntos = [];

  // PDF de factura AFIP si existe
  let afipSvc;
  try { afipSvc = require('./afip.service'); } catch(_) {}

  if (afipSvc) {
    const factura = afipSvc.getFacturaBySaleId(Number(sale_id));
    if (factura) {
      try {
        // Generar PDF en buffer
        const pdfBuffer = await generarPdfFacturaBuffer(sale_id, factura, sale, items, cfg, afipSvc);
        if (pdfBuffer) {
          const tipoLetra = { 1:'A', 6:'B', 11:'C' }[factura.tipo_cbte] || 'X';
          adjuntos.push({
            filename: `factura-${tipoLetra}-${String(factura.nro_cbte).padStart(8,'0')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          });
        }
      } catch(e) {
        console.warn('Email: no se pudo adjuntar PDF AFIP:', e.message);
      }
    }
  }

  const transporter = crearTransporter();
  const nombreEmpresa = cfg.empresa_nombre || 'AxSoft';

  const info = await transporter.sendMail({
    from: `"${nombreEmpresa}" <${gmailUser}>`,
    to: email_destino,
    subject: `Comprobante de compra #${sale_id} — ${nombreEmpresa}`,
    html: ticketHTML,
    attachments: adjuntos,
  });

  return { ok: true, messageId: info.messageId, adjuntos: adjuntos.length };
}

// ─────────────────────────────────────────────
// Generar PDF de factura AFIP en buffer
// ─────────────────────────────────────────────
async function generarPdfFacturaBuffer(sale_id, factura, sale, items, cfg, afipSvc) {
  let PDFDocument, QRCode;
  try {
    PDFDocument = require('pdfkit');
    QRCode      = require('qrcode');
  } catch(_) { return null; }

  const qrUrl    = afipSvc.generarQRData(factura, cfg.afip_cuit || '');
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1 });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  const tipoLetra = { 1:'A', 6:'B', 11:'C' }[factura.tipo_cbte] || '?';
  const caeVtoFmt = factura.cae_vto
    ? `${String(factura.cae_vto).slice(6,8)}/${String(factura.cae_vto).slice(4,6)}/${String(factura.cae_vto).slice(0,4)}`
    : '';

  return new Promise((resolve, reject) => {
    const doc     = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks  = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text(cfg.empresa_nombre || 'Mi Comercio', 50, 50);
    doc.fontSize(10).font('Helvetica')
      .text(cfg.empresa_direccion || '', 50, 78)
      .text(`CUIT: ${cfg.afip_cuit || ''}`, 50, 91)
      .text(`Cond. IVA: ${cfg.empresa_cond_iva || 'Responsable Inscripto'}`, 50, 104);

    doc.rect(265, 45, 65, 65).stroke();
    doc.fontSize(36).font('Helvetica-Bold').text(tipoLetra, 265, 55, { width: 65, align: 'center' });
    doc.fontSize(9).font('Helvetica').text(`Cod: ${factura.tipo_cbte}`, 265, 93, { width: 65, align: 'center' });

    doc.fontSize(10).font('Helvetica-Bold')
      .text(`Pto. Venta: ${String(factura.punto_venta).padStart(4,'0')}`, 345, 50)
      .text(`Nro: ${String(factura.nro_cbte).padStart(8,'0')}`, 345, 64);
    doc.font('Helvetica').text(`Fecha: ${new Date(factura.created_at).toLocaleDateString('es-AR')}`, 345, 78);

    doc.moveTo(50, 150).lineTo(545, 150).stroke();
    doc.fontSize(10).font('Helvetica-Bold').text('Receptor:', 50, 160);
    doc.font('Helvetica')
      .text(`${factura.cliente_nombre || 'Consumidor Final'}`, 50, 174)
      .text(`CUIT/DNI: ${factura.cliente_cuit || '-'}`, 50, 188);
    doc.moveTo(50, 208).lineTo(545, 208).stroke();

    const cols = [50, 65, 295, 375, 465];
    doc.fontSize(9).font('Helvetica-Bold')
      .text('Cant.', cols[0], 220)
      .text('Descripción', cols[1], 220)
      .text('P. Unit.', cols[2], 220, { width: 70, align: 'right' })
      .text('% IVA', cols[3], 220, { width: 45, align: 'right' })
      .text('Subtotal', cols[4], 220, { width: 60, align: 'right' });
    doc.moveTo(50, 232).lineTo(545, 232).dash(2).stroke().undash();

    let y = 240;
    doc.font('Helvetica').fontSize(9);
    for (const it of items) {
      const sub = Number(it.subtotal || it.price * it.qty);
      doc.text(it.qty, cols[0], y, { width: 20, align: 'right' })
         .text(it.name, cols[1], y, { width: 210 })
         .text(`$${Number(it.price).toFixed(2)}`, cols[2], y, { width: 70, align: 'right' })
         .text(`${Number(it.iva || 0)}%`, cols[3], y, { width: 45, align: 'right' })
         .text(`$${sub.toFixed(2)}`, cols[4], y, { width: 60, align: 'right' });
      y += 16;
    }

    doc.moveTo(50, y + 4).lineTo(545, y + 4).stroke();
    y += 14;
    doc.font('Helvetica-Bold').fontSize(12)
      .text('TOTAL:', 380, y)
      .text(`$${Number(factura.importe_total).toFixed(2)}`, 480, y, { width: 65, align: 'right' });

    y += 28;
    doc.image(qrBuffer, 50, y, { width: 88 });
    doc.fontSize(9).font('Helvetica-Bold').text('CAE:', 152, y);
    doc.font('Helvetica-Oblique').text(factura.cae, 152, y + 12);
    doc.font('Helvetica-Bold').text('Vto. CAE:', 152, y + 26);
    doc.font('Helvetica').text(caeVtoFmt, 152, y + 38);
    doc.fontSize(7).text('Verificar en AFIP', 50, y + 92, { width: 88, align: 'center' });

    doc.end();
  });
}

module.exports = { enviarComprobante };
