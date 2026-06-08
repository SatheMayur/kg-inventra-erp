const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

const router = express.Router();

// GET /api/vendors — list vendors with optional search
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search } = req.query;
    let query = db('vendors').orderBy('name');
    if (search) {
      query = query.where(function () {
        this.whereILike('name', `%${search}%`)
          .orWhereILike('gstin', `%${search}%`)
          .orWhereILike('contact', `%${search}%`);
      });
    }
    const vendors = await query;
    res.json({ success: true, data: vendors });
  } catch (err) {
    next(err);
  }
});

// POST /api/vendors — create vendor
router.post('/', authenticate, authorize('admin', 'purchase'), async (req, res, next) => {
  try {
    const { name, gstin, contact, payment_terms } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const [vendor] = await db('vendors').insert({ name, gstin, contact, payment_terms }).returning('*');
    await logAudit({ table_name: 'vendors', record_id: vendor.id, action: 'INSERT', user_id: req.user.id, new_value: vendor });
    res.status(201).json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
});

// GET /api/vendors/:id — single vendor
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const vendor = await db('vendors').where({ id: req.params.id }).first();
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
    res.json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
});

// PUT /api/vendors/:id — update vendor
router.put('/:id', authenticate, authorize('admin', 'purchase'), async (req, res, next) => {
  try {
    const existing = await db('vendors').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ success: false, error: 'Vendor not found' });
    const { name, gstin, contact, payment_terms } = req.body;
    const [updated] = await db('vendors')
      .where({ id: req.params.id })
      .update({
        name: name || existing.name,
        gstin: gstin !== undefined ? gstin : existing.gstin,
        contact: contact !== undefined ? contact : existing.contact,
        payment_terms: payment_terms !== undefined ? payment_terms : existing.payment_terms
      })
      .returning('*');
    await logAudit({ table_name: 'vendors', record_id: updated.id, action: 'UPDATE', user_id: req.user.id, old_value: existing, new_value: updated });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/vendors/:id — admin only, 409 if has purchase_orders
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await db('vendors').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ success: false, error: 'Vendor not found' });
    const poCount = await db('purchase_orders').where({ vendor_id: req.params.id }).count('id as cnt').first();
    if (parseInt(poCount.cnt) > 0) {
      return res.status(409).json({ success: false, error: 'Cannot delete vendor with existing purchase orders' });
    }
    await db('vendors').where({ id: req.params.id }).delete();
    await logAudit({ table_name: 'vendors', record_id: parseInt(req.params.id), action: 'DELETE', user_id: req.user.id, old_value: existing });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
