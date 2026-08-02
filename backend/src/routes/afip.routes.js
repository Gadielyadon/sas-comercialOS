// src/routes/afip.routes.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

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
// POST /afip/certificados
// Recibe el contenido del .crt y/o .key (texto PEM), los guarda en la
// carpeta certs/ del proyecto y setea las rutas en la config. Así el
// certificado se sube desde Ajustes sin necesidad de SFTP.
// ─────────────────────────────────────────────────────────────
router.post('/certificados', (req, res) => {
  try {
    const { cert, key } = req.body || {};
    const certTxt = String(cert || '').trim();
    const keyTxt  = String(key  || '').trim();

    if (!certTxt && !keyTxt) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const certsDir = path.resolve(process.cwd(), 'certs');
    try { fs.mkdirSync(certsDir, { recursive: true }); } catch (_) {}

    const updates = {};

    if (certTxt) {
      if (!/-----BEGIN CERTIFICATE-----/.test(certTxt)) {
        return res.status(400).json({ error: 'El certificado no parece un .crt/.pem válido (falta "BEGIN CERTIFICATE").' });
      }
      fs.writeFileSync(path.join(certsDir, 'cert.crt'), certTxt, 'utf8');
      updates.afip_cert_path = 'certs/cert.crt';
    }

    if (keyTxt) {
      if (!/-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(keyTxt)) {
        return res.status(400).json({ error: 'La clave no parece una private key válida (falta "BEGIN PRIVATE KEY").' });
      }
      const keyPath = path.join(certsDir, 'private.key');
      fs.writeFileSync(keyPath, keyTxt, 'utf8');
      try { fs.chmodSync(keyPath, 0o600); } catch (_) {} // permisos restrictivos (Linux)
      updates.afip_key_path = 'certs/private.key';
    }

    configService.setMany(updates);
    res.json({ ok: true, ...updates });
  } catch (e) {
    console.error('AFIP certificados error:', e.message);
    res.status(500).json({ error: 'No se pudieron guardar los certificados: ' + e.message });
  }
});

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

    const { sale_id, tipo, cliente, servicio } = req.body;

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
      servicio: servicio || {},
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

    // Encabezado emisor — layout dinámico: si el nombre de la empresa es
    // largo, se ajusta el tamaño de letra y se reparte en varias líneas
    // en vez de superponerse con la caja de tipo de comprobante.
    const nombreEmpresa = cfg.empresa_nombre || 'Mi Comercio';
    const nombreFontSize = nombreEmpresa.length > 45 ? 12 : nombreEmpresa.length > 28 ? 15 : 20;
    const anchoNombre = 230;

    doc.fontSize(nombreFontSize).font('Helvetica-Bold');
    const altoNombre = doc.heightOfString(nombreEmpresa, { width: anchoNombre });
    doc.text(nombreEmpresa, 50, 50, { width: anchoNombre });

    let yEmisor = 50 + altoNombre + 8;
    doc.fontSize(10).font('Helvetica');
    for (const linea of [
      cfg.empresa_direccion || '',
      `Tel: ${cfg.empresa_telefono || ''}`,
      `Email: ${cfg.empresa_email || ''}`,
      `CUIT: ${cfg.afip_cuit || ''}`,
      `Cond. IVA: ${cfg.empresa_cond_iva || 'Responsable Inscripto'}`,
    ]) {
      doc.text(linea, 50, yEmisor, { width: anchoNombre });
      yEmisor += 13;
    }

    // Caja tipo factura — posición fija a la derecha, no depende del nombre
    doc.rect(300, 45, 55, 55).stroke();
    doc
      .fontSize(32)
      .font('Helvetica-Bold')
      .text(tipoLetra, 300, 54, { width: 55, align: 'center' });

    doc
      .fontSize(9)
      .font('Helvetica')
      .text(`Cod: ${factura.tipo_cbte}`, 300, 90, { width: 55, align: 'center' });

    // Datos comprobante
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(`Punto de Venta: ${String(factura.punto_venta).padStart(4, '0')}`, 370, 50)
      .text(`Nro: ${String(factura.nro_cbte).padStart(8, '0')}`, 370, 65);

    doc
      .font('Helvetica')
      .text(
        `Fecha: ${new Date(factura.created_at).toLocaleDateString('es-AR')}`,
        370,
        80
      );

    const ySepEncabezado = Math.max(yEmisor + 4, 112);
    doc.moveTo(50, ySepEncabezado).lineTo(545, ySepEncabezado).stroke();

    // Receptor
    let yReceptor = ySepEncabezado + 12;
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Datos del Receptor', 50, yReceptor);
    yReceptor += 15;

    doc
      .font('Helvetica')
      .text(
        `Apellido y Nombre / Razón Social: ${factura.cliente_nombre || 'Consumidor Final'}`,
        50,
        yReceptor
      );
    yReceptor += 15;

    doc.text(`CUIT/DNI: ${factura.cliente_cuit || '-'}`, 50, yReceptor);
    yReceptor += 15;

    // Período facturado — solo aparece si el comprobante es de Servicios
    // (Concepto 2), igual que en la factura que emite la web de ARCA.
    if (Number(factura.concepto) === 2) {
      const fmtFecha = (f) =>
        f ? `${String(f).slice(6, 8)}/${String(f).slice(4, 6)}/${String(f).slice(0, 4)}` : '-';

      doc.text(
        `Período facturado: ${fmtFecha(factura.fch_serv_desde)} al ${fmtFecha(factura.fch_serv_hasta)}`,
        50,
        yReceptor
      );
      yReceptor += 15;

      doc.text(`Fecha de Vto. para el pago: ${fmtFecha(factura.fch_vto_pago)}`, 50, yReceptor);
      yReceptor += 15;
    }

    yReceptor += 6;
    doc.moveTo(50, yReceptor).lineTo(545, yReceptor).stroke();

    // Tabla items
    const yTablaHeader = yReceptor + 10;
    const colX = [50, 65, 300, 380, 470];

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Cant.', colX[0], yTablaHeader)
      .text('Descripción', colX[1], yTablaHeader)
      .text('Precio unit.', colX[2], yTablaHeader, { width: 70, align: 'right' })
      .text('% IVA', colX[3], yTablaHeader, { width: 45, align: 'right' })
      .text('Subtotal', colX[4], yTablaHeader, { width: 60, align: 'right' });

    doc.moveTo(50, yTablaHeader + 12).lineTo(545, yTablaHeader + 12).dash(2).stroke().undash();

    let y = yTablaHeader + 20;
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


// ─────────────────────────────────────────────────────────────
// GET /afip/facturas.xlsx — exportar historial de facturas a Excel
// ─────────────────────────────────────────────────────────────
router.get('/facturas.xlsx', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { all } = require('../db');
    const { q, tipo } = req.query;

    let conditions = [];
    let params = [];
    if (tipo && ['A','B','C'].includes(tipo.toUpperCase())) {
      const tipoCbte = { A:1, B:6, C:11 }[tipo.toUpperCase()];
      conditions.push('f.tipo_cbte = ?');
      params.push(tipoCbte);
    }
    if (q) {
      conditions.push('(f.cae LIKE ? OR f.cliente_nombre LIKE ? OR f.cliente_cuit LIKE ? OR CAST(f.nro_cbte AS TEXT) LIKE ?)');
      params.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const facturas = all(`
      SELECT
        f.id, f.sale_id, f.tipo_cbte, f.punto_venta, f.nro_cbte,
        f.cae, f.cae_vto, f.importe_total, f.importe_neto, f.importe_iva,
        f.cliente_cuit, f.cliente_nombre, f.created_at,
        s.payment_method
      FROM facturas f
      LEFT JOIN sales s ON s.id = f.sale_id
      ${where}
      ORDER BY f.id DESC
    `, params);

    const wb = XLSX.utils.book_new();
    const tipoLetraMap = { 1:'A', 6:'B', 11:'C' };
    const fmt = n => Number(n || 0);

    // ── Hoja 1: Detalle de facturas ──
    const h1 = [['Fecha','Tipo','Punto de venta','Nro comprobante','Cliente','CUIT/Doc','Método pago',
      'Importe neto','IVA','Importe total','CAE','Vto. CAE','Venta N°']];

    facturas.forEach(f => {
      const fecha = f.created_at ? new Date(f.created_at.replace(' ','T')).toLocaleDateString('es-AR') : '';
      const letra = tipoLetraMap[f.tipo_cbte] || '?';
      const pvFmt = `${letra} ${String(f.punto_venta).padStart(4,'0')}-${String(f.nro_cbte).padStart(8,'0')}`;
      const caeVto = f.cae_vto
        ? `${String(f.cae_vto).slice(6,8)}/${String(f.cae_vto).slice(4,6)}/${String(f.cae_vto).slice(0,4)}`
        : '';
      h1.push([
        fecha,
        `Factura ${letra}`,
        f.punto_venta,
        pvFmt,
        f.cliente_nombre || 'Consumidor Final',
        f.cliente_cuit || '-',
        f.payment_method || '-',
        fmt(f.importe_neto),
        fmt(f.importe_iva),
        fmt(f.importe_total),
        f.cae,
        caeVto,
        f.sale_id,
      ]);
    });

    const ws1 = XLSX.utils.aoa_to_sheet(h1);
    ws1['!cols'] = [{wch:12},{wch:11},{wch:13},{wch:26},{wch:28},{wch:16},{wch:14},{wch:14},{wch:10},{wch:14},{wch:18},{wch:12},{wch:9}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Facturas');

    // ── Hoja 2: Resumen por tipo ──
    const tipoMap = { A:{cantidad:0,neto:0,iva:0,total:0}, B:{cantidad:0,neto:0,iva:0,total:0}, C:{cantidad:0,neto:0,iva:0,total:0} };
    facturas.forEach(f => {
      const t = tipoLetraMap[f.tipo_cbte] || 'A';
      if (tipoMap[t]) {
        tipoMap[t].cantidad++;
        tipoMap[t].neto  += fmt(f.importe_neto);
        tipoMap[t].iva   += fmt(f.importe_iva);
        tipoMap[t].total += fmt(f.importe_total);
      }
    });
    const h2 = [['Tipo','Cantidad','Importe neto','IVA','Total']];
    ['A','B','C'].forEach(t => {
      const d = tipoMap[t];
      if (d.cantidad > 0) h2.push([`Factura ${t}`, d.cantidad, d.neto, d.iva, d.total]);
    });
    h2.push(['TOTAL', facturas.length,
      facturas.reduce((s,f)=>s+fmt(f.importe_neto),0),
      facturas.reduce((s,f)=>s+fmt(f.importe_iva),0),
      facturas.reduce((s,f)=>s+fmt(f.importe_total),0)
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet(h2);
    ws2['!cols'] = [{wch:12},{wch:10},{wch:14},{wch:12},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por tipo');

    const fecha = new Date().toISOString().split('T')[0];
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="facturas-${fecha}.xlsx"`);
    res.send(buf);
  } catch(e) {
    console.error('AFIP facturas xlsx =>', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;