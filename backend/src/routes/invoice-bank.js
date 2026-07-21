const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/invoice-bank?limit=20&offset=0&status=READY_FOR_STOCK
router.get('/', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const q = db('invoice_bank').select('*').orderBy('created_at', 'desc').limit(limit).offset(offset);
    if (req.query.status) q.where('status', req.query.status);
    const rows = await q;
    const [{ count } = { count: 0 }] = await db('invoice_bank').count('* as count');
    res.json({ data: rows, meta: { total: Number(count), limit, offset } });
  } catch (err) { next(err); }
});

// GET /api/invoice-bank/:id
router.get('/:id', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const row = await db('invoice_bank').where({ id }).first();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
  } catch (err) { next(err); }
});

module.exports = router;
