const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../config/db');
const { logAudit } = require('../services/audit');
const { normalize, CANONICAL, TAXONOMY, reloadCustomItems } = require('../services/normalize');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = express.Router();

// Refresh the normalizer's in-memory alias index from the custom_catalog_items table.
// Called on boot + after every add/delete.
async function refreshNormalizerCache() {
  try {
    const rows = await db('custom_catalog_items').select('canonical', 'category', 'sub_category', 'aliases');
    const cleaned = rows.map(r => ({
      canonical: r.canonical,
      category: r.category,
      sub_category: r.sub_category,
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
    }));
    reloadCustomItems(cleaned);
  } catch (err) {
    console.error('[normalize] failed to refresh custom items:', err.message);
  }
}

// Best-effort initial load. If the table is missing or DB is down, log + continue.
refreshNormalizerCache();

// GET /api/normalize/bulk-template — Excel template with sample raw rows
router.get('/bulk-template', authenticate, (req, res) => {
  const rows = [
    { input: '2 kg aloo premium' },
    { input: 'kashmiri lal mirch 500g' },
    { input: 'sabut urad 1kg' },
    { input: '1 dozen anda' },
    { input: 'india gate basmati 1121 5kg' },
    { input: 'amul butter 500g' },
    { input: 'roasted salted cashew w320 250g' },
    { input: 'medjool dates premium' },
    { input: 'palak sabzi' },
    { input: 'unknown item xyz' },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BulkNormalize');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set('Content-Disposition', 'attachment; filename="bulk-normalize-template.xlsx"');
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// POST /api/normalize/bulk — Excel in, Excel out with normalized columns
router.post('/bulk', authenticate, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const format = (req.query.format || 'xlsx').toLowerCase();

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Sheet is empty' });

    const out = rows.map(row => {
      const lc = {};
      for (const k of Object.keys(row)) lc[k.toLowerCase().trim()] = row[k];
      const inputRaw = String(lc.input || lc.name || lc.item || lc.raw || '').trim();
      if (!inputRaw) {
        return {
          input: inputRaw,
          canonical_name: '',
          category: '',
          sub_category: '',
          form: '',
          variant: '',
          grade: '',
          quantity: '',
          unit: '',
          aliases_matched: '',
          status: 'empty input',
        };
      }
      const n = normalize(inputRaw);
      return {
        input: inputRaw,
        canonical_name: n.canonical_name,
        category: n.category || '',
        sub_category: n.sub_category || '',
        form: n.form || '',
        variant: n.variant || '',
        grade: n.grade || '',
        quantity: n.quantity ?? '',
        unit: n.unit || '',
        aliases_matched: (n.aliases_matched || []).join('; '),
        status: n.category ? 'matched' : 'unknown',
      };
    });

    if (format === 'json') {
      return res.json({ success: true, data: out });
    }

    const outWs = XLSX.utils.json_to_sheet(out);
    const outWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(outWb, outWs, 'Normalized');
    const buf = XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx' });
    res.set('Content-Disposition', `attachment; filename="bulk-normalized-${Date.now()}.xlsx"`);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, (req, res) => {
  const { input, inputs } = req.body || {};

  if (Array.isArray(inputs)) {
    const results = inputs.map(v => normalize(v));
    return res.json({ success: true, data: results });
  }

  if (typeof input === 'string') {
    return res.json({ success: true, data: normalize(input) });
  }

  return res.status(400).json({
    success: false,
    error: 'Provide "input" (string) or "inputs" (array of strings)'
  });
});

// Build category tree from built-in dict + user-added custom items.
async function buildCatalogTree() {
  const tree = new Map(); // category -> Map(subCategory -> [{canonical, aliases, is_custom, id?}])

  // 1. Built-in items
  for (const canonical of Object.keys(CANONICAL)) {
    const tax = TAXONOMY[canonical];
    if (!tax) continue;
    if (!tree.has(tax.category)) tree.set(tax.category, new Map());
    const subMap = tree.get(tax.category);
    if (!subMap.has(tax.sub_category)) subMap.set(tax.sub_category, []);
    subMap.get(tax.sub_category).push({
      canonical,
      aliases: CANONICAL[canonical],
      is_custom: false,
    });
  }

  // 2. User-added custom items
  const customRows = await db('custom_catalog_items').select('*').orderBy('id', 'asc');
  for (const row of customRows) {
    if (!tree.has(row.category)) tree.set(row.category, new Map());
    const subMap = tree.get(row.category);
    if (!subMap.has(row.sub_category)) subMap.set(row.sub_category, []);
    subMap.get(row.sub_category).push({
      id: row.id,
      canonical: row.canonical,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      is_custom: true,
    });
  }

  return tree;
}

router.get('/catalog', authenticate, async (req, res, next) => {
  try {
    const tree = await buildCatalogTree();

    const categories = [];
    for (const [category, subMap] of tree) {
      const sub_categories = [];
      let itemTotal = 0;
      for (const [sub_category, items] of subMap) {
        items.sort((a, b) => a.canonical.localeCompare(b.canonical));
        sub_categories.push({ sub_category, item_count: items.length, items });
        itemTotal += items.length;
      }
      sub_categories.sort((a, b) => a.sub_category.localeCompare(b.sub_category));
      categories.push({
        category,
        sub_category_count: sub_categories.length,
        item_count: itemTotal,
        sub_categories,
      });
    }
    categories.sort((a, b) => a.category.localeCompare(b.category));

    res.json({
      success: true,
      data: {
        total_categories: categories.length,
        total_items: categories.reduce((s, c) => s + c.item_count, 0),
        categories,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/normalize/catalog/items — add a user-defined catalog item
router.post('/catalog/items', authenticate, authorize('admin', 'purchase'), async (req, res, next) => {
  try {
    const { canonical, category, sub_category, aliases } = req.body || {};
    if (!canonical || typeof canonical !== 'string') {
      return res.status(400).json({ success: false, error: 'canonical (string) is required' });
    }
    if (!category || !sub_category) {
      return res.status(400).json({ success: false, error: 'category and sub_category are required' });
    }

    const cleanCanonical = canonical.trim();
    if (!cleanCanonical) {
      return res.status(400).json({ success: false, error: 'canonical cannot be blank' });
    }

    let aliasList = [];
    if (Array.isArray(aliases)) {
      aliasList = aliases;
    } else if (typeof aliases === 'string' && aliases.trim()) {
      aliasList = aliases.split(',').map(s => s.trim()).filter(Boolean);
    }
    // De-duplicate (case-insensitive) and drop the canonical itself.
    const seen = new Set([cleanCanonical.toLowerCase()]);
    aliasList = aliasList.filter(a => {
      const k = a.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Reject if canonical already exists in built-in dict.
    if (CANONICAL[cleanCanonical]) {
      return res.status(409).json({ success: false, error: `'${cleanCanonical}' already exists as a built-in canonical` });
    }

    try {
      const [row] = await db('custom_catalog_items')
        .insert({
          canonical: cleanCanonical,
          category: category.trim(),
          sub_category: sub_category.trim(),
          aliases: JSON.stringify(aliasList),
          created_by: req.user.id,
        })
        .returning('*');
      await logAudit({
        table_name: 'custom_catalog_items', record_id: row.id, action: 'INSERT',
        user_id: req.user.id, new_value: row,
      });
      await refreshNormalizerCache();
      return res.status(201).json({ success: true, data: row });
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ success: false, error: `'${cleanCanonical}' already exists in custom catalog` });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

// DELETE /api/normalize/catalog/items/:id — admin or creator only
router.delete('/catalog/items/:id', authenticate, async (req, res, next) => {
  try {
    const row = await db('custom_catalog_items').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ success: false, error: 'Custom item not found' });
    if (req.user.role !== 'admin' && row.created_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Only admin or the creator can delete this item' });
    }
    await db('custom_catalog_items').where({ id: req.params.id }).delete();
    await logAudit({
      table_name: 'custom_catalog_items', record_id: parseInt(req.params.id), action: 'DELETE',
      user_id: req.user.id, old_value: row,
    });
    await refreshNormalizerCache();
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
