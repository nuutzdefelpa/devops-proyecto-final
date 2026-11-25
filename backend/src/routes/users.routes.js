const express = require('express');
const bcrypt = require('bcryptjs');
const { dbAll, dbGet, dbRun } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (_req, res, next) => {
  try {
    const users = await dbAll(
      'SELECT id, name, email, role, created_at FROM users ORDER BY id DESC'
    );
    return res.json(users);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = await dbGet(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json(user);
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role = 'user' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, correo y contraseña son requeridos' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ error: 'El correo ya existe' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await dbRun(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name.trim(), normalizedEmail, hash, role]
    );

    const created = await dbGet(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [result.id]
    );
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

    const newName = name ? name.trim() : existing.name;
    const newEmail = email ? email.trim().toLowerCase() : existing.email;
    const newRole = role || existing.role;
    const newHash = password ? await bcrypt.hash(password, 10) : existing.password_hash;

    const duplicate = await dbGet(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [newEmail, req.params.id]
    );
    if (duplicate) {
      return res.status(409).json({ error: 'El correo ya está en uso por otro usuario' });
    }

    await dbRun(
      'UPDATE users SET name = ?, email = ?, password_hash = ?, role = ? WHERE id = ?',
      [newName, newEmail, newHash, newRole, req.params.id]
    );

    const updated = await dbGet(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    return res.json({ message: 'Usuario eliminado', id: Number(req.params.id) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;