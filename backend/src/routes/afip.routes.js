// src/routes/afip.routes.js
const express = require('express');
const router = express.Router();

const afipSvc = require('../services/afip.service');
const configService = require('../services/config.service');
const { get, all } = require('../db');

function facturacionHabilitada() {
  const cfg = configService.getAll();
  return String(cfg.facturacion_habilitada || '0') === '1';
}

function ensureFacturacionHabilitada(req, res, next) {
  if (!facturacionHabilitada()) {
    return res.status(403).json({
      error: 'La facturación electrónica está desactivada en este sistema',
    });
  }
  next();
}

function getUserFromReq(req, res) {
  return req.session?.user || res.locals?.user || req.user || null;
}

function getAfipErrorStatus(message = '') {
  const msg = String(message || '').toLowerCase();

  if (
    msg.includes('ya tiene factura emitida') ||
    msg.includes('venta no encontrada') ||
    msg.includes('no tiene items') ||
    msg.includes('tipo inválido') ||
    msg.includes('tipo invalido') ||
    msg.includes('cuit') ||
    msg.includes('punto de venta') ||
    msg.includes('afip rechazó') ||
    msg.includes('afip rechazo') ||
    msg.includes('deshabilitada') ||
    msg.includes('desactivada')
  ) {
    return 400;
  }

  return 500;
}

// ─────────────────────────────────────────────────────────────
// GET /afip/historial — vista historial de facturación
// ─────────────────────────────────────────────────────────────
router.get('/historial', (req, res) => {
  try {
    const cfg = configService.getAll();
    const facturacionActiva = String(cfg.facturacion_habilitada || '0') === '1';

    res.render('pages/facturacion', {
      title: 'Historial de Facturación',
      module: 'Facturación',
      active: 'facturacion',
      user: getUserFromReq(req, res),
      facturacionHabilitada: facturacionActiva,
    });
  } catch (e) {
    console.error('AFIP historial view error:', e.message);
    res.status(500).send('Error al abrir historial de facturación');
  }
});

// ─────────────────────────────────────────────────────────────
// POST /afip/emitir
// Body: { sale_id, tipo: 'A'|'B'|'C', cliente: { cuit, nombre } }
// ─────────────────────────────────────────────────────────────
router.post('/emitir', async (req, res) => {
  try {
    if (!facturacionHabilitada()) {
      return res.status(403).json({
        error: 'La facturación electrónica está deshabilitada en Ajustes',
      });
    }

    const { sale_id, tipo, cliente } = req.body;

    if (!sale_id) {
      return res.status(400).json({ error: 'sale_id requerido' });
    }

    if (!tipo) {
      return res.status(400).json({ error: 'tipo requerido (A, B o C)' });
    }

    const resultado = await afipSvc.emitirFactura({
      sale_id: Number(sale_id),
      tipo: String(tipo).trim().toUpperCase(),
      cliente: cliente || {},
    });

    res.json(resultado);
  } catch (e) {
    console.error('AFIP emitir error:', e.message);
    res.status(getAfipErrorStatus(e.message)).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /afip/factura/:sale_id
// Devuelve la factura emitida para una venta (o null)
// ─────────────────────────────────────────────────────────────
router.get('/factura/:sale_id', (req, res) => {
  try {
    const saleId = Number(req.params.sale_id);
    if (!saleId) {
      return res.status(400).json({ error: 'sale_id inválido' });
    }

    const factura = afipSvc.getFacturaBySaleId(saleId);
    if (!factura) {
      return res.json({ factura: null });
    }

    const cfg = configService.getAll();
    const qrUrl = afipSvc.generarQRData(factura, cfg.afip_cuit || '');

    res.json({ factura, qrUrl });
  } catch (e) {
    console.error('AFIP get factura error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /afip/facturas — listado para reporte / historial
// ─────────────────────────────────────────────────────────────
router.get('/facturas', (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const offsetRaw = parseInt(req.query.offset, 10);

    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 100;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const rows = afipSvc.listFacturas({ limit, offset });
    res.json({ facturas: rows });
  } catch (e) {
    console.error('AFIP list facturas error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /afip/test — verificar conexión con AFIP
// ─────────────────────────────────────────────────────────────
router.get('/test', ensureFacturacionHabilitada, async (req, res) => {
  try {
    const result = await afipSvc.testConexion();
    res.json(result);
  } catch (e) {
    console.error('AFIP test error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /afip/pdf/:sale_id — generar PDF de la factura
// ─────────────────────────────────────────────────────────────
router.get('/pdf/:sale_id', async (req, res) => {
  try {
    const saleId = Number(req.params.sale_id);
    if (!saleId) {
      return res.status(400).json({ error: 'sale_id inválido' });
    }

    const factura = afipSvc.getFacturaBySaleId(saleId);
    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const cfg = configService.getAll();
    const sale = get(`SELECT * FROM sales WHERE id = ?`, [saleId]);

    const items = all(
      `
      SELECT
        si.*,
        COALESCE(si.iva, p.iva, 0) AS iva_calc
      FROM sale_items si
      LEFT JOIN products p ON p.sku = si.sku
      WHERE si.sale_id = ?
      `,
      [saleId]
    );

    const qrUrl = afipSvc.generarQRData(factura, cfg.afip_cuit || '');

    const tipoLetra = { 1: 'A', 6: 'B', 11: 'C' }[factura.tipo_cbte] || '?';
    const caeVtoFmt = factura.cae_vto
      ? `${String(factura.cae_vto).slice(6, 8)}/${String(factura.cae_vto).slice(4, 6)}/${String(factura.cae_vto).slice(0, 4)}`
      : '';

    let PDFDocument;
    try {
      PDFDocument = require('pdfkit');
    } catch (e) {
      return res.status(500).json({
        error: 'pdfkit no instalado. Ejecutar: npm install pdfkit',
      });
    }

    const QRCode = require('qrcode');
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1 });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="factura-${tipoLetra}-${factura.nro_cbte}.pdf"`
    );

    doc.pipe(res);

    // Encabezado emisor
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .text(cfg.empresa_nombre || 'Mi Comercio', 50, 50);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(cfg.empresa_direccion || '', 50, 80)
      .text(`Tel: ${cfg.empresa_telefono || ''}`, 50, 93)
      .text(`Email: ${cfg.empresa_email || ''}`, 50, 106)
      .text(`CUIT: ${cfg.afip_cuit || ''}`, 50, 119)
      .text(`Cond. IVA: ${cfg.empresa_cond_iva || 'Responsable Inscripto'}`, 50, 132);

    // Caja tipo factura
    doc.rect(270, 45, 60, 60).stroke();
    doc
      .fontSize(36)
      .font('Helvetica-Bold')
      .text(tipoLetra, 270, 55, { width: 60, align: 'center' });

    doc
      .fontSize(9)
      .font('Helvetica')
      .text(`Cod: ${factura.tipo_cbte}`, 270, 93, { width: 60, align: 'center' });

    // Datos comprobante
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(`Punto de Venta: ${String(factura.punto_venta).padStart(4, '0')}`, 345, 50)
      .text(`Nro: ${String(factura.nro_cbte).padStart(8, '0')}`, 345, 65);

    doc
      .font('Helvetica')
      .text(
        `Fecha: ${new Date(factura.created_at).toLocaleDateString('es-AR')}`,
        345,
        80
      );

    doc.moveTo(50, 155).lineTo(545, 155).stroke();

    // Receptor
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Datos del Receptor', 50, 165);

    doc
      .font('Helvetica')
      .text(
        `Apellido y Nombre / Razón Social: ${factura.cliente_nombre || 'Consumidor Final'}`,
        50,
        180
      )
      .text(`CUIT/DNI: ${factura.cliente_cuit || '-'}`, 50, 195);

    doc.moveTo(50, 215).lineTo(545, 215).stroke();

    // Tabla items
    const colX = [50, 65, 300, 380, 470];

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Cant.', colX[0], 225)
      .text('Descripción', colX[1], 225)
      .text('Precio unit.', colX[2], 225, { width: 70, align: 'right' })
      .text('% IVA', colX[3], 225, { width: 45, align: 'right' })
      .text('Subtotal', colX[4], 225, { width: 60, align: 'right' });

    doc.moveTo(50, 237).lineTo(545, 237).dash(2).stroke().undash();

    let y = 245;
    doc.font('Helvetica').fontSize(9);

    for (const item of items) {
      const ivaItem = Number(item.iva_calc || 0);

      doc
        .text(item.qty, colX[0], y, { width: 25, align: 'right' })
        .text(item.name, colX[1], y, { width: 210 })
        .text(`$${Number(item.price || 0).toFixed(2)}`, colX[2], y, {
          width: 70,
          align: 'right',
        })
        .text(`${ivaItem}%`, colX[3], y, { width: 45, align: 'right' })
        .text(`$${Number(item.subtotal || 0).toFixed(2)}`, colX[4], y, {
          width: 60,
          align: 'right',
        });

      y += 16;
    }

    doc.moveTo(50, y + 4).lineTo(545, y + 4).stroke();
    y += 14;

    // Totales
    const totX = 380;
    doc.font('Helvetica').fontSize(10);

    if (Number(factura.importe_neto) > 0) {
      doc
        .text('Importe neto gravado:', totX, y)
        .text(`$${Number(factura.importe_neto).toFixed(2)}`, 480, y, {
          width: 65,
          align: 'right',
        });
      y += 15;

      doc
        .text('IVA:', totX, y)
        .text(`$${Number(factura.importe_iva).toFixed(2)}`, 480, y, {
          width: 65,
          align: 'right',
        });
      y += 15;
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('IMPORTE TOTAL:', totX, y)
      .text(`$${Number(factura.importe_total).toFixed(2)}`, 480, y, {
        width: 65,
        align: 'right',
      });

    y += 25;

    doc.moveTo(50, y).lineTo(545, y).stroke();
    y += 14;

    // QR + CAE
    doc.image(qrBuffer, 50, y, { width: 90 });

    doc.fontSize(9).font('Helvetica-Bold').text('CAE:', 155, y);
    doc.font('Helvetica-Oblique').text(factura.cae, 155, y + 13);

    doc.font('Helvetica-Bold').text('Fecha Vto. CAE:', 155, y + 26);
    doc.font('Helvetica').text(caeVtoFmt, 155, y + 39);

    if (sale) {
      doc.font('Helvetica-Bold').text('Venta:', 155, y + 56);
      doc.font('Helvetica').text(`#${sale.id}`, 155, y + 69);
    }

    doc
      .fontSize(7)
      .font('Helvetica')
      .text('Escanear QR para verificar en AFIP', 50, y + 94, {
        width: 90,
        align: 'center',
      });

    doc.end();
  } catch (e) {
    console.error('AFIP PDF error:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    }
  }
});

module.exports = router;