const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/batches?itemId=&includeEmpty=false
// Returns batches for an item joined with item details.
// Excludes qty_remaining=0 batches unless includeEmpty=true.
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { itemId, includeEmpty } = req.query;

    if (!itemId) {
      return res.status(400).json({ success: false, error: 'itemId query param is required' });
    }

    let query = db('batches')
      .join('items', 'items.id', 'batches.item_id')
      .where('batches.item_id', itemId)
      .select(
        'batches.id',
        'batches.item_id as itemId',
        'items.item_code as itemCode',
        'items.variant_grade as itemName',
        'batches.receipt_date as receiptDate',
        'batches.expiry_date as expiryDate',
        'batches.qty_received as qtyReceived',
        'batches.qty_remaining as qtyRemaining',
        'batches.risk_score as riskScore'
      )
      .orderBy('batches.receipt_date', 'asc');

    if (includeEmpty !== 'true') {
      query = query.where('batches.qty_remaining', '>', 0);
    }

    const batches = await query;

    const mapped = batches.map(b => ({
      id: b.id,
      itemId: b.itemId,
      itemCode: b.itemCode,
      itemName: b.itemName,
      receiptDate: b.receiptDate,
      expiryDate: b.expiryDate,
      qtyReceived: parseFloat(b.qtyReceived) || 0,
      qtyRemaining: parseFloat(b.qtyRemaining) || 0,
      riskScore: parseInt(b.riskScore) || 0,
    }));

    res.json({ success: true, data: mapped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
