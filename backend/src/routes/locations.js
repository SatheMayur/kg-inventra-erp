const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * Build a nested tree from a flat list of location rows.
 * @param {Array} rows - flat rows with id, parent_id, name, path, depth
 * @returns {Array} root-level nodes, each with a `children` array
 */
function buildTree(rows) {
  const map = {};
  rows.forEach(r => { map[r.id] = { ...r, children: [] }; });

  const roots = [];
  rows.forEach(r => {
    if (r.parent_id && map[r.parent_id]) {
      map[r.parent_id].children.push(map[r.id]);
    } else {
      roots.push(map[r.id]);
    }
  });

  return roots;
}

/**
 * Compute depth for each row based on path separators.
 * Root nodes (no ' / ' in path) have depth 0.
 */
function withDepth(rows) {
  return rows.map(r => ({
    ...r,
    depth: r.path ? (r.path.split(' / ').length - 1) : 0
  }));
}

// GET /api/locations — flat list with computed depth
router.get('/', authenticate, async (req, res, next) => {
  try {
    const rows = await db('locations')
      .select('id', 'parent_id', 'name', 'path', 'created_at')
      .orderBy('path');

    res.json({ success: true, data: withDepth(rows) });
  } catch (err) {
    next(err);
  }
});

// GET /api/locations/tree — nested tree structure
router.get('/tree', authenticate, async (req, res, next) => {
  try {
    const rows = await db('locations')
      .select('id', 'parent_id', 'name', 'path', 'created_at')
      .orderBy('path');

    res.json({ success: true, data: buildTree(withDepth(rows)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/locations — create (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, parent_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    let path = name.trim();
    if (parent_id) {
      const parent = await db('locations').where({ id: parent_id }).first();
      if (!parent) {
        return res.status(400).json({ success: false, error: 'parent_id does not exist' });
      }
      path = `${parent.path} / ${name.trim()}`;
    }

    const [row] = await db('locations')
      .insert({ name: name.trim(), parent_id: parent_id || null, path })
      .returning('*');

    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// PUT /api/locations/:id — rename (admin only); recomputes path
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await db('locations').where({ id: req.params.id }).first();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    let newPath = name.trim();
    if (existing.parent_id) {
      const parent = await db('locations').where({ id: existing.parent_id }).first();
      newPath = parent ? `${parent.path} / ${name.trim()}` : name.trim();
    }

    const oldPrefix = existing.path;
    const [updated] = await db('locations')
      .where({ id: req.params.id })
      .update({ name: name.trim(), path: newPath })
      .returning('*');

    // Cascade path rename to all descendants
    const descendants = await db('locations')
      .where('path', 'like', `${oldPrefix} / %`);

    for (const desc of descendants) {
      const updatedDescPath = newPath + desc.path.slice(oldPrefix.length);
      await db('locations').where({ id: desc.id }).update({ path: updatedDescPath });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/locations/:id — admin only; 409 if items or batches assigned
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await db('locations').where({ id: req.params.id }).first();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    const [itemCount, batchCount] = await Promise.all([
      db('items').where({ location_id: req.params.id }).count('id as cnt').first(),
      db('batches').where({ location_id: req.params.id }).count('id as cnt').first()
    ]);

    if (parseInt(itemCount.cnt) > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete: ${itemCount.cnt} item(s) are assigned to this location`
      });
    }
    if (parseInt(batchCount.cnt) > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete: ${batchCount.cnt} batch(es) are assigned to this location`
      });
    }

    // Also block if any child locations exist
    const childCount = await db('locations')
      .where({ parent_id: req.params.id })
      .count('id as cnt')
      .first();

    if (parseInt(childCount.cnt) > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete: ${childCount.cnt} child location(s) exist under this location`
      });
    }

    await db('locations').where({ id: req.params.id }).delete();
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
