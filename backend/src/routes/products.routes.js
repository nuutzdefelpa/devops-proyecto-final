const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (_req, res, next) => {
  try {
    const products = await dbAll('SELECT * FROM products ORDER BY id DESC');
    return res.json(products);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    return res.json(product);
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, description = '', price, stock = 0 } = req.body;
    if (!name || price === undefined || price === null || Number.isNaN(Number(price))) {
      return res.status(400).json({ error: 'Nombre y precio válido son requeridos' });
    }

    const numPrice = Number(price);
    const numStock = Number(stock);
    if (numPrice < 0 || Number.isNaN(numStock) || numStock < 0) {
      return res.status(400).json({ error: 'Precio y stock deben ser mayores o iguales a 0' });
    }

    const result = await dbRun(
      'INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)',
      [name.trim(), description.trim(), numPrice, Math.floor(numStock)]
    );

    const created = await dbGet('SELECT * FROM products WHERE id = ?', [result.id]);
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    const { name, description, price, stock } = req.body;
    const newName = name !== undefined ? name.trim() : existing.name;
    const newDescription = description !== undefined ? description.trim() : existing.description;
    const newPrice = price !== undefined ? Number(price) : existing.price;
    const newStock = stock !== undefined ? Math.floor(Number(stock)) : existing.stock;

    if (!newName || Number.isNaN(newPrice) || newPrice < 0 || Number.isNaN(newStock) || newStock < 0) {
      return res.status(400).json({ error: 'Datos de producto inválidos' });
    }

    await dbRun(
      'UPDATE products SET name = ?, description = ?, price = ?, stock = ? WHERE id = ?',
      [newName, newDescription, newPrice, newStock, req.params.id]
    );

    const updated = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    return res.json({ message: 'Producto eliminado', id: Number(req.params.id) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;