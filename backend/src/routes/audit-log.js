const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit-log?user_id=&table_name=&action=&from=&to=&page=&limit=
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let query = db('audit_log')
      .leftJoin('users', 'users.id', 'audit_log.user_id')
      .select(
        'audit_log.id',
        'audit_log.table_name',
        'audit_log.record_id',
        'audit_log.action',
        'audit_log.user_id',
        'users.name as user_name',
        'users.email as user_email',
        'audit_log.changed_fields',
        'audit_log.old_value',
        'audit_log.new_value',
        'audit_log.created_at'
      )
      .orderBy('audit_log.created_at', 'desc');

    if (req.query.user_id) {
      query = query.where('audit_log.user_id', parseInt(req.query.user_id));
    }
    if (req.query.table_name) {
      query = query.where('audit_log.table_name', req.query.table_name);
    }
    if (req.query.action) {
      query = query.where('audit_log.action', req.query.action);
    }
    if (req.query.from) {
      query = query.where('audit_log.created_at', '>=', new Date(req.query.from));
    }
    if (req.query.to) {
      const toDate = new Date(req.query.to);
      toDate.setDate(toDate.getDate() + 1);
      query = query.where('audit_log.created_at', '<', toDate);
    }

    const countQuery = query.clone().clearSelect().clearOrder().count('audit_log.id as total').first();
    const [countRow, rows] = await Promise.all([
      countQuery,
      query.limit(limit).offset(offset)
    ]);

    const total = parseInt(countRow.total) || 0;

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-log/users — distinct users who appear in audit_log (for filter dropdown)
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const rows = await db('audit_log')
      .leftJoin('users', 'users.id', 'audit_log.user_id')
      .whereNotNull('audit_log.user_id')
      .distinct('audit_log.user_id')
      .select('audit_log.user_id as id', 'users.name', 'users.email')
      .orderBy('users.name');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-log/tables — distinct table names that appear in audit_log
router.get('/tables', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const rows = await db('audit_log')
      .distinct('table_name')
      .whereNotNull('table_name')
      .orderBy('table_name')
      .pluck('table_name');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
