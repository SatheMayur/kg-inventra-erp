const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const { generateEAN13 } = require('../services/barcode');
const { normalize, TAXONOMY } = require('../services/normalize');

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/inward — list inward entries
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, vendor_id } = req.query;
    let query = db('inward_entries')
      .select(
        'inward_entries.*',
        'vendors.name as vendor_name',
        'users.name as created_by_name',
        db.raw('(SELECT COUNT(*) FROM inward_lines WHERE inward_lines.inward_id = inward_entries.id) as line_count')
      )
      .join('vendors', 'vendors.id', 'inward_entries.vendor_id')
      .join('users', 'users.id', 'inward_entries.created_by')
      .orderBy('inward_entries.id', 'desc');

    if (status) query = query.where('inward_entries.status', status);
    if (vendor_id) query = query.where('inward_entries.vendor_id', vendor_id);

    const entries = await query;
    res.json({ success: true, data: entries });
  } catch (err) {
    next(err);
  }
});

// POST /api/inward — create inward entry (draft)
router.post('/', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const { po_id, vendor_id, invoice_no, invoice_date } = req.body;
    if (!vendor_id) return res.status(400).json({ success: false, error: 'vendor_id is required' });

    const vendor = await db('vendors').where({ id: vendor_id }).first();
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor not found' });

    if (po_id) {
      const po = await db('purchase_orders').where({ id: po_id }).first();
      if (!po) return res.status(400).json({ success: false, error: 'Purchase order not found' });
    }

    const [entry] = await db('inward_entries')
      .insert({ po_id: po_id || null, vendor_id, invoice_no, invoice_date: invoice_date || null, status: 'draft', created_by: req.user.id })
      .returning('*');

    await logAudit({ table_name: 'inward_entries', record_id: entry.id, action: 'INSERT', user_id: req.user.id, new_value: entry });
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

// GET /api/inward/opening-stock-template — Excel template for opening-stock import
// MUST be registered before /:id
router.get('/opening-stock-template', authenticate, (req, res) => {
  const rows = [
    {
      existing_barcode: '8901234567890',
      item_name: 'aloo',
      sub_category: 'Root Vegetables',
      qty_kg: 50,
      receipt_date: '2026-05-01',
      expiry_date: '2026-09-30',
      purchase_rate: 18,
      mrp: 25,
      storage_location: 'Rack A1'
    },
    {
      existing_barcode: '8902111222333',
      item_name: '2kg basmati rice 1121',
      sub_category: 'Rice',
      qty_kg: 100,
      receipt_date: '2026-04-20',
      expiry_date: '2028-06-30',
      purchase_rate: 90,
      mrp: 130,
      storage_location: 'Rack B2'
    },
    {
      existing_barcode: 'MANUAL-001',
      item_name: 'kashmiri lal mirch',
      sub_category: 'Powdered Spices',
      qty_kg: 5,
      receipt_date: '2026-05-15',
      expiry_date: '2027-03-20',
      purchase_rate: 320,
      mrp: 450,
      storage_location: 'Spice Rack'
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OpeningStock');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set('Content-Disposition', 'attachment; filename="opening-stock-template.xlsx"');
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Helpers shared by opening-stock importer
async function nextItemCode(trx) {
  const row = await trx('items').select('item_code').orderBy('id', 'desc').first();
  if (!row) return 'FG-0001';
  const num = parseInt(row.item_code.replace('FG-', ''), 10);
  return 'FG-' + String(num + 1).padStart(4, '0');
}

async function resolveSubCategoryId(trx, subCategoryHint, canonical) {
  // 1. Direct match on sub_categories.name (case-insensitive)
  if (subCategoryHint) {
    const row = await trx('sub_categories').whereRaw('LOWER(name) = LOWER(?)', [subCategoryHint]).first();
    if (row) return row.id;
  }
  // 2. Derive from canonical via TAXONOMY
  if (canonical && TAXONOMY[canonical]) {
    const tax = TAXONOMY[canonical];
    const cat = await trx('categories').whereRaw('LOWER(name) = LOWER(?)', [tax.category]).first();
    if (!cat) return null;
    const sub = await trx('sub_categories')
      .where({ category_id: cat.id })
      .whereRaw('LOWER(name) = LOWER(?)', [tax.sub_category])
      .first();
    if (sub) return sub.id;
  }
  return null;
}

// POST /api/inward/opening-stock — bulk import existing stock with vendor barcodes.
// Pass ?dryRun=true (or ?preview=true) to simulate without committing.
// MUST be registered before /:id
router.post('/opening-stock', authenticate, authorize('admin'), upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const dryRun = req.query.dryRun === 'true' || req.query.preview === 'true';

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (rows.length === 0) return res.status(400).json({ success: false, error: 'Sheet is empty' });

  const summary = {
    dry_run: dryRun,
    rows_total: rows.length,
    items_created: 0,
    items_matched: 0,
    aliases_registered: 0,
    batches_created: 0,
    errors: [],
    preview: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];
    const r = {};
    for (const key of Object.keys(raw)) r[key.toLowerCase().trim()] = raw[key];

    const externalBarcode = String(r.existing_barcode || r.barcode || '').trim();
    const itemName = String(r.item_name || r.canonical_name || r.name || '').trim();
    const subCategoryHint = String(r.sub_category || r.sub_category_name || '').trim();
    const qty = parseFloat(r.qty_kg || r.qty || r.quantity);
    const purchaseRate = parseFloat(r.purchase_rate || r.rate || 0);
    const mrp = parseFloat(r.mrp || 0) || null;
    const storageLocation = String(r.storage_location || '').trim() || null;

    if (!externalBarcode && !itemName) {
      summary.errors.push({ row: rowNum, error: 'either existing_barcode or item_name is required' });
      continue;
    }
    if (!qty || Number.isNaN(qty) || qty <= 0) {
      summary.errors.push({ row: rowNum, error: 'qty_kg must be a positive number' });
      continue;
    }

    const receiptDate = r.receipt_date
      ? new Date(r.receipt_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    let expiryDate = null;
    if (r.expiry_date) {
      const parsed = new Date(r.expiry_date);
      if (Number.isNaN(parsed.getTime())) {
        summary.errors.push({ row: rowNum, error: `invalid expiry_date "${r.expiry_date}"` });
        continue;
      }
      expiryDate = parsed.toISOString().split('T')[0];
    }

    const trx = await db.transaction();
    const rowPreview = {
      row: rowNum,
      action: null,             // CREATE_ITEM | MATCH_PRIMARY | MATCH_ALIAS | MATCH_CANONICAL
      item_code: null,
      canonical_name: null,
      category: null,
      sub_category: null,
      vendor_barcode: externalBarcode || null,
      alias_action: 'NONE',     // NONE | REGISTER | ALREADY
      batch_qty: qty,
      receipt_date: receiptDate,
      expiry_date: expiryDate,
      purchase_rate: purchaseRate || null,
    };
    try {
      let item = null;
      let aliasResolved = false;

      // 1. Try primary barcode
      if (externalBarcode) {
        item = await trx('items').where({ barcode: externalBarcode }).first();
        if (item) {
          rowPreview.action = 'MATCH_PRIMARY';
        } else {
          const alias = await trx('item_aliases').where({ alias_barcode: externalBarcode }).first();
          if (alias) {
            item = await trx('items').where({ id: alias.item_id }).first();
            aliasResolved = true;
            rowPreview.action = 'MATCH_ALIAS';
          }
        }
      }

      // 2. Resolve canonical info via normalizer when needed
      let normalized = null;
      if (itemName) normalized = normalize(itemName);

      // 3. Match existing by variant_grade (canonical name) if barcode didn't resolve
      if (!item && normalized && normalized.canonical_name) {
        const sameCanonical = await trx('items')
          .whereRaw('LOWER(variant_grade) = LOWER(?)', [normalized.canonical_name])
          .first();
        if (sameCanonical) {
          item = sameCanonical;
          rowPreview.action = 'MATCH_CANONICAL';
        }
      }

      // 4. Create new item if no match
      if (!item) {
        if (!normalized || !normalized.canonical_name) {
          await trx.rollback();
          summary.errors.push({ row: rowNum, error: 'item_name required when barcode is new' });
          continue;
        }
        const subCategoryId = await resolveSubCategoryId(
          trx, subCategoryHint, normalized.canonical_name
        );
        if (!subCategoryId) {
          await trx.rollback();
          summary.errors.push({
            row: rowNum,
            error: `cannot resolve sub_category for "${normalized.canonical_name}". Supply sub_category column or use a known canonical.`,
          });
          continue;
        }

        const itemCode = await nextItemCode(trx);
        const tempBarcode = 'TEMP_' + require('crypto').randomBytes(8).toString('hex');
        const [created] = await trx('items')
          .insert({
            sub_category_id: subCategoryId,
            item_code: itemCode,
            barcode: tempBarcode,
            unit: 'kg',
            variant_grade: normalized.canonical_name,
            purchase_rate: purchaseRate || null,
            mrp: mrp,
            storage_location: storageLocation,
            description: `Auto-created from opening-stock import (${normalized.category}/${normalized.sub_category})`,
            is_active: true,
          })
          .returning('*');

        const ean13 = generateEAN13(created.id);
        const [updated] = await trx('items')
          .where({ id: created.id })
          .update({ barcode: ean13 })
          .returning('*');

        await logAudit({
          table_name: 'items', record_id: updated.id, action: 'INSERT',
          user_id: req.user.id, new_value: updated,
        }, trx);

        item = updated;
        rowPreview.action = 'CREATE_ITEM';
        summary.items_created++;
      } else {
        summary.items_matched++;
      }

      // Fill canonical info into preview (works for both new + matched paths)
      rowPreview.item_code = item.item_code;
      rowPreview.canonical_name = item.variant_grade;
      if (normalized) {
        rowPreview.category = normalized.category;
        rowPreview.sub_category = normalized.sub_category;
      } else {
        // Look up taxonomy via sub_category join
        const subRow = await trx('sub_categories')
          .join('categories', 'categories.id', 'sub_categories.category_id')
          .where('sub_categories.id', item.sub_category_id)
          .select('sub_categories.name as sub_name', 'categories.name as cat_name')
          .first();
        if (subRow) {
          rowPreview.category = subRow.cat_name;
          rowPreview.sub_category = subRow.sub_name;
        }
      }

      // 5. Register vendor barcode as alias
      if (externalBarcode && externalBarcode !== item.barcode && !aliasResolved) {
        const existsAlias = await trx('item_aliases').where({ alias_barcode: externalBarcode }).first();
        if (!existsAlias) {
          await trx('item_aliases').insert({
            item_id: item.id,
            alias_barcode: externalBarcode,
            alias_name: itemName || null,
          });
          summary.aliases_registered++;
          rowPreview.alias_action = 'REGISTER';
        } else {
          rowPreview.alias_action = 'ALREADY';
        }
      }

      // 6. Create batch
      const [batch] = await trx('batches')
        .insert({
          item_id: item.id,
          receipt_date: receiptDate,
          expiry_date: expiryDate,
          qty_received: qty,
          qty_remaining: qty,
        })
        .returning('*');

      await logAudit({
        table_name: 'batches', record_id: batch.id, action: 'INSERT',
        user_id: req.user.id, new_value: batch,
      }, trx);

      summary.batches_created++;
      summary.preview.push(rowPreview);

      if (dryRun) {
        await trx.rollback();
      } else {
        await trx.commit();
      }
    } catch (e) {
      await trx.rollback();
      summary.errors.push({ row: rowNum, error: e.message });
    }
  }

  // Dry-run never persists counters in the wider system either.
  if (dryRun) {
    // The numbers we report are forecasted: zero out only when nothing happened.
  }

  res.json({ success: true, data: summary });
});

// GET /api/inward/template — download Excel import template
// MUST be registered before /:id to avoid Express treating "template" as an id
router.get('/template', authenticate, (req, res) => {
  const template = [
    { item_code: 'FG-0001', qty: 100, rate: 45.50, expiry_date: '2027-01-01' },
    { item_code: 'FG-0002', qty: 50, rate: 120.00, expiry_date: '2027-06-30' }
  ];
  const ws = XLSX.utils.json_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'InwardImport');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set('Content-Disposition', 'attachment; filename="inward-import-template.xlsx"');
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// PUT /api/inward/lines/:lineId — flat edit by lineId (no parent id in URL)
// MUST be before /:id to avoid Express treating "lines" as an id.
// Status check is done via JOIN to inward_entries.
router.put('/lines/:lineId', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const { lineId } = req.params;

    const line = await db('inward_lines')
      .join('inward_entries', 'inward_entries.id', 'inward_lines.inward_id')
      .where('inward_lines.id', lineId)
      .select('inward_lines.*', 'inward_entries.status as entry_status')
      .first();

    if (!line) return res.status(404).json({ success: false, error: 'Line not found' });
    if (line.entry_status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Cannot modify confirmed/locked inward entry' });
    }

    const { qty, rate, expiry_date } = req.body;
    if (qty !== undefined && (isNaN(Number(qty)) || Number(qty) <= 0)) {
      return res.status(400).json({ success: false, error: 'qty must be greater than 0' });
    }
    if (rate !== undefined && (isNaN(Number(rate)) || Number(rate) <= 0)) {
      return res.status(400).json({ success: false, error: 'rate must be greater than 0' });
    }

    const oldValue = { qty: line.qty, rate: line.rate, expiry_date: line.expiry_date };
    const [updated] = await db('inward_lines')
      .where({ id: lineId })
      .update({
        qty: qty !== undefined ? qty : line.qty,
        rate: rate !== undefined ? rate : line.rate,
        expiry_date: expiry_date !== undefined ? expiry_date : line.expiry_date
      })
      .returning('*');

    await logAudit({
      table_name: 'inward_lines', record_id: Number(lineId), action: 'UPDATE',
      user_id: req.user.id, old_value: oldValue, new_value: { qty: updated.qty, rate: updated.rate, expiry_date: updated.expiry_date }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inward/lines/:lineId — flat delete by lineId
// MUST be before /:id to avoid Express treating "lines" as an id.
router.delete('/lines/:lineId', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const { lineId } = req.params;

    const line = await db('inward_lines')
      .join('inward_entries', 'inward_entries.id', 'inward_lines.inward_id')
      .where('inward_lines.id', lineId)
      .select('inward_lines.*', 'inward_entries.status as entry_status')
      .first();

    if (!line) return res.status(404).json({ success: false, error: 'Line not found' });
    if (line.entry_status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Cannot modify confirmed/locked inward entry' });
    }

    await logAudit({
      table_name: 'inward_lines', record_id: Number(lineId), action: 'DELETE',
      user_id: req.user.id, old_value: { qty: line.qty, rate: line.rate, expiry_date: line.expiry_date, item_id: line.item_id, inward_id: line.inward_id }
    });

    await db('inward_lines').where({ id: lineId }).delete();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/inward/:id/import — import lines from Excel file
router.post('/:id/import', authenticate, authorize('admin', 'purchase', 'warehouse'), upload.single('file'), async (req, res, next) => {
  try {
    const entry = await db('inward_entries').where({ id: req.params.id }).first();
    if (!entry) return res.status(404).json({ success: false, error: 'Inward entry not found' });
    if (entry.status !== 'draft') return res.status(409).json({ success: false, error: 'Can only import lines into draft entries' });

    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const errors = [];
    const validLines = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-indexed, row 1 is header
      const raw = rows[i];

      // Normalise keys to lowercase
      const row = {};
      for (const key of Object.keys(raw)) {
        row[key.toLowerCase().trim()] = raw[key];
      }

      const itemCode = String(row.item_code || '').trim();
      const qtyRaw = row.qty;
      const rateRaw = row.rate;
      const expiryRaw = row.expiry_date || row.expiry || '';

      if (!itemCode) {
        errors.push({ row: rowNum, error: 'item_code is required' });
        continue;
      }

      const item = await db('items').where({ item_code: itemCode }).first();
      if (!item) {
        errors.push({ row: rowNum, error: `item_code ${itemCode} not found` });
        continue;
      }

      const qty = parseFloat(qtyRaw);
      if (qtyRaw == null || qtyRaw === '' || isNaN(qty) || qty <= 0) {
        errors.push({ row: rowNum, error: 'qty must be a positive number' });
        continue;
      }

      const rate = parseFloat(rateRaw);
      if (rateRaw == null || rateRaw === '' || isNaN(rate) || rate <= 0) {
        errors.push({ row: rowNum, error: 'rate must be a positive number' });
        continue;
      }

      let expiryDate = null;
      if (expiryRaw) {
        const parsed = new Date(expiryRaw);
        if (isNaN(parsed.getTime())) {
          errors.push({ row: rowNum, error: `expiry_date "${expiryRaw}" is not a valid date` });
          continue;
        }
        expiryDate = parsed.toISOString().split('T')[0];
      }

      validLines.push({ inward_id: parseInt(req.params.id), item_id: item.id, qty, rate, expiry_date: expiryDate });
    }

    if (validLines.length > 0) {
      await db('inward_lines').insert(validLines);
    }

    res.json({
      success: true,
      data: {
        imported: validLines.length,
        skipped: errors.length,
        errors
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inward/:id — entry detail with lines
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const entry = await db('inward_entries')
      .select('inward_entries.*', 'vendors.name as vendor_name', 'users.name as created_by_name')
      .join('vendors', 'vendors.id', 'inward_entries.vendor_id')
      .join('users', 'users.id', 'inward_entries.created_by')
      .where('inward_entries.id', req.params.id)
      .first();

    if (!entry) return res.status(404).json({ success: false, error: 'Inward entry not found' });

    const lines = await db('inward_lines')
      .select(
        'inward_lines.*',
        'items.item_code',
        'items.unit',
        'sub_categories.name as sub_category_name'
      )
      .join('items', 'items.id', 'inward_lines.item_id')
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .where('inward_lines.inward_id', req.params.id)
      .orderBy('inward_lines.id');

    res.json({ success: true, data: { ...entry, lines } });
  } catch (err) {
    next(err);
  }
});

// POST /api/inward/:id/lines — add line to draft entry
router.post('/:id/lines', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const entry = await db('inward_entries').where({ id: req.params.id }).first();
    if (!entry) return res.status(404).json({ success: false, error: 'Inward entry not found' });
    if (entry.status !== 'draft') return res.status(409).json({ success: false, error: 'Can only add lines to draft entries' });

    const { item_id, qty, rate, expiry_date } = req.body;
    if (!item_id || !qty || !rate) return res.status(400).json({ success: false, error: 'item_id, qty and rate are required' });

    const item = await db('items').where({ id: item_id }).first();
    if (!item) return res.status(400).json({ success: false, error: 'Item not found' });

    const [line] = await db('inward_lines')
      .insert({ inward_id: parseInt(req.params.id), item_id, qty, rate, expiry_date: expiry_date || null })
      .returning('*');

    res.status(201).json({ success: true, data: line });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inward/:id/lines/:line_id — update line (draft only)
router.put('/:id/lines/:line_id', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const entry = await db('inward_entries').where({ id: req.params.id }).first();
    if (!entry) return res.status(404).json({ success: false, error: 'Inward entry not found' });
    if (entry.status !== 'draft') return res.status(409).json({ success: false, error: 'Can only update lines on draft entries' });

    const line = await db('inward_lines').where({ id: req.params.line_id, inward_id: req.params.id }).first();
    if (!line) return res.status(404).json({ success: false, error: 'Line not found' });

    const { qty, rate, expiry_date } = req.body;
    const [updated] = await db('inward_lines')
      .where({ id: req.params.line_id })
      .update({
        qty: qty !== undefined ? qty : line.qty,
        rate: rate !== undefined ? rate : line.rate,
        expiry_date: expiry_date !== undefined ? expiry_date : line.expiry_date
      })
      .returning('*');

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inward/:id/lines/:line_id — remove line (draft only)
router.delete('/:id/lines/:line_id', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const entry = await db('inward_entries').where({ id: req.params.id }).first();
    if (!entry) return res.status(404).json({ success: false, error: 'Inward entry not found' });
    if (entry.status !== 'draft') return res.status(409).json({ success: false, error: 'Can only delete lines on draft entries' });

    const line = await db('inward_lines').where({ id: req.params.line_id, inward_id: req.params.id }).first();
    if (!line) return res.status(404).json({ success: false, error: 'Line not found' });

    await db('inward_lines').where({ id: req.params.line_id }).delete();
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// POST /api/inward/:id/confirm — confirm inward, create batches
router.post('/:id/confirm', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const entry = await trx('inward_entries').where({ id: req.params.id }).first();
    if (!entry) { await trx.rollback(); return res.status(404).json({ success: false, error: 'Inward entry not found' }); }
    if (entry.status !== 'draft') { await trx.rollback(); return res.status(409).json({ success: false, error: 'Entry is not in draft status' }); }

    const lines = await trx('inward_lines').where({ inward_id: req.params.id });
    if (lines.length === 0) { await trx.rollback(); return res.status(409).json({ success: false, error: 'No lines exist on this entry' }); }

    const today = new Date().toISOString().split('T')[0];

    for (const line of lines) {
      const [batch] = await trx('batches')
        .insert({
          item_id: line.item_id,
          receipt_date: today,
          expiry_date: line.expiry_date || null,
          qty_received: line.qty,
          qty_remaining: line.qty
        })
        .returning('*');

      await trx('inward_lines').where({ id: line.id }).update({ batch_id: batch.id });

      await logAudit({
        table_name: 'batches', record_id: batch.id, action: 'INSERT',
        user_id: req.user.id, new_value: batch
      }, trx);
    }

    if (entry.po_id) {
      await trx('purchase_orders').where({ id: entry.po_id }).update({ status: 'received' });
    }

    const [updated] = await trx('inward_entries')
      .where({ id: req.params.id })
      .update({ status: 'confirmed' })
      .returning('*');

    await logAudit({
      table_name: 'inward_entries', record_id: entry.id, action: 'UPDATE',
      user_id: req.user.id, old_value: { status: 'draft' }, new_value: { status: 'confirmed' }
    }, trx);

    await trx.commit();
    res.json({ success: true, data: updated });
  } catch (err) {
    await trx.rollback();
    next(err);
  }
});

// POST /api/inward/:id/lock — lock confirmed entry
router.post('/:id/lock', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const entry = await db('inward_entries').where({ id: req.params.id }).first();
    if (!entry) return res.status(404).json({ success: false, error: 'Inward entry not found' });
    if (entry.status !== 'confirmed') return res.status(409).json({ success: false, error: 'Entry must be confirmed before locking' });

    const [updated] = await db('inward_entries')
      .where({ id: req.params.id })
      .update({ status: 'locked', locked_at: new Date() })
      .returning('*');

    await logAudit({
      table_name: 'inward_entries', record_id: entry.id, action: 'LOCK',
      user_id: req.user.id, old_value: { status: 'confirmed' }, new_value: { status: 'locked' }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
