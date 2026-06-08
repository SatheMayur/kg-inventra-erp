const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

const router = express.Router();

// GET /api/purchase-orders — list POs with vendor name and created_by name
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, vendor_id, vendor_search, date_from, date_to } = req.query;
    let query = db('purchase_orders')
      .select(
        'purchase_orders.*',
        'vendors.name as vendor_name',
        'users.name as created_by_name'
      )
      .join('vendors', 'vendors.id', 'purchase_orders.vendor_id')
      .leftJoin('users', 'users.id', 'purchase_orders.created_by')
      .orderBy('purchase_orders.id', 'desc');

    if (status) query = query.where('purchase_orders.status', status);
    if (vendor_id) query = query.where('purchase_orders.vendor_id', vendor_id);
    if (vendor_search) query = query.whereILike('vendors.name', `%${vendor_search}%`);
    if (date_from) query = query.where('purchase_orders.po_date', '>=', date_from);
    if (date_to) query = query.where('purchase_orders.po_date', '<=', date_to);

    const pos = await query;
    res.json({ success: true, data: pos });
  } catch (err) {
    next(err);
  }
});

// POST /api/purchase-orders — create PO (header only)
router.post('/', authenticate, authorize('admin', 'purchase'), async (req, res, next) => {
  try {
    const { vendor_id, po_date, delivery_date, notes } = req.body;
    if (!vendor_id || !po_date) {
      return res.status(400).json({ success: false, error: 'vendor_id and po_date are required' });
    }
    const vendor = await db('vendors').where({ id: vendor_id }).first();
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor not found' });

    const insertData = { vendor_id, po_date, delivery_date: delivery_date || null, status: 'open', created_by: req.user.id };
    // notes column may or may not exist depending on migration state — only include if present
    if (notes !== undefined) insertData.notes = notes;

    let po;
    try {
      [po] = await db('purchase_orders').insert(insertData).returning('*');
    } catch (colErr) {
      // Fallback: retry without notes if column doesn't exist
      if (colErr.message && colErr.message.includes('notes') && notes !== undefined) {
        delete insertData.notes;
        [po] = await db('purchase_orders').insert(insertData).returning('*');
      } else {
        throw colErr;
      }
    }

    await logAudit({ table_name: 'purchase_orders', record_id: po.id, action: 'INSERT', user_id: req.user.id, new_value: po });
    res.status(201).json({ success: true, data: po });
  } catch (err) {
    next(err);
  }
});

// GET /api/purchase-orders/:id — PO detail with vendor info, created_by name, and related inward entries
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const po = await db('purchase_orders')
      .select(
        'purchase_orders.*',
        'vendors.name as vendor_name',
        'vendors.gstin',
        'vendors.contact',
        'vendors.payment_terms',
        'users.name as created_by_name'
      )
      .join('vendors', 'vendors.id', 'purchase_orders.vendor_id')
      .leftJoin('users', 'users.id', 'purchase_orders.created_by')
      .where('purchase_orders.id', req.params.id)
      .first();
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });

    const inwardEntries = await db('inward_entries')
      .select('inward_entries.id', 'inward_entries.invoice_no', 'inward_entries.invoice_date', 'inward_entries.status', 'inward_entries.created_at')
      .where('inward_entries.po_id', req.params.id)
      .orderBy('inward_entries.id', 'desc');

    res.json({ success: true, data: { ...po, inward_entries: inwardEntries } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/purchase-orders/:id — update status (open→received, received→closed)
// admin + purchase can mark received; admin only can close
router.patch('/:id', authenticate, authorize('admin', 'purchase'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['received', 'closed'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${allowed.join(', ')}` });
    }
    if (status === 'closed' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only admin can close a PO' });
    }

    const po = await db('purchase_orders').where({ id: req.params.id }).first();
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });

    const transitions = { open: 'received', received: 'closed' };
    if (transitions[po.status] !== status) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${po.status}' to '${status}'` });
    }

    const [updated] = await db('purchase_orders')
      .where({ id: req.params.id })
      .update({ status })
      .returning('*');

    await logAudit({
      table_name: 'purchase_orders',
      record_id: po.id,
      action: 'UPDATE',
      user_id: req.user.id,
      old_value: { status: po.status },
      new_value: { status }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// PUT /api/purchase-orders/:id/close — kept for backward compatibility, admin only
router.put('/:id/close', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const po = await db('purchase_orders').where({ id: req.params.id }).first();
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const [updated] = await db('purchase_orders')
      .where({ id: req.params.id })
      .update({ status: 'closed' })
      .returning('*');
    await logAudit({ table_name: 'purchase_orders', record_id: po.id, action: 'UPDATE', user_id: req.user.id, old_value: { status: po.status }, new_value: { status: 'closed' } });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
