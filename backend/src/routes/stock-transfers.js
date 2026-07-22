const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

const router = express.Router();

// Ensure stock_transfers table exists on startup
;(async () => {
  try {
    await db.raw(`
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id SERIAL PRIMARY KEY,
        item_id INT REFERENCES items(id),
        batch_id INT REFERENCES batches(id),
        qty NUMERIC(10,2) NOT NULL,
        reason VARCHAR(50) NOT NULL,
        notes TEXT,
        reference_no VARCHAR(100),
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.error('[stock-transfers] table init error:', e.message);
  }
})();

const VALID_REASONS = ['transfer_in', 'transfer_out', 'damage', 'sample', 'correction'];

// POST /api/stock-transfers — create a stock adjustment or transfer
router.post('/', authenticate, authorize('admin', 'warehouse'), async (req, res, next) => {
  const { itemId, batchId, qty, reason, notes, referenceNo } = req.body;

  if (!itemId) return res.status(400).json({ success: false, error: 'itemId is required' });
  if (!batchId) return res.status(400).json({ success: false, error: 'batchId is required' });
  if (qty === undefined || qty === null || isNaN(Number(qty)) || Number(qty) === 0) {
    return res.status(400).json({ success: false, error: 'qty must be a non-zero number' });
  }
  if (!reason || !VALID_REASONS.includes(reason)) {
    return res.status(400).json({
      success: false,
      error: `reason must be one of: ${VALID_REASONS.join(', ')}`
    });
  }

  const numQty = Number(qty);

  const trx = await db.transaction();
  try {
    // Row-lock the batch so concurrent transfers on the same batch serialize.
    // Without forUpdate, two simultaneous adjustments both read the same
    // qty_remaining and the second write (an absolute value) clobbers the
    // first — a lost update that corrupts stock. The lock makes the second
    // request block, then re-read the post-commit value.
    const batch = await trx('batches')
      .where({ id: batchId, item_id: itemId })
      .forUpdate()
      .first();

    if (!batch) {
      await trx.rollback();
      return res.status(404).json({ success: false, error: 'Batch not found for this item' });
    }

    const newQtyRemaining = Number(batch.qty_remaining) + numQty;
    if (newQtyRemaining < 0) {
      await trx.rollback();
      return res.status(400).json({
        success: false,
        error: `Insufficient stock in batch. Available: ${batch.qty_remaining}, requested deduction: ${Math.abs(numQty)}`
      });
    }

    await trx('batches')
      .where({ id: batchId })
      .update({ qty_remaining: newQtyRemaining });

    const [transfer] = await trx('stock_transfers')
      .insert({
        item_id: itemId,
        batch_id: batchId,
        qty: numQty,
        reason,
        notes: notes || null,
        reference_no: referenceNo || null,
        created_by: req.user.id
      })
      .returning('*');

    await logAudit({
      table_name: 'stock_transfers',
      record_id: transfer.id,
      action: 'INSERT',
      user_id: req.user.id,
      new_value: transfer
    }, trx);

    await logAudit({
      table_name: 'batches',
      record_id: batchId,
      action: 'UPDATE',
      user_id: req.user.id,
      old_value: { qty_remaining: batch.qty_remaining },
      new_value: { qty_remaining: newQtyRemaining }
    }, trx);

    await trx.commit();

    res.status(201).json({
      success: true,
      data: {
        transferId: transfer.id,
        batchId,
        itemId,
        newQtyRemaining
      }
    });
  } catch (err) {
    await trx.rollback();
    next(err);
  }
});

// GET /api/stock-transfers — paginated history with optional filters
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { itemId, from, to, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = db('stock_transfers')
      .join('items', 'items.id', 'stock_transfers.item_id')
      .join('users', 'users.id', 'stock_transfers.created_by')
      .select(
        'stock_transfers.*',
        'items.item_code',
        'items.variant_grade as item_name',
        'users.name as created_by_name'
      )
      .orderBy('stock_transfers.id', 'desc');

    if (itemId) query = query.where('stock_transfers.item_id', Number(itemId));
    if (from) query = query.where('stock_transfers.created_at', '>=', new Date(from));
    if (to) query = query.where('stock_transfers.created_at', '<=', new Date(to));

    const countQuery = query.clone().clearSelect().clearOrder().count('stock_transfers.id as total').first();
    const [{ total }, rows] = await Promise.all([
      countQuery,
      query.limit(Number(limit)).offset(offset)
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: Number(total),
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(Number(total) / Number(limit))
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
