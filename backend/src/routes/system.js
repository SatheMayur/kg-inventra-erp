const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/system/health — no auth, used for uptime checks
router.get('/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date() });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date() });
  }
});

// GET /api/system/cron-log — auth required, last 30 cron job runs
router.get('/cron-log', authenticate, async (req, res, next) => {
  try {
    const rows = await db('cron_log')
      .orderBy('ran_at', 'desc')
      .limit(30)
      .select('id', 'job', 'ran_at', 'result');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/system/low-stock-count — auth required, count of items at or below ROP
router.get('/low-stock-count', authenticate, async (req, res, next) => {
  try {
    const row = await db.raw(`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT i.id
        FROM items i
        LEFT JOIN batches b ON b.item_id = i.id AND b.qty_remaining > 0
        GROUP BY i.id, i.rop_kg
        HAVING COALESCE(SUM(b.qty_remaining), 0) <= i.rop_kg
      ) sub
    `);
    const count = parseInt(row.rows[0].cnt) || 0;
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
