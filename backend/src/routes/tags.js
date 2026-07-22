const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/tags — list all tags with item_count
router.get('/', authenticate, async (req, res, next) => {
  try {
    const tags = await db('tags')
      .select('tags.id', 'tags.name')
      .count('item_tags.item_id as item_count')
      .leftJoin('item_tags', 'tags.id', 'item_tags.tag_id')
      .groupBy('tags.id', 'tags.name')
      .orderBy('tags.name');
    const data = tags.map(t => ({ ...t, item_count: parseInt(t.item_count, 10) }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/tags — create tag (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const [tag] = await db('tags').insert({ name: name.trim() }).returning('*');
    res.status(201).json({ success: true, data: tag });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Tag name already exists' });
    }
    next(err);
  }
});

// DELETE /api/tags/:id — delete tag and cascade via item_tags (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await db('tags').where({ id }).first();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }
    await db('tags').where({ id }).delete();
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// POST /api/tags/items/:itemId — replace all tags for an item
router.post('/items/:itemId', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const { tag_ids } = req.body;

    if (!Array.isArray(tag_ids)) {
      return res.status(400).json({ success: false, error: 'tag_ids must be an array' });
    }

    const item = await db('items').where({ id: itemId }).first();
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    await db.transaction(async trx => {
      await trx('item_tags').where({ item_id: itemId }).delete();
      if (tag_ids.length > 0) {
        const rows = tag_ids.map(tag_id => ({ item_id: itemId, tag_id }));
        await trx('item_tags').insert(rows);
      }
    });

    const tags = await db('tags')
      .join('item_tags', 'tags.id', 'item_tags.tag_id')
      .where('item_tags.item_id', itemId)
      .select('tags.id', 'tags.name');

    res.json({ success: true, data: tags });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ success: false, error: 'One or more tag_ids do not exist' });
    }
    next(err);
  }
});

// GET /api/tags/items/:itemId — get all tags for a specific item
router.get('/items/:itemId', authenticate, async (req, res, next) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const item = await db('items').where({ id: itemId }).first();
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    const tags = await db('tags')
      .join('item_tags', 'tags.id', 'item_tags.tag_id')
      .where('item_tags.item_id', itemId)
      .select('tags.id', 'tags.name');
    res.json({ success: true, data: tags });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
