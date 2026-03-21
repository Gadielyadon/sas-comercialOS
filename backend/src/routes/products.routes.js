const express = require('express');
const router = express.Router();
const productsService = require('../services/products.service');

// GET /api/products?q=&limit=
router.get('/', (req, res) => {
  try {
    const { q, limit } = req.query;

    if (q) {
      const l = limit ? parseInt(limit, 10) : 10;
      const results = productsService
        .list()
        .filter(
          (p) =>
            String(p.name || '').toLowerCase().includes(String(q).toLowerCase()) ||
            String(p.sku || '').toLowerCase().includes(String(q).toLowerCase())
        )
        .slice(0, l);

      return res.json(results);
    }

    res.json(productsService.list());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/products/:sku
router.get('/:sku', (req, res) => {
  try {
    const product = productsService.findBySku(req.params.sku);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar producto' });
  }
});

// POST /api/products
router.post('/', (req, res) => {
  try {
    const {
      sku,
      name,
      price,
      category,
      stock,
      iva = 0,
      ieps = 0,
      pesable = 0,
      descripcion = null,
      sucursal_id = 1,
      price_cost = null,
      margen = null,
      price_promo = null,
      en_promo = 0,
      imagen = null,
    } = req.body || {};

    if (!sku || !name || price === undefined || stock === undefined) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const product = productsService.create({
      sku,
      name,
      price,
      category,
      stock,
      iva,
      ieps,
      pesable,
      descripcion,
      sucursal_id,
      price_cost,
      margen,
      price_promo,
      en_promo,
      imagen,
    });

    res.status(201).json(product);
  } catch (err) {
    console.error(err);

    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe un producto con ese SKU' });
    }

    res.status(500).json({ error: err.message || 'Error al crear producto' });
  }
});

// PUT /api/products/:sku
router.put('/:sku', (req, res) => {
  try {
    const { sku } = req.params;
    const existing = productsService.findBySku(sku);

    if (!existing) {
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
      price_promo,
      en_promo,
      sucursal_id,
      imagen,
    } = req.body || {};

    const updated = productsService.updateBySku(sku, {
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
      price_promo,
      en_promo,
      sucursal_id,
      imagen: imagen !== undefined ? imagen : undefined,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al editar producto' });
  }
});

// PATCH /api/products/:sku/stock
router.patch('/:sku/stock', (req, res) => {
  try {
    const { delta } = req.body || {};
    if (delta === undefined) {
      return res.status(400).json({ error: 'Falta delta' });
    }

    const result = productsService.adjustStock(req.params.sku, Number(delta));
    if (result.error) return res.status(400).json(result);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al ajustar stock' });
  }
});

// POST /api/products/:sku/imagen  — guarda base64 directo en la DB
router.post('/:sku/imagen', (req, res) => {
  try {
    const { sku } = req.params;
    const { imagen } = req.body || {};

    if (!imagen) return res.status(400).json({ error: 'Falta imagen' });

    // Validar que sea base64 de imagen
    if (!imagen.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Formato inválido, debe ser base64 de imagen' });
    }

    const existing = productsService.findBySku(sku);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    const updated = productsService.updateBySku(sku, { imagen });
    res.json({ ok: true, imagen: updated.imagen });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar imagen' });
  }
});

// DELETE /api/products/:sku/imagen  — elimina la imagen
router.delete('/:sku/imagen', (req, res) => {
  try {
    const { sku } = req.params;
    const existing = productsService.findBySku(sku);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    productsService.updateBySku(sku, { imagen: null });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar imagen' });
  }
});

// DELETE /api/products/:sku
router.delete('/:sku', (req, res) => {
  try {
    const removed = productsService.remove(req.params.sku);
    if (!removed) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

module.exports = router;