const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

const router = express.Router();

// GET /api/customers — list customers with optional search
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search } = req.query;
    let query = db('customers').orderBy('name');
    if (search) {
      query = query.where(function () {
        this.whereILike('name', `%${search}%`)
          .orWhereILike('contact', `%${search}%`)
          .orWhereILike('address', `%${search}%`);
      });
    }
    const customers = await query;
    res.json({ success: true, data: customers });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers — create customer
router.post('/', authenticate, authorize('admin', 'sales'), async (req, res, next) => {
  try {
    const { name, contact, address } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const [customer] = await db('customers').insert({ name, contact, address }).returning('*');
    await logAudit({ table_name: 'customers', record_id: customer.id, action: 'INSERT', user_id: req.user.id, new_value: customer });
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id — single customer
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const customer = await db('customers').where({ id: req.params.id }).first();
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id — update customer
router.put('/:id', authenticate, authorize('admin', 'sales'), async (req, res, next) => {
  try {
    const existing = await db('customers').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found' });
    const { name, contact, address } = req.body;
    const [updated] = await db('customers')
      .where({ id: req.params.id })
      .update({
        name: name || existing.name,
        contact: contact !== undefined ? contact : existing.contact,
        address: address !== undefined ? address : existing.address
      })
      .returning('*');
    await logAudit({ table_name: 'customers', record_id: updated.id, action: 'UPDATE', user_id: req.user.id, old_value: existing, new_value: updated });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
