const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const { businessToday, toBusinessDateStr } = require('../services/dates');
const { escapeHtml } = require('../services/html');

const router = express.Router();

async function fifoPick(itemId, qtyRequired, trx) {
  // Business "today" in IST — must match the nightly expiry cutoff so a batch
  // is never dropped from FIFO while still counted as sellable (or vice-versa).
  const today = businessToday();
  const batches = await trx('batches')
    .where({ item_id: itemId })
    .where('qty_remaining', '>', 0)
    .where(function () {
      this.whereNull('expiry_date').orWhere('expiry_date', '>=', today);
    })
    .orderBy('receipt_date', 'asc')
    .forUpdate();

  let remaining = qtyRequired;
  const picks = [];

  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.qty_remaining, remaining);
    picks.push({ batch_id: b.id, expiry: b.expiry_date, take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(`INSUFFICIENT_STOCK: short by ${remaining} kg`);
  }

  return picks;
}

// GET /api/outward — list outward entries
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, customer_id } = req.query;
    let query = db('outward_entries')
      .select(
        'outward_entries.*',
        'customers.name as customer_name',
        'users.name as created_by_name'
      )
      .join('customers', 'customers.id', 'outward_entries.customer_id')
      .join('users', 'users.id', 'outward_entries.created_by')
      .orderBy('outward_entries.id', 'desc');

    if (status) query = query.where('outward_entries.status', status);
    if (customer_id) query = query.where('outward_entries.customer_id', customer_id);

    const entries = await query;
    res.json({ success: true, data: entries });
  } catch (err) {
    next(err);
  }
});

// POST /api/outward — create outward entry (draft)
router.post('/', authenticate, authorize('admin', 'sales'), async (req, res, next) => {
  try {
    const { customer_id, dispatch_date } = req.body;
    if (!customer_id || !dispatch_date) {
      return res.status(400).json({ success: false, error: 'customer_id and dispatch_date are required' });
    }
    const customer = await db('customers').where({ id: customer_id }).first();
    if (!customer) return res.status(400).json({ success: false, error: 'Customer not found' });

    const [entry] = await db('outward_entries')
      .insert({ customer_id, dispatch_date, status: 'draft', created_by: req.user.id })
      .returning('*');

    await logAudit({ table_name: 'outward_entries', record_id: entry.id, action: 'INSERT', user_id: req.user.id, new_value: entry });
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

// GET /api/outward/:id — outward detail with lines
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const entry = await db('outward_entries')
      .select('outward_entries.*', 'customers.name as customer_name', 'customers.contact as customer_contact', 'customers.address as customer_address', 'users.name as created_by_name')
      .join('customers', 'customers.id', 'outward_entries.customer_id')
      .join('users', 'users.id', 'outward_entries.created_by')
      .where('outward_entries.id', req.params.id)
      .first();

    if (!entry) return res.status(404).json({ success: false, error: 'Outward entry not found' });

    const lines = await db('outward_lines')
      .select(
        'outward_lines.*',
        'items.item_code',
        'items.unit',
        'sub_categories.name as sub_category_name',
        'batches.receipt_date',
        'batches.expiry_date as batch_expiry'
      )
      .join('items', 'items.id', 'outward_lines.item_id')
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .leftJoin('batches', 'batches.id', 'outward_lines.batch_id')
      .where('outward_lines.outward_id', req.params.id)
      .orderBy('outward_lines.id');

    res.json({ success: true, data: { ...entry, lines } });
  } catch (err) {
    next(err);
  }
});

// POST /api/outward/:id/lines — add line (draft only), validate FIFO stock
router.post('/:id/lines', authenticate, authorize('admin', 'sales'), async (req, res, next) => {
  try {
    const entry = await db('outward_entries').where({ id: req.params.id }).first();
    if (!entry) return res.status(404).json({ success: false, error: 'Outward entry not found' });
    if (entry.status !== 'draft') return res.status(409).json({ success: false, error: 'Can only add lines to draft entries' });

    const { item_id, qty, rate } = req.body;
    if (!item_id || !qty) return res.status(400).json({ success: false, error: 'item_id and qty are required' });

    const item = await db('items').where({ id: item_id }).first();
    if (!item) return res.status(400).json({ success: false, error: 'Item not found' });

    // Validate FIFO availability for this item's CUMULATIVE pending qty across
    // all draft lines — not just this line alone — so two lines for the same
    // item can't both pass here and then fail (permanently) at confirm.
    const pending = await db('outward_lines')
      .where({ outward_id: req.params.id, item_id })
      .whereNull('batch_id')
      .sum({ q: 'qty' })
      .first();
    const cumulativeQty = (parseFloat(pending && pending.q) || 0) + parseFloat(qty);

    const trx = await db.transaction();
    try {
      await fifoPick(item_id, cumulativeQty, trx);
      await trx.rollback();
    } catch (fifoErr) {
      await trx.rollback();
      if (fifoErr.message.startsWith('INSUFFICIENT_STOCK')) {
        return res.status(409).json({ success: false, error: fifoErr.message });
      }
      throw fifoErr;
    }

    const [line] = await db('outward_lines')
      .insert({ outward_id: parseInt(req.params.id), item_id, qty, rate: rate || null, batch_id: null })
      .returning('*');

    res.status(201).json({ success: true, data: line });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/outward/:id/lines/:line_id — remove line (draft only)
router.delete('/:id/lines/:line_id', authenticate, authorize('admin', 'sales'), async (req, res, next) => {
  const trx = await db.transaction();
  try {
    const entry = await trx('outward_entries').where({ id: req.params.id }).first();
    if (!entry) { await trx.rollback(); return res.status(404).json({ success: false, error: 'Outward entry not found' }); }
    if (entry.status !== 'draft') { await trx.rollback(); return res.status(409).json({ success: false, error: 'Can only delete lines on draft entries' }); }

    const line = await trx('outward_lines').where({ id: req.params.line_id, outward_id: req.params.id }).first();
    if (!line) { await trx.rollback(); return res.status(404).json({ success: false, error: 'Line not found' }); }

    await trx('outward_lines').where({ id: req.params.line_id }).delete();
    await trx.commit();
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    await trx.rollback();
    next(err);
  }
});

// POST /api/outward/:id/confirm — run FIFO, deduct stock
router.post('/:id/confirm', authenticate, authorize('admin', 'sales'), async (req, res, next) => {
  const trx = await db.transaction();
  try {
    // Row-lock the entry so two concurrent confirms can't both pass the draft
    // check and deduct stock twice. The second request blocks here, then re-reads
    // the committed row (now 'confirmed') and is rejected below.
    const entry = await trx('outward_entries').where({ id: req.params.id }).forUpdate().first();
    if (!entry) { await trx.rollback(); return res.status(404).json({ success: false, error: 'Outward entry not found' }); }
    if (entry.status !== 'draft') { await trx.rollback(); return res.status(409).json({ success: false, error: 'Entry is not in draft status' }); }

    const lines = await trx('outward_lines').where({ outward_id: req.params.id, batch_id: null });
    if (lines.length === 0) { await trx.rollback(); return res.status(409).json({ success: false, error: 'No pending lines to confirm' }); }

    for (const line of lines) {
      const picks = await fifoPick(line.item_id, parseFloat(line.qty), trx);

      await trx('outward_lines').where({ id: line.id }).delete();

      for (const pick of picks) {
        await trx('outward_lines').insert({
          outward_id: parseInt(req.params.id),
          item_id: line.item_id,
          batch_id: pick.batch_id,
          qty: pick.take,
          rate: line.rate
        });

        await trx('batches')
          .where({ id: pick.batch_id })
          .update({ qty_remaining: db.raw('qty_remaining - ?', [pick.take]) });

        await logAudit({
          table_name: 'batches', record_id: pick.batch_id, action: 'UPDATE',
          user_id: req.user.id,
          changed_fields: { qty_remaining: true },
          old_value: { qty_remaining: 'previous' },
          new_value: { deducted: pick.take }
        }, trx);
      }
    }

    const [updated] = await trx('outward_entries')
      .where({ id: req.params.id })
      .update({ status: 'confirmed' })
      .returning('*');

    await logAudit({
      table_name: 'outward_entries', record_id: entry.id, action: 'UPDATE',
      user_id: req.user.id, old_value: { status: 'draft' }, new_value: { status: 'confirmed' }
    }, trx);

    await trx.commit();
    res.json({ success: true, data: updated });
  } catch (err) {
    await trx.rollback();
    if (err.message && err.message.startsWith('INSUFFICIENT_STOCK')) {
      return res.status(409).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// POST /api/outward/:id/lock — lock confirmed entry, generate challan_no
router.post('/:id/lock', authenticate, authorize('admin', 'sales'), async (req, res, next) => {
  const trx = await db.transaction();
  try {
    // Row-lock the entry so two concurrent locks can't both generate a challan
    // number for the same entry (the second would overwrite the first).
    const entry = await trx('outward_entries').where({ id: req.params.id }).forUpdate().first();
    if (!entry) { await trx.rollback(); return res.status(404).json({ success: false, error: 'Outward entry not found' }); }
    if (entry.status !== 'confirmed') { await trx.rollback(); return res.status(409).json({ success: false, error: 'Entry must be confirmed before locking' }); }

    // Challan numbers are sequential per dispatch DATE. Format the date in
    // business tz (IST) — pg returns dispatch_date as a local-midnight Date, so
    // toISOString() would shift it to the previous day on IST/positive-offset
    // hosts, producing a wrong date segment and a two-day count window.
    const dispatchDateStr = toBusinessDateStr(entry.dispatch_date); // 'YYYY-MM-DD'
    const dateStr = dispatchDateStr.replace(/-/g, '');              // 'YYYYMMDD'

    // Advisory lock prevents two concurrent lock operations on the same date
    // from generating duplicate challan numbers.
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext('challan_seq'))");

    const countRow = await trx('outward_entries')
      .where('status', 'locked')
      .where('dispatch_date', dispatchDateStr)
      .count('id as cnt')
      .first();

    const seq = (parseInt(countRow.cnt) || 0) + 1;
    const challan_no = `CH-${dateStr}-${String(seq).padStart(4, '0')}`;

    const [updated] = await trx('outward_entries')
      .where({ id: req.params.id })
      .update({ status: 'locked', locked_at: new Date(), challan_no })
      .returning('*');

    await logAudit({
      table_name: 'outward_entries', record_id: entry.id, action: 'LOCK',
      user_id: req.user.id, old_value: { status: 'confirmed' }, new_value: { status: 'locked', challan_no }
    }, trx);

    await trx.commit();
    res.json({ success: true, data: updated });
  } catch (err) {
    await trx.rollback();
    next(err);
  }
});

// GET /api/outward/:id/challan — server-rendered HTML challan for print/save-PDF
router.get('/:id/challan', authenticate, async (req, res, next) => {
  try {
    const entry = await db('outward_entries')
      .select(
        'outward_entries.*',
        'customers.name as customer_name',
        'customers.contact as customer_contact',
        'customers.address as customer_address'
      )
      .join('customers', 'customers.id', 'outward_entries.customer_id')
      .where('outward_entries.id', req.params.id)
      .first();

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Outward entry not found' });
    }

    const lines = await db('outward_lines')
      .select(
        'outward_lines.*',
        'items.item_code',
        'items.unit',
        'items.variant_grade',
        'sub_categories.name as sub_category_name',
        'batches.expiry_date as batch_expiry'
      )
      .join('items', 'items.id', 'outward_lines.item_id')
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .leftJoin('batches', 'batches.id', 'outward_lines.batch_id')
      .where('outward_lines.outward_id', req.params.id)
      .orderBy('outward_lines.id');

    const isDraft = entry.status !== 'locked';
    const challanNo = entry.challan_no || 'DRAFT';
    const dispatchDate = entry.dispatch_date
      ? new Date(entry.dispatch_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const createdAt = entry.created_at
      ? new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const generatedAt = new Date().toLocaleString('en-IN');

    let totalQty = 0;
    let totalAmount = 0;

    const rowsHtml = lines.map((l, idx) => {
      const itemName = l.variant_grade
        ? `${l.sub_category_name} — ${l.variant_grade}`
        : l.sub_category_name;
      const qty = parseFloat(l.qty || 0);
      const rate = l.rate != null ? parseFloat(l.rate) : null;
      const subtotal = rate != null ? qty * rate : null;
      totalQty += qty;
      if (subtotal != null) totalAmount += subtotal;

      const batchExpiry = l.batch_expiry
        ? new Date(l.batch_expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';

      return `<tr>
        <td>${idx + 1}</td>
        <td><span style="font-family:monospace;font-size:11px;background:#f5f5f5;padding:1px 5px;border-radius:3px;">${escapeHtml(l.item_code)}</span></td>
        <td>${escapeHtml(itemName)}</td>
        <td>${batchExpiry}</td>
        <td>${escapeHtml(l.unit || 'kg')}</td>
        <td>${qty.toFixed(2)}</td>
        <td>${rate != null ? '&#8377;' + rate.toFixed(2) : '&mdash;'}</td>
        <td>${subtotal != null ? '&#8377;' + subtotal.toFixed(2) : '&mdash;'}</td>
      </tr>`;
    }).join('\n');

    const draftWatermark = isDraft
      ? `<div style="position:fixed;top:50%;left:50%;transform:rotate(-45deg) translate(-50%,-50%);font-size:80px;color:rgba(255,0,0,0.1);font-weight:bold;pointer-events:none;white-space:nowrap;z-index:999;">DRAFT</div>`
      : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Challan #${challanNo}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
    .header { text-align: center; margin-bottom: 20px; }
    .company { font-size: 20px; font-weight: bold; color: #2d6a4f; }
    .challan-title { font-size: 16px; font-weight: bold; margin: 10px 0; }
    .meta { display: flex; justify-content: space-between; margin: 20px 0; }
    .meta-block { flex: 1; }
    .meta-block h4 { margin: 0 0 5px; font-size: 11px; color: #666; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #2d6a4f; color: white; padding: 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #f9f9f9; }
    .total-row td { font-weight: bold; border-top: 2px solid #333; background: #f0f0f0; }
    .footer { margin-top: 40px; display: flex; justify-content: space-between; }
    .sign-box { text-align: center; width: 150px; }
    .sign-line { border-top: 1px solid #333; padding-top: 5px; margin-top: 30px; font-size: 11px; }
    @media print {
      body { margin: 20px; }
      .no-print { display: none; }
      @page { size: A4; margin: 1cm; }
    }
  </style>
</head>
<body>
  ${draftWatermark}
  <div class="no-print" style="background:#e8f5e9;padding:10px;margin-bottom:20px;border-radius:4px;">
    <button onclick="window.print()" style="background:#2d6a4f;color:white;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:14px;">Print / Save PDF</button>
    <button onclick="window.close()" style="background:#666;color:white;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:14px;margin-left:10px;">Close</button>
  </div>

  <div class="header">
    <div class="company">FG Inventory &mdash; Food &amp; Grains</div>
    <div class="challan-title">DELIVERY CHALLAN</div>
    <div>Challan No: <strong>${challanNo}</strong> | Date: <strong>${dispatchDate}</strong></div>
  </div>

  <div class="meta">
    <div class="meta-block">
      <h4>Bill To</h4>
      <strong>${escapeHtml(entry.customer_name)}</strong><br>
      ${escapeHtml(entry.customer_contact || '')}<br>
      ${escapeHtml(entry.customer_address || '')}
    </div>
    <div class="meta-block" style="text-align:right">
      <h4>Challan Details</h4>
      Status: ${entry.status.toUpperCase()}<br>
      Dispatch Date: ${dispatchDate}<br>
      Created: ${createdAt}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Item Code</th><th>Item Name</th><th>Batch Expiry</th><th>Unit</th><th>Qty</th><th>Rate (&#8377;)</th><th>Amount (&#8377;)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="5"></td><td>${totalQty.toFixed(2)}</td><td></td><td>&#8377;${totalAmount.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div class="sign-box"><div class="sign-line">Prepared By</div></div>
    <div class="sign-box"><div class="sign-line">Received By</div></div>
    <div class="sign-box"><div class="sign-line">Authorized By</div></div>
  </div>

  <p style="font-size:10px;color:#999;margin-top:40px;text-align:center;">
    This is a computer-generated challan. Generated on ${generatedAt}.
  </p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// GET /api/outward/challan/:id — challan print view (locked only)
router.get('/challan/:id', authenticate, async (req, res, next) => {
  try {
    const entry = await db('outward_entries')
      .select('outward_entries.*', 'customers.name as customer_name', 'customers.contact as customer_contact', 'customers.address as customer_address')
      .join('customers', 'customers.id', 'outward_entries.customer_id')
      .where('outward_entries.id', req.params.id)
      .where('outward_entries.status', 'locked')
      .first();

    if (!entry) return res.status(404).json({ success: false, error: 'Challan not found or entry not locked' });

    const lines = await db('outward_lines')
      .select(
        'outward_lines.*',
        'items.item_code',
        'items.unit',
        'items.variant_grade',
        'sub_categories.name as sub_category_name',
        'batches.expiry_date as batch_expiry'
      )
      .join('items', 'items.id', 'outward_lines.item_id')
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .leftJoin('batches', 'batches.id', 'outward_lines.batch_id')
      .where('outward_lines.outward_id', req.params.id)
      .orderBy('outward_lines.id');

    res.json({ success: true, data: { ...entry, lines } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
