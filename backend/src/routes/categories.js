const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories — list all categories with sub_categories
router.get('/', authenticate, async (req, res, next) => {
  try {
    const categories = await db('categories').select('*').orderBy('id');
    const subs = await db('sub_categories').select('*').orderBy('id');

    const result = categories.map(cat => ({
      ...cat,
      sub_categories: subs.filter(s => s.category_id === cat.id)
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories — create category (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const [row] = await db('categories').insert({ name }).returning('*');
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// GET /api/categories/sub — list all sub_categories
router.get('/sub', authenticate, async (req, res, next) => {
  try {
    const subs = await db('sub_categories')
      .select('sub_categories.*', 'categories.name as category_name')
      .join('categories', 'categories.id', 'sub_categories.category_id')
      .orderBy('sub_categories.id');

    res.json({ success: true, data: subs });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories/sub — create sub_category (admin only)
router.post('/sub', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { category_id, name, shelf_life_days } = req.body;
    if (!category_id || !name) {
      return res.status(400).json({ success: false, error: 'category_id and name are required' });
    }

    const [row] = await db('sub_categories')
      .insert({ category_id, name, shelf_life_days: shelf_life_days || 365 })
      .returning('*');

    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
