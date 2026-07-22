const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

const router = express.Router();

const VALID_ROLES = ['admin', 'purchase', 'warehouse', 'sales', 'view'];
const SALT_ROUNDS = 10;

const userFields = ['id', 'name', 'email', 'role', 'is_active', 'created_at'];

// GET /api/users — list all users
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const users = await db('users').select(userFields).orderBy('id');
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

// POST /api/users — create user
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, email, role, password } = req.body;
    if (!name || !email || !role || !password) {
      return res.status(400).json({ success: false, error: 'name, email, role, and password are required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const existing = await db('users').where({ email }).first();
    if (existing) return res.status(409).json({ success: false, error: 'Email already exists' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [user] = await db('users')
      .insert({ name, email, role, password_hash, is_active: true })
      .returning(userFields);

    await logAudit({ table_name: 'users', record_id: user.id, action: 'INSERT', user_id: req.user.id, new_value: { name, email, role } });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id — single user
router.get('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await db('users').select(userFields).where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id — update user
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const isSelf = req.user.id === targetId;

    const existing = await db('users').select(userFields).where({ id: targetId }).first();
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

    const { name, role, is_active, password } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;

    if (role !== undefined) {
      if (isSelf) return res.status(403).json({ success: false, error: 'Cannot change your own role' });
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ success: false, error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      }
      updates.role = role;
    }

    if (is_active !== undefined) {
      if (isSelf) return res.status(403).json({ success: false, error: 'Cannot change your own active status' });
      updates.is_active = is_active;
    }

    if (password) {
      updates.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    const [updated] = await db('users').where({ id: targetId }).update(updates).returning(userFields);

    await logAudit({
      table_name: 'users', record_id: targetId, action: 'UPDATE',
      user_id: req.user.id,
      old_value: { name: existing.name, role: existing.role, is_active: existing.is_active },
      new_value: { name: updated.name, role: updated.role, is_active: updated.is_active }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — deactivate only
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (req.user.id === targetId) {
      return res.status(403).json({ success: false, error: 'Cannot deactivate yourself' });
    }

    const existing = await db('users').select(userFields).where({ id: targetId }).first();
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

    const [updated] = await db('users').where({ id: targetId }).update({ is_active: false }).returning(userFields);

    await logAudit({
      table_name: 'users', record_id: targetId, action: 'UPDATE',
      user_id: req.user.id,
      old_value: { is_active: true }, new_value: { is_active: false }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
