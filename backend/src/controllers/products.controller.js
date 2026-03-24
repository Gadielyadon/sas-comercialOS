const productsService = require('../services/products.service');

exports.list = (req, res) => {
  try {
    const { q, limit } = req.query;
    if (q) {
      return res.json(productsService.search(q, limit ? parseInt(limit, 10) : 8));
    }
    res.json(productsService.list());
  } catch (err) {
    console.error('products.controller.list =>', err);
    res.status(500).json({ error: 'Error al listar productos' });
  }
};

exports.create = (req, res) => {
  try {
    const {
      sku,
      name,
      price,
      category,
      stock,
      iva,
      ieps,
      pesable,
      descripcion,
      price_cost,
      margen,
      en_promo,
      price_promo,
      sucursal_id,
      imagen,
      price_mayorista, // ← AGREGADO
      qty_mayorista,   // ← AGREGADO
    } = req.body || {};

    if (!sku || !name || price === undefined) {
      return res.status(400).json({ error: 'sku, name y price son obligatorios' });
    }

    const created = productsService.create({
      sku: String(sku),
      name: String(name),
      price: Number(price),
      category: category !== undefined ? (category || null) : null,
      stock: stock === undefined ? 0 : Number(stock),
      iva: iva === undefined ? 0 : Number(iva),
      ieps: ieps === undefined ? 0 : Number(ieps),
      pesable: pesable ? 1 : 0,
      descripcion: descripcion !== undefined ? (descripcion || null) : null,
      price_cost: price_cost !== undefined && price_cost !== null && price_cost !== '' ? Number(price_cost) : null,
      margen: margen !== undefined && margen !== null && margen !== '' ? Number(margen) : null,
      en_promo: en_promo ? 1 : 0,
      price_promo: price_promo !== undefined && price_promo !== null && price_promo !== '' ? Number(price_promo) : null,
      sucursal_id: sucursal_id !== undefined ? Number(sucursal_id) : 1,
      imagen: imagen || null,
      price_mayorista: price_mayorista !== undefined && price_mayorista !== null && price_mayorista !== '' ? Number(price_mayorista) : null, // ← AGREGADO
      qty_mayorista:   qty_mayorista   !== undefined && qty_mayorista   !== null && qty_mayorista   !== '' ? Number(qty_mayorista)   : null, // ← AGREGADO
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('products.controller.create =>', err);

    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe un producto con ese SKU' });
    }

    res.status(500).json({ error: err.message || 'Error al crear producto' });
  }
};

exports.getBySku = (req, res) => {
  try {
    const row = productsService.findBySku(req.params.sku);
    if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(row);
  } catch (err) {
    console.error('products.controller.getBySku =>', err);
    res.status(500).json({ error: 'Error al buscar producto' });
  }
};

exports.update = (req, res) => {
  try {
    const sku = String(req.params.sku);
    const exists = productsService.findBySku(sku);

    if (!exists) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const {
      name,
      price,
      category,
      stock,
      iva,
      ieps,
      pesable,
      descripcion,
      price_cost,
      margen,
      en_promo,
      price_promo,
      sucursal_id,
      imagen,
      price_mayorista, // ← AGREGADO
      qty_mayorista,   // ← AGREGADO
    } = req.body || {};

    const updated = productsService.updateBySku(sku, {
      sku: name !== undefined ? (req.body.sku || sku) : undefined,
      name: name !== undefined ? String(name) : undefined,
      price: price !== undefined ? Number(price) : undefined,
      category: category !== undefined ? (category || null) : undefined,
      stock: stock !== undefined ? Number(stock) : undefined,
      iva: iva !== undefined ? Number(iva) : undefined,
      ieps: ieps !== undefined ? Number(ieps) : undefined,
      pesable: pesable !== undefined ? (pesable ? 1 : 0) : undefined,
      descripcion: descripcion !== undefined ? (descripcion || null) : undefined,
      price_cost:
        price_cost !== undefined
          ? (price_cost === null || price_cost === '' ? null : Number(price_cost))
          : undefined,
      margen:
        margen !== undefined
          ? (margen === null || margen === '' ? null : Number(margen))
          : undefined,
      en_promo: en_promo !== undefined ? (en_promo ? 1 : 0) : undefined,
      price_promo:
        price_promo !== undefined
          ? (price_promo === null || price_promo === '' ? null : Number(price_promo))
          : undefined,
      sucursal_id: sucursal_id !== undefined ? Number(sucursal_id) : undefined,
      imagen: imagen !== undefined ? imagen : undefined,
      price_mayorista: // ← AGREGADO
        price_mayorista !== undefined
          ? (price_mayorista === null || price_mayorista === '' ? null : Number(price_mayorista))
          : undefined,
      qty_mayorista:   // ← AGREGADO
        qty_mayorista !== undefined
          ? (qty_mayorista === null || qty_mayorista === '' ? null : Number(qty_mayorista))
          : undefined,
    });

    res.json(updated);
  } catch (err) {
    console.error('products.controller.update =>', err);
    res.status(500).json({ error: err.message || 'Error al editar producto' });
  }
};

exports.adjustStock = (req, res) => {
  try {
    const { delta } = req.body || {};

    if (delta === undefined || Number.isNaN(Number(delta))) {
      return res.status(400).json({ error: 'delta es obligatorio (número)' });
    }

    const result = productsService.adjustStock(String(req.params.sku), Number(delta));
    if (result.error) return res.status(400).json(result);

    res.json(result);
  } catch (err) {
    console.error('products.controller.adjustStock =>', err);
    res.status(500).json({ error: err.message || 'Error al ajustar stock' });
  }
};

exports.updateStock = exports.adjustStock;

exports.remove = (req, res) => {
  try {
    const ok = productsService.remove(req.params.sku);
    if (!ok) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('products.controller.remove =>', err);
    res.status(500).json({ error: err.message || 'Error al eliminar producto' });
  }
};

exports.exportCsv = (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.send(productsService.exportCsv());
  } catch (err) {
    console.error('products.controller.exportCsv =>', err);
    res.status(500).json({ error: 'Error al exportar CSV' });
  }
};
