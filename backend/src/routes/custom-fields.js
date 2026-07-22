const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const VALID_FIELD_TYPES = ['text', 'number', 'date', 'boolean'];

// GET /api/custom-fields — list all field definitions
router.get('/', authenticate, async (req, res, next) => {
  try {
    const defs = await db('custom_field_defs').select('*').orderBy('id');
    res.json({ success: true, data: defs });
  } catch (err) {
    next(err);
  }
});

// POST /api/custom-fields — create field definition (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, field_type } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    if (!field_type || !VALID_FIELD_TYPES.includes(field_type)) {
      return res.status(400).json({
        success: false,
        error: `field_type must be one of: ${VALID_FIELD_TYPES.join(', ')}`
      });
    }

    const [row] = await db('custom_field_defs')
      .insert({ name: name.trim(), field_type })
      .returning('*');

    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/custom-fields/:id — delete field definition (admin only); cascades to item_custom_values
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await db('custom_field_defs').where({ id }).delete().returning('*');

    if (!deleted.length) {
      return res.status(404).json({ success: false, error: 'Field definition not found' });
    }

    res.json({ success: true, data: deleted[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/custom-fields/items/:itemId — get all field defs + values for an item
router.get('/items/:itemId', authenticate, async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const rows = await db('custom_field_defs as d')
      .leftJoin('item_custom_values as v', function () {
        this.on('v.field_id', '=', 'd.id').andOn(
          db.raw('v.item_id = ?', [itemId])
        );
      })
      .select('d.id as field_id', 'd.name', 'd.field_type', 'v.value')
      .orderBy('d.id');

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/custom-fields/items/:itemId — upsert field values for an item
router.put('/items/:itemId', authenticate, authorize('admin', 'purchase'), async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { values } = req.body;

    if (!Array.isArray(values) || values.length === 0) {
      return res.status(400).json({ success: false, error: 'values must be a non-empty array' });
    }

    for (const entry of values) {
      if (entry.field_id == null) {
        return res.status(400).json({ success: false, error: 'Each entry must have a field_id' });
      }
    }

    const rows = values.map(({ field_id, value }) => ({
      item_id: Number(itemId),
      field_id: Number(field_id),
      value: value != null ? String(value) : null
    }));

    const upserted = await db('item_custom_values')
      .insert(rows)
      .onConflict(['item_id', 'field_id'])
      .merge()
      .returning('*');

    res.json({ success: true, data: upserted });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
