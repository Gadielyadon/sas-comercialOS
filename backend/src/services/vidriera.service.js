// src/services/vidriera.service.js
// Vidriera digital: catálogo público (sin login) para que los clientes del
// negocio vean los productos y arme su pedido, que termina en un solo
// mensaje de WhatsApp. Reusa la tabla `config` (key/value) que ya existe.
//
// Los productos pueden venir de DOS fuentes, a elección del cliente
// (vidriera_origen):
//  - 'inventario' → usa el Inventario real (products), respetando el
//    toggle "Publicar en la vidriera digital" de cada producto.
//  - 'propio'     → catálogo 100% independiente, en su propia tabla
//    (catalogo_productos), sin tocar nunca la base del Inventario.
const configService = require('../services/config.service');
const productsService = require('./products.service');
const catalogoProductosService = require('./catalogo_productos.service');

const DEFAULTS = {
  vidriera_activa: '0',
  vidriera_whatsapp: '',
  vidriera_mostrar_precios: '1',
  vidriera_portada: '',
  vidriera_mensaje: 'Hola! Te quiero hacer este pedido:',
  vidriera_color_acento: '#1B4FD8',
  vidriera_color_fondo: '#0C0E14',
  vidriera_origen: 'propio', // 'propio' | 'inventario'
};

function getSettings() {
  const cfg = configService.getAll();
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    out[key] = cfg[key] !== undefined && cfg[key] !== '' ? cfg[key] : DEFAULTS[key];
  }
  out.activa = out.vidriera_activa === '1';
  out.mostrarPrecios = out.vidriera_mostrar_precios === '1';
  out.esInventario = out.vidriera_origen === 'inventario';
  return out;
}

function saveSettings(fields) {
  const permitido = [
    'vidriera_activa', 'vidriera_whatsapp', 'vidriera_mostrar_precios',
    'vidriera_portada', 'vidriera_mensaje', 'vidriera_color_acento', 'vidriera_color_fondo', 'vidriera_origen',
  ];
  const toSave = {};
  for (const key of permitido) {
    if (fields[key] !== undefined) toSave[key] = fields[key];
  }
  configService.setMany(toSave);
  return getSettings();
}

// Normaliza productos del Inventario (name/category/price/price_promo)
// al mismo formato que usa el catálogo propio (nombre/categoria/precio/precio_promo),
// para que la vista no tenga que saber de dónde vino cada producto.
function normalizarDesdeInventario(p) {
  return {
    id: p.sku,
    nombre: p.name,
    categoria: p.category,
    precio: p.price,
    en_promo: p.en_promo,
    precio_promo: p.price_promo,
    imagen: p.imagen,
    precio_efectivo: p.precio_efectivo,
    descripcion: p.descripcion || null,
    imagenes: p.imagen ? [p.imagen] : [],
  };
}

// Arma el catálogo agrupado por categoría, listo para renderizar.
// Separa aparte los productos en promoción para destacarlos arriba de todo.
function getCatalogo() {
  const settings = getSettings();
  const origen = settings.vidriera_origen || 'propio';

  const productosPropios = () => catalogoProductosService.listPublico().map(p => ({
    ...p,
    precio_efectivo: (p.en_promo && p.precio_promo) ? p.precio_promo : p.precio,
  }));
  const productosInventario = () => productsService.listVidriera(1).map(normalizarDesdeInventario);

  let productos;
  if (origen === 'inventario') {
    productos = productosInventario();
  } else if (origen === 'ambos') {
    productos = [...productosInventario(), ...productosPropios()];
  } else {
    productos = productosPropios();
  }

  const grupos = {};
  const promos = [];
  for (const p of productos) {
    const cat = (p.categoria || 'Otros').trim() || 'Otros';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(p);
    if (p.en_promo && p.precio_promo) promos.push(p);
  }
  const categorias = Object.keys(grupos).sort().map(nombre => ({ nombre, productos: grupos[nombre] }));
  return { categorias, promos };
}

module.exports = { getSettings, saveSettings, getCatalogo };
