// src/services/afip.service.js
// Integración con ARCA (ex AFIP) — Factura Electrónica
// Compatible con Windows — usa: soap + node-forge
// Requiere: npm install soap node-forge pdfkit qrcode

const path = require('path');
const fs = require('fs');
const forge = require('node-forge');
const soap = require('soap');
const { get, all, run } = require('../db');
const configService = require('./config.service');

const URLS = {
  homo: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
  },
  prod: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
  },
};

const TIPO_CBTE = {
  A: 1,
  B: 6,
  C: 11,
};

const DOC_TIPO = {
  CUIT: 80,
  DNI: 96,
  CF: 99,
};

const ALICUOTA_IVA = {
  0: 3,
  2.5: 9,
  5: 8,
  10.5: 4,
  21: 5,
  27: 6,
};

const COND_IVA_RECEPTOR = {
  'iva responsable inscripto': 1,
  'responsable inscripto': 1,
  'iva sujeto exento': 4,
  exento: 4,
  'consumidor final': 5,
  'responsable monotributo': 6,
  monotributo: 6,
  monotributista: 6,
  'monotributo social': 13,
  'iva no alcanzado': 15,
};

let _tokenCache = Object.create(null);

function initAfipSchema() {
  run(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS facturas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id         INTEGER NOT NULL,
      tipo_cbte       INTEGER NOT NULL,
      punto_venta     INTEGER NOT NULL,
      nro_cbte        INTEGER NOT NULL,
      cae             TEXT    NOT NULL,
      cae_vto         TEXT    NOT NULL,
      importe_total   REAL    NOT NULL,
      importe_neto    REAL    NOT NULL,
      importe_iva     REAL    NOT NULL,
      cliente_cuit    TEXT,
      cliente_nombre  TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    )
  `);

  const defaults = [
    ['facturacion_habilitada', '0'],
    ['afip_cuit', ''],
    ['afip_punto_venta', '1'],
    ['afip_cert_path', 'certs/cert.crt'],
    ['afip_key_path', 'certs/private.key'],
    ['afip_env', 'homologacion'],
    ['empresa_cond_iva', 'Responsable Inscripto'],
  ];

  for (const [k, v] of defaults) {
    try {
      run(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`, [k, v]);
    } catch (_) {}
  }
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function yyyymmddLocal(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function fmtAfipDateTime(d) {
  const pad = (n, l = 2) => String(n).padStart(l, '0');

  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
}

function xmlTagValue(xml, tagName) {
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = String(xml || '').match(re);
  return match ? match[1].trim() : '';
}

async function withTemporaryInsecureTls(fn) {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}

function columnExists(table, col) {
  try {
    return all(`PRAGMA table_info(${table})`).some((c) => c.name === col);
  } catch (_) {
    return false;
  }
}

function leerConfig() {
  const cfg = configService.getAll();

  const cuit = String(cfg.afip_cuit || '').replace(/\D/g, '');
  const produccion = cfg.afip_env === 'produccion';
  const puntoVenta = parseInt(cfg.afip_punto_venta, 10) || 1;
  const condicionIvaEmisor = String(cfg.empresa_cond_iva || '').trim();

  const certPath = path.resolve(
    process.cwd(),
    cfg.afip_cert_path || (produccion ? 'certs/cert-prod.crt' : 'certs/cert-homo.crt')
  );

  const keyPath = path.resolve(
    process.cwd(),
    cfg.afip_key_path || (produccion ? 'certs/private-prod.key' : 'certs/private-homo.key')
  );

  if (!cuit) throw new Error('CUIT no configurado en Ajustes → AFIP');
  if (!fs.existsSync(certPath)) throw new Error(`Certificado no encontrado: ${certPath}`);
  if (!fs.existsSync(keyPath)) throw new Error(`Clave privada no encontrada: ${keyPath}`);

  return {
    cuit,
    certPath,
    keyPath,
    produccion,
    puntoVenta,
    condicionIvaEmisor,
  };
}

function facturacionHabilitada() {
  const cfg = configService.getAll();
  return String(cfg.facturacion_habilitada || '0') === '1';
}

async function obtenerToken(certPath, keyPath, produccion) {
  const cacheKey = `${certPath}|${keyPath}|${produccion ? 'prod' : 'homo'}`;
  const cached = _tokenCache[cacheKey];

  if (cached && new Date(cached.expira) > new Date(Date.now() + 5 * 60 * 1000)) {
    return { token: cached.token, sign: cached.sign };
  }

  const certPem = fs.readFileSync(certPath, 'utf8');
  const keyPem = fs.readFileSync(keyPath, 'utf8');

  const firstCertMatch = certPem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/
  );
  if (!firstCertMatch) {
    throw new Error('No se encontró un certificado PEM válido en el archivo .crt');
  }

  const now = new Date();
  const generationTime = fmtAfipDateTime(new Date(now.getTime() - 5 * 60 * 1000));
  const expirationTime = fmtAfipDateTime(new Date(now.getTime() + 12 * 60 * 60 * 1000));

  const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;

  const cert = forge.pki.certificateFromPem(firstCertMatch[0]);
  const privKey = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();

  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key: privKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });

  p7.sign();

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const cmsBase64 = forge.util.encode64(der);
  const wsaaUrl = produccion ? URLS.prod.wsaa : URLS.homo.wsaa;

  const [result] = await withTemporaryInsecureTls(async () => {
    const client = await soap.createClientAsync(wsaaUrl);
    return client.loginCmsAsync({ in0: cmsBase64 });
  });

  const xml = result?.loginCmsReturn || '';
  const token = xmlTagValue(xml, 'token');
  const sign = xmlTagValue(xml, 'sign');
  const expira = xmlTagValue(xml, 'expirationTime') || expirationTime;

  if (!token || !sign) {
    throw new Error('WSAA no devolvió token/sign válidos');
  }

  _tokenCache[cacheKey] = { token, sign, expira };
  return { token, sign };
}

function getSaleItemsForAfip(sale_id) {
  const hasSaleItemsIva = columnExists('sale_items', 'iva');
  const hasProductsIva = columnExists('products', 'iva');

  if (hasSaleItemsIva && hasProductsIva) {
    return all(
      `
      SELECT si.*, COALESCE(si.iva, p.iva, 0) AS product_iva
      FROM sale_items si
      LEFT JOIN products p ON p.sku = si.sku
      WHERE si.sale_id = ?
      `,
      [sale_id]
    );
  }

  if (hasSaleItemsIva) {
    return all(
      `
      SELECT si.*, si.iva AS product_iva
      FROM sale_items si
      WHERE si.sale_id = ?
      `,
      [sale_id]
    );
  }

  if (hasProductsIva) {
    return all(
      `
      SELECT si.*, COALESCE(p.iva, 0) AS product_iva
      FROM sale_items si
      LEFT JOIN products p ON p.sku = si.sku
      WHERE si.sale_id = ?
      `,
      [sale_id]
    );
  }

  return all(`SELECT * FROM sale_items WHERE sale_id = ?`, [sale_id]);
}

function resolveItemSubtotal(item) {
  if (item.subtotal !== undefined && item.subtotal !== null && item.subtotal !== '') {
    return round2(Number(item.subtotal));
  }
  return round2(Number(item.price || 0) * Number(item.qty || 0));
}

function resolveItemIvaPct(item) {
  const raw =
    item.iva !== undefined && item.iva !== null && item.iva !== ''
      ? item.iva
      : item.product_iva;

  if (raw === undefined || raw === null || raw === '') {
    throw new Error(
      `El item ${item.sku || item.name || item.description || 'sin identificar'} no tiene IVA definido`
    );
  }

  const ivaPct = Number(raw);
  if (Number.isNaN(ivaPct)) {
    throw new Error(
      `El IVA del item ${item.sku || item.name || item.description || 'sin identificar'} no es válido`
    );
  }

  return ivaPct;
}

function calcularImportes(items, tipoCbte) {
  if (tipoCbte === TIPO_CBTE.C) {
    const subtotal = items.reduce((acc, item) => acc + resolveItemSubtotal(item), 0);

    return {
      importeNeto: round2(subtotal),
      importeIva: 0,
      importeExento: 0,
      importeTotal: round2(subtotal),
      ivaArray: [],
      discriminaIva: false,
    };
  }

  let importeNeto = 0;
  let importeIva = 0;
  let importeExento = 0;
  const ivaMap = {};

  for (const item of items) {
    const subtotal = resolveItemSubtotal(item);
    const ivaPct = resolveItemIvaPct(item);

    if (ivaPct === 0) {
      importeExento += subtotal;
      continue;
    }

    // Se asume que el precio/subtotal viene con IVA incluido
    const netoLinea = round2(subtotal / (1 + ivaPct / 100));
    const ivaLinea = round2(subtotal - netoLinea);

    importeNeto += netoLinea;
    importeIva += ivaLinea;

    const alicId = ALICUOTA_IVA[ivaPct];
    if (!alicId) {
      throw new Error(`Alícuota IVA no soportada: ${ivaPct}%`);
    }

    if (!ivaMap[alicId]) {
      ivaMap[alicId] = { Id: alicId, BaseImp: 0, Importe: 0 };
    }

    ivaMap[alicId].BaseImp += netoLinea;
    ivaMap[alicId].Importe += ivaLinea;
  }

  return {
    importeNeto: round2(importeNeto),
    importeIva: round2(importeIva),
    importeExento: round2(importeExento),
    importeTotal: round2(importeNeto + importeIva + importeExento),
    ivaArray: Object.values(ivaMap).map((v) => ({
      Id: v.Id,
      BaseImp: round2(v.BaseImp),
      Importe: round2(v.Importe),
    })),
    discriminaIva: true,
  };
}

function validarTipoSegunCondicionIVA(tipoLetra, condicionIvaEmisor, produccion) {
  if (!produccion) return;

  const tipo = String(tipoLetra || '').toUpperCase();
  const cond = String(condicionIvaEmisor || '').trim().toLowerCase();

  if (cond.includes('responsable inscripto')) {
    if (!['A', 'B'].includes(tipo)) {
      throw new Error('Un emisor Responsable Inscripto solo puede emitir A o B');
    }
    return;
  }

  if (cond.includes('monotrib')) {
    if (tipo !== 'C') {
      throw new Error('Un emisor Monotributista solo puede emitir comprobantes C');
    }
    return;
  }

  if (cond.includes('exento')) {
    if (tipo !== 'C') {
      throw new Error('Un emisor Exento solo puede emitir comprobantes C');
    }
  }
}

function buildDocInfo(cliente = {}) {
  const explicitDocTipo = cliente.docTipo ?? cliente.doc_type ?? cliente.tipoDoc;
  const rawDoc =
    cliente.cuit ??
    cliente.doc_nro ??
    cliente.docNro ??
    cliente.dni ??
    '';

  const digits = String(rawDoc).replace(/\D/g, '');

  if (!digits) {
    return { DocTipo: DOC_TIPO.CF, DocNro: 0 };
  }

  if (explicitDocTipo !== undefined && explicitDocTipo !== null && explicitDocTipo !== '') {
    return {
      DocTipo: Number(explicitDocTipo),
      DocNro: Number(digits),
    };
  }

  if (digits.length === 11) {
    return { DocTipo: DOC_TIPO.CUIT, DocNro: Number(digits) };
  }

  if (digits.length === 7 || digits.length === 8) {
    return { DocTipo: DOC_TIPO.DNI, DocNro: Number(digits) };
  }

  return { DocTipo: DOC_TIPO.CF, DocNro: 0 };
}

function inferCondicionIVAReceptorId(
  tipoLetra,
  cliente = {},
  docInfo = { DocTipo: 99, DocNro: 0 }
) {
  if (
    cliente.condicionIVAReceptorId !== undefined &&
    cliente.condicionIVAReceptorId !== null &&
    cliente.condicionIVAReceptorId !== ''
  ) {
    return Number(cliente.condicionIVAReceptorId);
  }

  const condRaw = String(
    cliente.condicion_iva || cliente.condicionIVA || cliente.cond_iva || ''
  )
    .trim()
    .toLowerCase();

  if (condRaw && COND_IVA_RECEPTOR[condRaw] !== undefined) {
    return COND_IVA_RECEPTOR[condRaw];
  }

  if (tipoLetra === 'A') return 1;
  if (docInfo.DocTipo === DOC_TIPO.CF && docInfo.DocNro === 0) return 5;

  return 5;
}

function validarDatosClienteParaTipo(tipoLetra, cliente, docInfo) {
  if (tipoLetra === 'A') {
    if (docInfo.DocTipo !== DOC_TIPO.CUIT || !docInfo.DocNro) {
      throw new Error('Para Factura A debés informar CUIT del cliente');
    }
  }

  if ((tipoLetra === 'B' || tipoLetra === 'C') && cliente?.cuit) {
    const cuit = String(cliente.cuit).replace(/\D/g, '');
    if (cuit.length !== 11) {
      throw new Error('El CUIT del cliente no es válido');
    }
  }
}

async function validarPuntoVenta(client, Auth, puntoVenta) {
  const [res] = await withTemporaryInsecureTls(() =>
    client.FEParamGetPtosVentaAsync({ Auth })
  );

  const resultGet = res?.FEParamGetPtosVentaResult?.ResultGet;
  const puntos = normalizeArray(resultGet);

  const existe = puntos.some((p) => Number(p?.PtoVta) === Number(puntoVenta));
  if (!existe) {
    throw new Error(
      `El punto de venta ${puntoVenta} no está habilitado en ARCA para esta CUIT`
    );
  }
}

function extraerMensajesAfip(resp) {
  const r = resp?.FECAESolicitarResult || {};
  const detResp = r?.FeDetResp?.FECAEDetResponse;
  const det = Array.isArray(detResp) ? detResp[0] : detResp;

  return {
    resultado: r?.FeCabResp?.Resultado || det?.Resultado || '',
    errores: normalizeArray(r?.Errors?.Err).map((e) => `[${e.Code}] ${e.Msg}`),
    eventos: normalizeArray(r?.Events?.Evt).map((e) => `[${e.Code}] ${e.Msg}`),
    observaciones: normalizeArray(det?.Observaciones?.Obs).map((o) => `[${o.Code}] ${o.Msg}`),
    detalle: det || {},
  };
}

async function emitirFactura({ sale_id, tipo, cliente }) {
  if (!facturacionHabilitada()) {
    throw new Error('La facturación electrónica está deshabilitada en Ajustes');
  }

  const {
    cuit,
    certPath,
    keyPath,
    produccion,
    puntoVenta,
    condicionIvaEmisor,
  } = leerConfig();

  const tipoLetra = String(tipo || '').trim().toUpperCase();
  const tipoCbte = TIPO_CBTE[tipoLetra];

  if (!tipoCbte) {
    throw new Error(`Tipo inválido: ${tipo}. Usar A, B o C`);
  }

  validarTipoSegunCondicionIVA(tipoLetra, condicionIvaEmisor, produccion);

  const yaFacturado = get(`SELECT id FROM facturas WHERE sale_id = ?`, [sale_id]);
  if (yaFacturado) throw new Error('Esta venta ya tiene factura emitida');

  const sale = get(`SELECT * FROM sales WHERE id = ?`, [sale_id]);
  if (!sale) throw new Error(`Venta #${sale_id} no encontrada`);

  const items = getSaleItemsForAfip(sale_id);
  if (!items.length) {
    throw new Error('La venta no tiene items');
  }

  const docInfo = buildDocInfo(cliente || {});
  validarDatosClienteParaTipo(tipoLetra, cliente || {}, docInfo);

  const { token, sign } = await obtenerToken(certPath, keyPath, produccion);
  const Auth = {
    Token: token,
    Sign: sign,
    Cuit: parseInt(cuit, 10),
  };

  const wsfeUrl = produccion ? URLS.prod.wsfe : URLS.homo.wsfe;
  const client = await withTemporaryInsecureTls(() => soap.createClientAsync(wsfeUrl));

  await validarPuntoVenta(client, Auth, puntoVenta);

  const [ultimoRes] = await withTemporaryInsecureTls(() =>
    client.FECompUltimoAutorizadoAsync({
      Auth,
      PtoVta: puntoVenta,
      CbteTipo: tipoCbte,
    })
  );

  const ultimoAutorizado = Number(
    ultimoRes?.FECompUltimoAutorizadoResult?.CbteNro ??
      ultimoRes?.CbteNro ??
      0
  );

  const nroCbte = ultimoAutorizado + 1;
  const hoy = yyyymmddLocal();
  const imp = calcularImportes(items, tipoCbte);

  const detalle = {
    Concepto: 1,
    DocTipo: docInfo.DocTipo,
    DocNro: docInfo.DocNro,
    CbteDesde: nroCbte,
    CbteHasta: nroCbte,
    CbteFch: hoy,
    ImpTotal: imp.importeTotal,
    ImpTotConc: 0,
    ImpNeto: imp.importeNeto,
    ImpOpEx: imp.importeExento,
    ImpIVA: imp.importeIva,
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: inferCondicionIVAReceptorId(tipoLetra, cliente || {}, docInfo),
  };

  if (imp.discriminaIva && imp.ivaArray.length > 0) {
    detalle.Iva = { AlicIva: imp.ivaArray };
  }

  const [caeResp] = await withTemporaryInsecureTls(() =>
    client.FECAESolicitarAsync({
      Auth,
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: puntoVenta,
          CbteTipo: tipoCbte,
        },
        FeDetReq: {
          FECAEDetRequest: [detalle],
        },
      },
    })
  );

  const afipMsg = extraerMensajesAfip(caeResp);
  const det = afipMsg.detalle;

  if (!det?.CAE || afipMsg.resultado === 'R') {
    const mensajes = [
      ...afipMsg.errores,
      ...afipMsg.observaciones,
      ...afipMsg.eventos,
    ].filter(Boolean);

    throw new Error(
      `AFIP rechazó el comprobante: ${mensajes.join(' | ') || 'Sin detalle en respuesta'}`
    );
  }

  run(
    `
    INSERT INTO facturas
      (sale_id, tipo_cbte, punto_venta, nro_cbte, cae, cae_vto,
       importe_total, importe_neto, importe_iva, cliente_cuit, cliente_nombre)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `,
    [
      sale_id,
      tipoCbte,
      puntoVenta,
      nroCbte,
      det.CAE,
      det.CAEFchVto,
      imp.importeTotal,
      imp.importeNeto,
      imp.importeIva,
      cliente?.cuit ? String(cliente.cuit).replace(/\D/g, '') : null,
      cliente?.nombre || 'Consumidor Final',
    ]
  );

  const factura = get(`SELECT * FROM facturas WHERE sale_id = ?`, [sale_id]);

  return {
    ok: true,
    cae: det.CAE,
    cae_vto: det.CAEFchVto,
    nro_cbte: nroCbte,
    punto_venta: puntoVenta,
    tipo_cbte: tipoCbte,
    tipo_letra: tipoLetra,
    importe: imp,
    observaciones_afip: afipMsg.observaciones,
    eventos_afip: afipMsg.eventos,
    factura,
  };
}

function getFacturaBySaleId(sale_id) {
  return get(`SELECT * FROM facturas WHERE sale_id = ?`, [Number(sale_id)]);
}

function listFacturas({ limit = 50, offset = 0 } = {}) {
  return all(
    `
    SELECT
      f.*,
      s.payment_method,
      s.created_at as venta_fecha,
      c.nombre as cliente_nombre_db
    FROM facturas f
    LEFT JOIN sales s    ON s.id = f.sale_id
    LEFT JOIN clientes c ON c.id = s.cliente_id
    ORDER BY f.id DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );
}

function generarQRData(factura, cuit_emisor) {
  const fecha = String(factura.created_at || '').slice(0, 10);

  const data = {
    ver: 1,
    fecha,
    cuit: parseInt(String(cuit_emisor || '').replace(/\D/g, ''), 10),
    ptoVta: Number(factura.punto_venta),
    tipoCmp: Number(factura.tipo_cbte),
    nroCmp: Number(factura.nro_cbte),
    importe: round2(Number(factura.importe_total)),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: factura.cliente_cuit ? 80 : 99,
    nroDocRec: factura.cliente_cuit
      ? parseInt(String(factura.cliente_cuit).replace(/\D/g, ''), 10)
      : 0,
    tipoCodAut: 'E',
    codAut: parseInt(factura.cae, 10),
  };

  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(
    JSON.stringify(data)
  ).toString('base64')}`;
}

async function testConexion() {
  try {
    const { produccion } = leerConfig();
    const wsfeUrl = produccion ? URLS.prod.wsfe : URLS.homo.wsfe;

    const client = await withTemporaryInsecureTls(() => soap.createClientAsync(wsfeUrl));
    const [res] = await withTemporaryInsecureTls(() => client.FEDummyAsync({}));

    const status = res?.FEDummyResult || {};

    return {
      ok: true,
      appserver: status.AppServer,
      dbserver: status.DbServer,
      authserver: status.AuthServer,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
    };
  }
}

module.exports = {
  initAfipSchema,
  emitirFactura,
  getFacturaBySaleId,
  listFacturas,
  generarQRData,
  testConexion,
  facturacionHabilitada,
  TIPO_CBTE,
};