const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { generateEAN13 } = require('../services/barcode');
const { logAudit } = require('../services/audit');

const router = express.Router();

const ALLOWED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);
const ALLOWED_EXTS = new Set(['.xlsx', '.xls', '.csv']);

function excelFileFilter(_req, file, cb) {
  const ext = require('path').extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTS.has(ext)) {
    return cb(null, true);
  }
  cb(new Error('Only .xlsx, .xls, .csv files allowed'), false);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: excelFileFilter,
});

const path = require('path');
const fs = require('fs');
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/photos');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `item-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    allowed.has(file.mimetype) ? cb(null, true) : cb(new Error('Images only'), false);
  }
});

// Helper: generate next item_code
async function nextItemCode() {
  const row = await db('items').select('item_code').orderBy('id', 'desc').first();
  if (!row) return 'FG-0001';
  const num = parseInt(row.item_code.replace('FG-', ''), 10);
  return 'FG-' + String(num + 1).padStart(4, '0');
}

// GET /api/items — list items with live stock, search + filter + active status support
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, category_id, sub_category_id, active } = req.query;

    let query = db('items')
      .select(
        'items.*',
        'sub_categories.name as sub_category_name',
        'categories.id as category_id',
        'categories.name as category_name',
        'locations.name as location_name',
        db.raw(
          '(SELECT COALESCE(SUM(b.qty_remaining), 0) FROM batches b WHERE b.item_id = items.id AND b.qty_remaining > 0) as live_stock_kg'
        )
      )
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .join('categories', 'categories.id', 'sub_categories.category_id')
      .leftJoin('locations', 'locations.id', 'items.location_id')
      .orderBy('items.id');

    // Active filter: default to only active items unless ?active=all or ?active=false
    if (!active || active === 'true') {
      query = query.where('items.is_active', true);
    } else if (active === 'false') {
      query = query.where('items.is_active', false);
    }
    // active === 'all' → no filter

    if (search) {
      query = query.where(function () {
        this.whereILike('items.item_code', `%${search}%`)
          .orWhereILike('items.barcode', `%${search}%`)
          .orWhereILike('items.variant_grade', `%${search}%`)
          .orWhereILike('sub_categories.name', `%${search}%`);
      });
    }

    if (sub_category_id) {
      query = query.where('items.sub_category_id', sub_category_id);
    } else if (category_id) {
      query = query.where('categories.id', category_id);
    }

    if (req.query.location_id) {
      const lid = parseInt(req.query.location_id, 10);
      if (!isNaN(lid)) query = query.where('items.location_id', lid);
    }
    if (req.query.tag_id) {
      const tid = parseInt(req.query.tag_id, 10);
      if (!isNaN(tid)) query = query.whereExists(
        db('item_tags').where('item_tags.item_id', db.raw('items.id')).where('item_tags.tag_id', tid)
      );
    }

    const items = await query;
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// GET /api/items/scan/:barcode — must be before /:id
router.get('/scan/:barcode', authenticate, async (req, res, next) => {
  try {
    const { barcode } = req.params;

    // 1. Try primary barcode
    let item = await db('items')
      .select(
        'items.*',
        'sub_categories.name as sub_category_name',
        'categories.name as category_name'
      )
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .join('categories', 'categories.id', 'sub_categories.category_id')
      .where('items.barcode', barcode)
      .first();

    // 2. Fall back to alias (vendor / external barcode)
    if (!item) {
      const alias = await db('item_aliases').where({ alias_barcode: barcode }).first();
      if (alias) {
        item = await db('items')
          .select(
            'items.*',
            'sub_categories.name as sub_category_name',
            'categories.name as category_name'
          )
          .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
          .join('categories', 'categories.id', 'sub_categories.category_id')
          .where('items.id', alias.item_id)
          .first();
        if (item) item.matched_via = 'alias';
      }
    } else {
      item.matched_via = 'primary';
    }

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found for barcode: ' + barcode });
    }

    const stockRow = await db('batches')
      .where({ item_id: item.id })
      .where('qty_remaining', '>', 0)
      .sum('qty_remaining as live_stock_kg')
      .count('* as batch_count')
      .first();

    const nearestExpiryRow = await db('batches')
      .where({ item_id: item.id })
      .where('qty_remaining', '>', 0)
      .whereNotNull('expiry_date')
      .orderBy('expiry_date', 'asc')
      .select('expiry_date')
      .first();

    res.json({
      success: true,
      data: {
        ...item,
        live_stock_kg: parseFloat(stockRow.live_stock_kg) || 0,
        batch_count: parseInt(stockRow.batch_count) || 0,
        nearest_expiry: nearestExpiryRow ? nearestExpiryRow.expiry_date : null
      }
    });
  } catch (err) {
    next(err);
  }
});

// Helper: build and send the import template xlsx
function sendImportTemplate(res) {
  const XLSX = require('xlsx');
  const template = [
    {
      item_name: 'Basmati Extra Long', sub_category: 'Rice', unit: 'kg',
      purchase_rate: 90, hsn_code: '1006', mrp: 120, variant_grade: 'Basmati Extra Long',
      min_stock_level: 50, barcode: '',
      gst_rate: 5, avg_daily_consumption: 50, lead_time_days: 7,
      demand_variability_pct: 20, reorder_qty: 200, pack_size: '25kg bag',
      storage_location: 'Rack A1', description: 'Premium basmati rice'
    },
    {
      item_name: 'Masoor Dal', sub_category: 'Pulses', unit: 'kg',
      purchase_rate: 75, hsn_code: '0713', mrp: 98, variant_grade: 'Masoor Dal',
      min_stock_level: 30, barcode: '',
      gst_rate: 5, avg_daily_consumption: 20, lead_time_days: 7,
      demand_variability_pct: 20, reorder_qty: 100, pack_size: '50kg bag',
      storage_location: 'Rack B2', description: ''
    }
  ];
  const ws = XLSX.utils.json_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Items');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set('Content-Disposition', 'attachment; filename="item-master-template.xlsx"');
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}

// GET /api/items/bulk-template — download import template (MUST be before /:id)
router.get('/bulk-template', authenticate, (_req, res) => sendImportTemplate(res));

// GET /api/items/import/template — alias matching the documented spec
router.get('/import/template', authenticate, (_req, res) => sendImportTemplate(res));

// Helper: resolve a header value case-insensitively across candidate column names
function pickCol(row, ...candidates) {
  for (const c of candidates) {
    const key = Object.keys(row).find(k => k.trim().toLowerCase() === c.toLowerCase());
    if (key !== undefined && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return null;
}

// Helper: check whether a row is entirely blank
function isBlankRow(row) {
  return Object.values(row).every(v => v === null || v === undefined || String(v).trim() === '');
}

// Required columns (case-insensitive); maps spec names → internal aliases
const REQUIRED_COLUMNS = [
  { spec: ['item_name', 'name', 'variant_grade', 'Variant/Grade'], label: 'item_name' },
  { spec: ['sub_category', 'subcategory', 'Sub Category', 'sub category'], label: 'sub_category' },
  { spec: ['unit'], label: 'unit' },
  { spec: ['purchase_rate', 'rate', 'Purchase Rate'], label: 'purchase_rate' },
];

function validateColumnSchema(headerRow) {
  const headerKeys = headerRow.map(k => k.trim().toLowerCase());
  const missing = [];
  for (const col of REQUIRED_COLUMNS) {
    const found = col.spec.some(alias => headerKeys.includes(alias.toLowerCase()));
    if (!found) missing.push(col.label);
  }
  return missing;
}

// POST /api/items/bulk-import — Excel import for items (MUST be before /:id)
router.post(
  '/bulk-import',
  authenticate,
  authorize('admin', 'purchase'),
  (req, res, next) => {
    upload.single('file')(req, res, err => {
      if (err) {
        // multer fileFilter rejection or size limit
        return res.status(400).json({ success: false, error: err.message });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const XLSX = require('xlsx');
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Get raw rows including header
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (!rawRows || rawRows.length < 1) {
        return res.status(400).json({ success: false, error: 'Spreadsheet is empty' });
      }

      // Column schema validation against header row
      const headerRow = (rawRows[0] || []).map(String);
      const missingCols = validateColumnSchema(headerRow);
      if (missingCols.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required columns: ${missingCols.join(', ')}`,
        });
      }

      // Parse as objects now that headers are validated
      const rows = XLSX.utils.sheet_to_json(ws);
      const results = { imported: 0, skipped: 0, errors: [] };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // 1-indexed, row 1 = header

        // Skip blank rows
        if (isBlankRow(row)) continue;

        try {
          // --- item_name (maps to variant_grade in DB) ---
          const variant_grade = pickCol(row, 'item_name', 'name', 'variant_grade', 'Variant/Grade');
          if (!variant_grade) {
            results.errors.push({ row: rowNum, reason: 'item_name must be a non-empty string' });
            results.skipped++;
            continue;
          }

          // --- unit ---
          const unit = pickCol(row, 'unit', 'Unit') || 'kg';
          if (!unit) {
            results.errors.push({ row: rowNum, reason: 'unit must be a non-empty string' });
            results.skipped++;
            continue;
          }

          // --- purchase_rate: must be a positive number ---
          const rawRate = pickCol(row, 'purchase_rate', 'rate', 'Purchase Rate');
          const purchase_rate = parseFloat(rawRate);
          if (!rawRate || isNaN(purchase_rate) || purchase_rate <= 0) {
            results.errors.push({ row: rowNum, reason: 'purchase_rate must be a positive number' });
            results.skipped++;
            continue;
          }

          // --- sub_category: must exist in DB ---
          const subCatName = pickCol(row, 'sub_category', 'subcategory', 'Sub Category', 'sub category');
          if (!subCatName) {
            results.errors.push({ row: rowNum, reason: 'sub_category is required' });
            results.skipped++;
            continue;
          }
          const subCat = await db('sub_categories').whereILike('name', subCatName).first();
          if (!subCat) {
            results.errors.push({ row: rowNum, reason: `sub_category '${subCatName}' not found` });
            results.skipped++;
            continue;
          }

          // Duplicate check
          const existing = await db('items').where({ sub_category_id: subCat.id, variant_grade }).first();
          if (existing) {
            results.errors.push({
              row: rowNum,
              reason: `Item '${variant_grade}' in '${subCatName}' already exists (${existing.item_code})`,
            });
            results.skipped++;
            continue;
          }

          // Optional columns
          const hsn_code = pickCol(row, 'hsn_code', 'HSN Code') || null;
          const mrp = parseFloat(pickCol(row, 'mrp', 'MRP') || 0) || null;
          const min_stock_level = parseFloat(pickCol(row, 'min_stock_level', 'Min Stock') || 0);
          const gst_rate = parseFloat(pickCol(row, 'gst_rate', 'GST%') || 5);
          const customBarcode = pickCol(row, 'barcode') || null;

          const item_code = await nextItemCode();
          const [newItem] = await db('items')
            .insert({
              sub_category_id: subCat.id,
              item_code,
              barcode: customBarcode || ('TEMP_' + crypto.randomBytes(8).toString('hex')),
              hsn_code,
              unit,
              variant_grade,
              purchase_rate,
              mrp,
              min_stock_level,
              gst_rate,
              avg_daily_consumption: parseFloat(pickCol(row, 'avg_daily_consumption') || 0),
              lead_time_days: parseInt(pickCol(row, 'lead_time_days') || 7),
              demand_variability_pct: parseInt(pickCol(row, 'demand_variability_pct') || 20),
              reorder_qty: parseFloat(pickCol(row, 'reorder_qty') || 0),
              pack_size: pickCol(row, 'pack_size') || null,
              storage_location: pickCol(row, 'storage_location') || null,
              description: pickCol(row, 'description') || null,
            })
            .returning('*');

          // Generate EAN-13 only if no custom barcode provided
          if (!customBarcode) {
            const barcode = generateEAN13(newItem.id);
            await db('items').where({ id: newItem.id }).update({ barcode });
          }

          results.imported++;
        } catch (e) {
          results.errors.push({ row: rowNum, reason: e.message });
          results.skipped++;
        }
      }

      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/items/:id — single item with live stock, location, tags, photos, custom fields
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await db('items')
      .select(
        'items.*',
        'sub_categories.name as sub_category_name',
        'categories.id as category_id',
        'categories.name as category_name',
        'locations.name as location_name',
        db.raw('(SELECT COALESCE(SUM(b.qty_remaining), 0) FROM batches b WHERE b.item_id = items.id AND b.qty_remaining > 0) as live_stock_kg')
      )
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .join('categories', 'categories.id', 'sub_categories.category_id')
      .leftJoin('locations', 'locations.id', 'items.location_id')
      .where('items.id', req.params.id)
      .first();
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    const [tags, photos, customFields] = await Promise.all([
      db('item_tags').join('tags', 'tags.id', 'item_tags.tag_id').where('item_tags.item_id', req.params.id).select('tags.id', 'tags.name'),
      db('item_photos').where({ item_id: req.params.id }).orderBy('sort_order').orderBy('id'),
      db('item_custom_values').join('custom_field_defs', 'custom_field_defs.id', 'item_custom_values.field_id').where('item_custom_values.item_id', req.params.id).select('custom_field_defs.id as field_id', 'custom_field_defs.name', 'custom_field_defs.field_type', 'item_custom_values.value'),
    ]);

    res.json({ success: true, data: { ...item, tags, photos, custom_fields: customFields } });
  } catch (err) {
    next(err);
  }
});

// GET /api/items/:id/batches — stock batches for this item
router.get('/:id/batches', authenticate, async (req, res, next) => {
  try {
    const batches = await db('batches')
      .where({ item_id: req.params.id })
      .orderBy('receipt_date', 'asc')
      .select('*');
    res.json({ success: true, data: batches });
  } catch (err) {
    next(err);
  }
});

// GET /api/items/:id/history — audit trail for this item
router.get('/:id/history', authenticate, async (req, res, next) => {
  try {
    const logs = await db('audit_log')
      .where({ table_name: 'items', record_id: req.params.id })
      .join('users', 'users.id', 'audit_log.user_id')
      .select('audit_log.*', 'users.name as user_name')
      .orderBy('audit_log.created_at', 'desc')
      .limit(100);
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

// GET /api/items/:id/vendors — vendor-item mappings
router.get('/:id/vendors', authenticate, async (req, res, next) => {
  try {
    const rows = await db('vendor_items')
      .join('vendors', 'vendors.id', 'vendor_items.vendor_id')
      .where({ item_id: req.params.id })
      .select('vendor_items.*', 'vendors.name as vendor_name', 'vendors.contact');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/items/:id/vendors — add/update vendor-item mapping
router.post('/:id/vendors', authenticate, authorize('admin', 'purchase'), async (req, res, next) => {
  try {
    const { vendor_id, vendor_sku, purchase_rate, lead_time_days, is_preferred } = req.body;
    const [row] = await db('vendor_items')
      .insert({
        item_id: req.params.id,
        vendor_id,
        vendor_sku,
        purchase_rate,
        lead_time_days: lead_time_days || 7,
        is_preferred: is_preferred || false
      })
      .onConflict(['vendor_id', 'item_id'])
      .merge(['vendor_sku', 'purchase_rate', 'lead_time_days', 'is_preferred'])
      .returning('*');
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/items/:id/vendors/:vendor_id
router.delete('/:id/vendors/:vendor_id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await db('vendor_items')
      .where({ item_id: req.params.id, vendor_id: req.params.vendor_id })
      .delete();
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/items/:id/toggle-active — admin only
router.patch('/:id/toggle-active', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const item = await db('items').where({ id: req.params.id }).first();
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    const [updated] = await db('items')
      .where({ id: req.params.id })
      .update({ is_active: !item.is_active })
      .returning('*');
    await logAudit({
      table_name: 'items', record_id: updated.id, action: 'UPDATE',
      user_id: req.user.id,
      changed_fields: { is_active: true },
      old_value: { is_active: item.is_active },
      new_value: { is_active: updated.is_active },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/items — create item
router.post('/', authenticate, authorize('admin', 'purchase'), async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const {
      sub_category_id, hsn_code, unit, variant_grade,
      purchase_rate, mrp, avg_daily_consumption,
      lead_time_days, demand_variability_pct,
      gst_rate, reorder_qty, pack_size, storage_location, description
    } = req.body;

    if (!sub_category_id) {
      await trx.rollback();
      return res.status(400).json({ success: false, error: 'sub_category_id is required' });
    }

    const item_code = await nextItemCode();

    const tempBarcode = 'TEMP_' + crypto.randomBytes(8).toString('hex');
    const [newItem] = await trx('items')
      .insert({
        sub_category_id,
        item_code,
        barcode: tempBarcode,
        hsn_code: hsn_code || null,
        unit: unit || 'kg',
        variant_grade: variant_grade || null,
        purchase_rate: purchase_rate || null,
        mrp: mrp || null,
        avg_daily_consumption: avg_daily_consumption || 0,
        lead_time_days: lead_time_days || 7,
        demand_variability_pct: demand_variability_pct || 20,
        gst_rate: gst_rate !== undefined ? gst_rate : 5,
        reorder_qty: reorder_qty || 0,
        pack_size: pack_size || null,
        storage_location: storage_location || null,
        description: description || null
      })
      .returning('*');

    const barcode = generateEAN13(newItem.id);
    const [updated] = await trx('items')
      .where({ id: newItem.id })
      .update({ barcode })
      .returning('*');

    await logAudit({
      table_name: 'items', record_id: updated.id, action: 'INSERT',
      user_id: req.user.id, new_value: updated,
    }, trx);

    await trx.commit();
    res.status(201).json({ success: true, data: updated });
  } catch (err) {
    await trx.rollback();
    next(err);
  }
});

// PUT /api/items/:id — update item (admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const {
      sub_category_id, hsn_code, unit, variant_grade,
      purchase_rate, mrp, avg_daily_consumption,
      lead_time_days, demand_variability_pct,
      gst_rate, reorder_qty, pack_size, storage_location, description,
      item_image_url
    } = req.body;

    const existing = await db('items').where({ id: req.params.id }).first();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const [updated] = await db('items')
      .where({ id: req.params.id })
      .update({
        sub_category_id: sub_category_id || existing.sub_category_id,
        hsn_code: hsn_code !== undefined ? hsn_code : existing.hsn_code,
        unit: unit || existing.unit,
        variant_grade: variant_grade !== undefined ? variant_grade : existing.variant_grade,
        purchase_rate: purchase_rate !== undefined ? purchase_rate : existing.purchase_rate,
        mrp: mrp !== undefined ? mrp : existing.mrp,
        avg_daily_consumption: avg_daily_consumption !== undefined ? avg_daily_consumption : existing.avg_daily_consumption,
        lead_time_days: lead_time_days !== undefined ? lead_time_days : existing.lead_time_days,
        demand_variability_pct: demand_variability_pct !== undefined ? demand_variability_pct : existing.demand_variability_pct,
        gst_rate: gst_rate !== undefined ? gst_rate : existing.gst_rate,
        reorder_qty: reorder_qty !== undefined ? reorder_qty : existing.reorder_qty,
        pack_size: pack_size !== undefined ? pack_size : existing.pack_size,
        storage_location: storage_location !== undefined ? storage_location : existing.storage_location,
        description: description !== undefined ? description : existing.description,
        item_image_url: item_image_url !== undefined ? item_image_url : existing.item_image_url
      })
      .returning('*');

    await logAudit({
      table_name: 'items', record_id: updated.id, action: 'UPDATE',
      user_id: req.user.id, old_value: existing, new_value: updated,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/items/:id — admin only, only if no batches exist
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await db('items').where({ id: req.params.id }).first();
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const batchCount = await db('batches')
      .where({ item_id: req.params.id })
      .count('id as cnt')
      .first();

    if (parseInt(batchCount.cnt) > 0) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete item with existing batch records'
      });
    }

    await db('items').where({ id: req.params.id }).delete();
    await logAudit({
      table_name: 'items', record_id: parseInt(req.params.id), action: 'DELETE',
      user_id: req.user.id, old_value: existing,
    });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// GET /api/items/:id/label — returns PNG barcode image
router.get('/:id/label', authenticate, async (req, res, next) => {
  try {
    const item = await db('items')
      .select('items.*', 'sub_categories.name as sub_category_name')
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .where('items.id', req.params.id)
      .first();
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    const bwipjs = require('bwip-js');
    const png = await bwipjs.toBuffer({
      bcid: 'ean13',
      text: item.barcode,
      scale: 3,
      height: 15,
      includetext: true,
      textxalign: 'center'
    });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    next(err);
  }
});

// GET /api/items/:id/qr — QR code PNG
router.get('/:id/qr', authenticate, async (req, res, next) => {
  try {
    const item = await db('items').where({ id: req.params.id }).first();
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    const bwipjs = require('bwip-js');
    const png = await bwipjs.toBuffer({ bcid: 'qrcode', text: item.barcode, scale: 4, includetext: false });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) { next(err); }
});

// POST /api/items/labels — printable HTML label sheet
router.post('/labels', authenticate, async (req, res, next) => {
  try {
    const { item_ids, copies = 1, type = 'barcode' } = req.body;
    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'item_ids array required' });
    }
    const items = await db('items').whereIn('id', item_ids).select('id', 'item_code', 'barcode', 'variant_grade');
    const bwipjs = require('bwip-js');
    const labelsHtml = await Promise.all(
      items.flatMap(item => Array(Number(copies)).fill(item)).map(async (item) => {
        const png = await bwipjs.toBuffer(type === 'qr'
          ? { bcid: 'qrcode', text: item.barcode, scale: 4 }
          : { bcid: 'ean13', text: item.barcode, scale: 3, height: 15, includetext: true, textxalign: 'center' }
        );
        const b64 = png.toString('base64');
        return `<div class="label"><img src="data:image/png;base64,${b64}" /><div class="code">${item.item_code}</div><div class="grade">${item.variant_grade || ''}</div></div>`;
      })
    );
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Labels</title><style>
      body{margin:0;font-family:Arial,sans-serif}
      .sheet{display:flex;flex-wrap:wrap;padding:8mm;gap:4mm}
      .label{width:50mm;border:1px solid #ccc;padding:3mm;text-align:center;page-break-inside:avoid;box-sizing:border-box}
      .label img{width:100%;max-height:20mm;object-fit:contain}
      .code{font-family:monospace;font-size:9pt;font-weight:bold;margin-top:2mm}
      .grade{font-size:7pt;color:#555;margin-top:1mm}
      @media print{body{margin:0}.sheet{padding:0;gap:2mm}}
    </style></head><body><div class="sheet">${labelsHtml.join('')}</div></body></html>`;
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { next(err); }
});

// POST /api/items/:id/clone — clone item with new item_code and barcode
router.post('/:id/clone', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const source = await db('items').where({ id: req.params.id }).first();
    if (!source) return res.status(404).json({ success: false, error: 'Item not found' });
    const newCode = await nextItemCode();
    const [newItem] = await db('items').insert({
      sub_category_id: source.sub_category_id,
      item_code: newCode,
      barcode: 'TEMP_' + Date.now(),
      hsn_code: source.hsn_code,
      unit: source.unit,
      variant_grade: source.variant_grade ? source.variant_grade + ' (Copy)' : null,
      purchase_rate: source.purchase_rate,
      mrp: source.mrp,
      avg_daily_consumption: source.avg_daily_consumption,
      lead_time_days: source.lead_time_days,
      demand_variability_pct: source.demand_variability_pct,
      gst_rate: source.gst_rate,
      reorder_qty: source.reorder_qty,
      pack_size: source.pack_size,
      description: source.description,
      location_id: source.location_id,
      is_active: true,
    }).returning('*');
    const ean13 = generateEAN13(newItem.id);
    const [updated] = await db('items').where({ id: newItem.id }).update({ barcode: ean13 }).returning('*');
    await logAudit({ table_name: 'items', record_id: updated.id, action: 'INSERT', user_id: req.user.id, new_value: updated });
    res.status(201).json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// PATCH /api/items/bulk — bulk update multiple items
router.patch('/bulk', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { ids, fields } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'ids array required' });
    const allowed = ['location_id', 'unit', 'purchase_rate', 'mrp', 'lead_time_days', 'demand_variability_pct', 'gst_rate', 'sub_category_id'];
    const patch = {};
    for (const k of allowed) { if (fields[k] !== undefined) patch[k] = fields[k]; }
    if (Object.keys(patch).length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update' });
    await db.transaction(async trx => {
      await trx('items').whereIn('id', ids).update(patch);
    });
    res.json({ success: true, data: { updated: ids.length } });
  } catch (err) { next(err); }
});

// GET /api/items/:id/aliases
router.get('/:id/aliases', authenticate, async (req, res, next) => {
  try {
    const aliases = await db('item_aliases').where({ item_id: req.params.id }).orderBy('id');
    res.json({ success: true, data: aliases });
  } catch (err) { next(err); }
});

// POST /api/items/:id/aliases — register alias barcode
router.post('/:id/aliases', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const { alias_barcode, alias_name } = req.body;
    if (!alias_barcode) return res.status(400).json({ success: false, error: 'alias_barcode is required' });
    const item = await db('items').where({ id: req.params.id }).first();
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    const conflict = await db('item_aliases').where({ alias_barcode }).first();
    if (conflict) {
      if (conflict.item_id === parseInt(req.params.id)) {
        return res.status(409).json({ success: false, error: 'Barcode already registered to this item' });
      }
      return res.status(409).json({ success: false, error: 'Barcode already linked to another item' });
    }
    const [alias] = await db('item_aliases')
      .insert({ item_id: req.params.id, alias_barcode, alias_name: alias_name || null })
      .returning('*');
    res.status(201).json({ success: true, data: alias });
  } catch (err) { next(err); }
});

// DELETE /api/items/:id/aliases/:aliasId
router.delete('/:id/aliases/:aliasId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const alias = await db('item_aliases').where({ id: req.params.aliasId, item_id: req.params.id }).first();
    if (!alias) return res.status(404).json({ success: false, error: 'Alias not found' });
    await db('item_aliases').where({ id: req.params.aliasId }).delete();
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

// GET /api/items/:id/photos
router.get('/:id/photos', authenticate, async (req, res, next) => {
  try {
    const photos = await db('item_photos').where({ item_id: req.params.id }).orderBy('sort_order').orderBy('id');
    res.json({ success: true, data: photos });
  } catch (err) { next(err); }
});

// POST /api/items/:id/photos
router.post('/:id/photos', authenticate, authorize('admin', 'purchase', 'warehouse'), uploadPhoto.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'photo file required' });
    const item = await db('items').where({ id: req.params.id }).first();
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    const storage_url = `/uploads/photos/${req.file.filename}`;
    const [photo] = await db('item_photos').insert({ item_id: req.params.id, storage_url, label: req.body.label || null }).returning('*');
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

// DELETE /api/items/:id/photos/:photoId
router.delete('/:id/photos/:photoId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const photo = await db('item_photos').where({ id: req.params.photoId, item_id: req.params.id }).first();
    if (!photo) return res.status(404).json({ success: false, error: 'Photo not found' });
    const filePath = path.join(__dirname, '../../uploads/photos', path.basename(photo.storage_url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db('item_photos').where({ id: req.params.photoId }).delete();
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

module.exports = router;
