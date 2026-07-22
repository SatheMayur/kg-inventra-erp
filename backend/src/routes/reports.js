const express = require('express');
const XLSX = require('xlsx');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { runNightly } = require('../jobs/nightly');

const router = express.Router();

function ragColor(daysToExpiry) {
  const d = parseFloat(daysToExpiry);
  if (d <= 7) return 'red';
  if (d <= 30) return 'amber';
  return 'green';
}

function itemPnL(item) {
  const grossMargin = (item.avgDispatchRate - item.purchaseRate) * item.qtyDispatched;
  const shrinkage = item.expiredQty * item.purchaseRate;
  const netMargin = grossMargin - shrinkage;
  const marginPct = item.purchaseRate && item.qtyDispatched
    ? Math.round((netMargin / (item.purchaseRate * item.qtyDispatched)) * 100)
    : 0;
  return { grossMargin, shrinkage, netMargin, marginPct };
}

// GET /api/reports/expiry-alerts?days=30
router.get('/expiry-alerts', authenticate, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
    const rows = await db.raw(`
      SELECT
        b.id as batch_id, b.expiry_date, b.qty_remaining, b.risk_score,
        i.item_code, i.id as item_id,
        COALESCE(i.variant_grade, sc.name) as item_name,
        sc.name as sub_category_name,
        c.name as category_name,
        (b.expiry_date::date - CURRENT_DATE) as days_to_expiry
      FROM batches b
      JOIN items i ON i.id = b.item_id
      JOIN sub_categories sc ON sc.id = i.sub_category_id
      JOIN categories c ON c.id = sc.category_id
      WHERE b.qty_remaining > 0
        AND b.expiry_date IS NOT NULL
        AND b.expiry_date <= CURRENT_DATE + (? * INTERVAL '1 day')
      ORDER BY b.expiry_date ASC
    `, [safeDays]);
    const data = rows.rows.map(r => ({ ...r, rag: ragColor(r.days_to_expiry) }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/low-stock
router.get('/low-stock', authenticate, async (req, res, next) => {
  try {
    const rows = await db.raw(`
      SELECT
        i.id as item_id,
        i.item_code,
        COALESCE(i.variant_grade, sc.name) as item_name,
        sc.name as sub_category_name,
        c.name as category_name,
        i.unit,
        COALESCE(SUM(b.qty_remaining), 0) as live_stock_kg,
        i.rop_kg,
        GREATEST(i.rop_kg - COALESCE(SUM(b.qty_remaining), 0), 0) as shortage
      FROM items i
      JOIN sub_categories sc ON sc.id = i.sub_category_id
      JOIN categories c ON c.id = sc.category_id
      LEFT JOIN batches b ON b.item_id = i.id AND b.qty_remaining > 0
      WHERE i.rop_kg > 0
      GROUP BY i.id, i.item_code, i.variant_grade, sc.name, c.name, i.unit, i.rop_kg
      HAVING COALESCE(SUM(b.qty_remaining), 0) <= i.rop_kg
      ORDER BY shortage DESC
    `);
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/dead-stock?days=30
router.get('/dead-stock', authenticate, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
    // Items with stock on hand that had NO locked dispatch in the last N days.
    const rows = await db.raw(`
      WITH recent_dispatch AS (
        SELECT DISTINCT ol.item_id, MAX(oe.locked_at) AS last_dispatch
        FROM outward_lines ol
        JOIN outward_entries oe ON oe.id = ol.outward_id
        WHERE oe.status = 'locked'
          AND oe.locked_at >= NOW() - (? * INTERVAL '1 day')
        GROUP BY ol.item_id
      ),
      ever_dispatched AS (
        SELECT DISTINCT ol.item_id, MAX(oe.locked_at) AS last_dispatch_ever
        FROM outward_lines ol
        JOIN outward_entries oe ON oe.id = ol.outward_id
        WHERE oe.status = 'locked'
        GROUP BY ol.item_id
      )
      SELECT
        i.item_code,
        i.id AS item_id,
        COALESCE(i.variant_grade, sc.name) AS item_name,
        sc.name AS sub_category_name,
        COALESCE(SUM(b.qty_remaining), 0) AS stock_kg,
        ed.last_dispatch_ever AS last_dispatch
      FROM items i
      JOIN sub_categories sc ON sc.id = i.sub_category_id
      JOIN batches b ON b.item_id = i.id AND b.qty_remaining > 0
      LEFT JOIN recent_dispatch rd ON rd.item_id = i.id
      LEFT JOIN ever_dispatched ed ON ed.item_id = i.id
      WHERE rd.item_id IS NULL
      GROUP BY i.id, i.item_code, i.variant_grade, sc.name, ed.last_dispatch_ever
      ORDER BY stock_kg DESC
    `, [safeDays]);
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/expired-batches — batches where expired_at IS NOT NULL (expired_qty > 0)
// Optional: ?month=2026-05 to filter by expired_at month
router.get('/expired-batches', authenticate, async (req, res, next) => {
  try {
    const monthParam = req.query.month;
    let query = db('batches')
      .join('items', 'items.id', 'batches.item_id')
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .whereNotNull('batches.expired_at')
      .where('batches.expired_qty', '>', 0)
      .select(
        'batches.id as batch_id',
        'batches.expiry_date',
        'batches.expired_qty',
        'batches.expired_at',
        'items.item_code',
        'items.purchase_rate',
        'sub_categories.name as sub_category_name'
      )
      .orderBy('batches.expired_at', 'desc');

    if (monthParam) {
      const [year, month] = monthParam.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      query = query.where('batches.expired_at', '>=', start).where('batches.expired_at', '<', end);
    }

    const rows = await query;
    const data = rows.map(r => ({
      ...r,
      shrinkage_value: (parseFloat(r.expired_qty) || 0) * (parseFloat(r.purchase_rate) || 0)
    }));

    const total_shrinkage = data.reduce((sum, r) => sum + r.shrinkage_value, 0);
    res.json({ success: true, data, total_shrinkage });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/margin?from=2026-05-01&to=2026-05-31  (or ?month=2026-05 for legacy)
router.get('/margin', authenticate, async (req, res, next) => {
  try {
    let start, end;
    if (req.query.from && req.query.to) {
      start = new Date(req.query.from);
      end = new Date(req.query.to);
      end.setDate(end.getDate() + 1); // make end inclusive
    } else {
      const monthParam = req.query.month || new Date().toISOString().slice(0, 7);
      const [year, month] = monthParam.split('-').map(Number);
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 1);
    }

    const dispatched = await db('outward_lines')
      .join('outward_entries', 'outward_entries.id', 'outward_lines.outward_id')
      .join('items', 'items.id', 'outward_lines.item_id')
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .where('outward_entries.status', 'locked')
      .where('outward_entries.dispatch_date', '>=', start)
      .where('outward_entries.dispatch_date', '<', end)
      .groupBy('items.id', 'items.item_code', 'items.variant_grade', 'items.purchase_rate', 'sub_categories.name')
      .select(
        'items.id as item_id',
        'items.item_code',
        'items.variant_grade',
        'items.purchase_rate',
        'sub_categories.name as sub_category_name',
        db.raw('SUM(outward_lines.qty) as qty_dispatched'),
        db.raw('AVG(outward_lines.rate) as avg_dispatch_rate')
      );

    // Include item fields on the expired aggregate so items that ONLY had
    // shrinkage (expired but no dispatch in the period) still appear and count
    // toward total shrinkage / net margin — a dispatched.map alone drops them.
    const expired = await db('batches')
      .join('items', 'items.id', 'batches.item_id')
      .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
      .where('batches.expired_at', '>=', start)
      .where('batches.expired_at', '<', end)
      .groupBy('items.id', 'items.item_code', 'items.variant_grade', 'items.purchase_rate', 'sub_categories.name')
      .select(
        'items.id as item_id',
        'items.item_code',
        'items.variant_grade',
        'items.purchase_rate',
        'sub_categories.name as sub_category_name',
        db.raw('SUM(batches.expired_qty) as expired_qty')
      );

    // Merge dispatched + expired into one row per item (union of both sets).
    const byItem = new Map();
    for (const row of dispatched) {
      byItem.set(row.item_id, {
        item_id: row.item_id,
        item_code: row.item_code,
        item_name: row.variant_grade || row.sub_category_name,
        sub_category_name: row.sub_category_name,
        purchase_rate: parseFloat(row.purchase_rate) || 0,
        qty_dispatched: parseFloat(row.qty_dispatched) || 0,
        avg_dispatch_rate: parseFloat(row.avg_dispatch_rate) || 0,
        expired_qty: 0,
      });
    }
    for (const row of expired) {
      const existing = byItem.get(row.item_id);
      if (existing) {
        existing.expired_qty = parseFloat(row.expired_qty) || 0;
      } else {
        byItem.set(row.item_id, {
          item_id: row.item_id,
          item_code: row.item_code,
          item_name: row.variant_grade || row.sub_category_name,
          sub_category_name: row.sub_category_name,
          purchase_rate: parseFloat(row.purchase_rate) || 0,
          qty_dispatched: 0,
          avg_dispatch_rate: 0,
          expired_qty: parseFloat(row.expired_qty) || 0,
        });
      }
    }

    const result = [...byItem.values()].map(row => {
      const pnl = itemPnL({
        avgDispatchRate: row.avg_dispatch_rate,
        purchaseRate: row.purchase_rate,
        qtyDispatched: row.qty_dispatched,
        expiredQty: row.expired_qty
      });
      return {
        item_id: row.item_id,
        item_code: row.item_code,
        item_name: row.item_name,
        sub_category_name: row.sub_category_name,
        qty_dispatched: row.qty_dispatched,
        avg_dispatch_rate: row.avg_dispatch_rate,
        purchase_rate: row.purchase_rate,
        expired_qty: row.expired_qty,
        ...pnl
      };
    });

    result.sort((a, b) => a.netMargin - b.netMargin);

    const totals = result.reduce((acc, r) => {
      acc.totalGrossMargin += r.grossMargin || 0;
      acc.totalShrinkage += r.shrinkage || 0;
      acc.totalNetMargin += r.netMargin || 0;
      return acc;
    }, { totalGrossMargin: 0, totalShrinkage: 0, totalNetMargin: 0 });

    res.json({ success: true, data: { items: result, totals } });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/vendor-history?vendorId=&from=&to=
router.get('/vendor-history', authenticate, async (req, res, next) => {
  try {
    const vendorId = parseInt(req.query.vendorId);
    if (!vendorId) {
      return res.status(400).json({ success: false, error: 'vendorId is required' });
    }

    const vendor = await db('vendors').where({ id: vendorId }).first();
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to) : null;

    // Summary: total orders, entries, qty, value
    const summaryRow = await db('inward_entries')
      .join('inward_lines', 'inward_lines.inward_id', 'inward_entries.id')
      .where('inward_entries.vendor_id', vendorId)
      .where('inward_entries.status', 'locked')
      .modify(q => {
        if (fromDate) q.where('inward_entries.invoice_date', '>=', fromDate);
        if (toDate) q.where('inward_entries.invoice_date', '<=', toDate);
      })
      .select(
        db.raw('COUNT(DISTINCT inward_entries.id) AS total_inward_entries'),
        db.raw('COUNT(DISTINCT inward_entries.po_id) FILTER (WHERE inward_entries.po_id IS NOT NULL) AS total_orders'),
        db.raw('SUM(inward_lines.qty) AS total_qty'),
        db.raw('SUM(inward_lines.qty * inward_lines.rate) AS total_value')
      )
      .first();

    const totalValue = parseFloat(summaryRow.total_value) || 0;
    const totalEntries = parseInt(summaryRow.total_inward_entries) || 0;

    // Monthly spend: last 12 months
    const monthlyRows = await db.raw(`
      SELECT
        to_char(date_trunc('month', ie.invoice_date::date), 'YYYY-MM') AS month,
        SUM(il.qty) AS qty,
        SUM(il.qty * il.rate) AS value
      FROM inward_entries ie
      JOIN inward_lines il ON il.inward_id = ie.id
      WHERE ie.vendor_id = ?
        AND ie.status = 'locked'
        AND ie.invoice_date >= NOW() - INTERVAL '12 months'
      GROUP BY 1
      ORDER BY 1 ASC
    `, [vendorId]);

    // Top 10 items by qty
    const topItemsRows = await db('inward_entries')
      .join('inward_lines', 'inward_lines.inward_id', 'inward_entries.id')
      .join('items', 'items.id', 'inward_lines.item_id')
      .where('inward_entries.vendor_id', vendorId)
      .where('inward_entries.status', 'locked')
      .modify(q => {
        if (fromDate) q.where('inward_entries.invoice_date', '>=', fromDate);
        if (toDate) q.where('inward_entries.invoice_date', '<=', toDate);
      })
      .groupBy('items.id', 'items.item_code')
      .select(
        'items.item_code as itemCode',
        db.raw("COALESCE(items.hsn_code, items.item_code) AS name"),
        db.raw('SUM(inward_lines.qty) AS total_qty'),
        db.raw('SUM(inward_lines.qty * inward_lines.rate) AS total_value')
      )
      .orderBy('total_qty', 'desc')
      .limit(10);

    // Recent 20 entries
    const recentEntries = await db('inward_entries')
      .where({ vendor_id: vendorId, status: 'locked' })
      .modify(q => {
        if (fromDate) q.where('invoice_date', '>=', fromDate);
        if (toDate) q.where('invoice_date', '<=', toDate);
      })
      .orderBy('locked_at', 'desc')
      .limit(20)
      .select('id', 'invoice_no', 'invoice_date', 'status', 'created_at');

    const recentIds = recentEntries.map(e => e.id);
    const lineSummary = recentIds.length
      ? await db('inward_lines')
          .whereIn('inward_id', recentIds)
          .groupBy('inward_id')
          .select('inward_id')
          .sum({ total_value: db.raw('qty * rate') })
          .count({ line_count: '*' })
      : [];
    const lineSummaryById = new Map(lineSummary.map(r => [r.inward_id, r]));

    const enrichedEntries = recentEntries.map(entry => {
      const s = lineSummaryById.get(entry.id);
      return {
        id: entry.id,
        invoiceNo: entry.invoice_no,
        invoiceDate: entry.invoice_date,
        status: entry.status,
        createdAt: entry.created_at,
        lineCount: s ? parseInt(s.line_count) || 0 : 0,
        totalValue: s ? parseFloat(s.total_value) || 0 : 0
      };
    });

    res.json({
      success: true,
      data: {
        vendor: {
          id: vendor.id,
          name: vendor.name,
          gstin: vendor.gstin,
          contact: vendor.contact,
          payment_terms: vendor.payment_terms
        },
        summary: {
          totalOrders: parseInt(summaryRow.total_orders) || 0,
          totalInwardEntries: totalEntries,
          totalQty: parseFloat(summaryRow.total_qty) || 0,
          totalValue,
          avgOrderValue: totalEntries > 0 ? Math.round(totalValue / totalEntries) : 0
        },
        monthlySpend: monthlyRows.rows.map(r => ({
          month: r.month,
          qty: parseFloat(r.qty) || 0,
          value: parseFloat(r.value) || 0
        })),
        topItems: topItemsRows.map(r => ({
          itemCode: r.itemCode,
          name: r.name,
          totalQty: parseFloat(r.total_qty) || 0,
          totalValue: parseFloat(r.total_value) || 0
        })),
        recentEntries: enrichedEntries
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/vendor-history/:vendor_id
router.get('/vendor-history/:vendor_id', authenticate, async (req, res, next) => {
  try {
    const vendor = await db('vendors').where({ id: req.params.vendor_id }).first();
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const entries = await db('inward_entries')
      .where({ vendor_id: req.params.vendor_id, status: 'locked' })
      .orderBy('locked_at', 'desc')
      .select('*');

    // One query: per-entry total + line count, indexed by inward_id.
    const entryIds = entries.map(e => e.id);
    const summaryRows = entryIds.length
      ? await db('inward_lines')
          .whereIn('inward_id', entryIds)
          .groupBy('inward_id')
          .select('inward_id')
          .sum({ total_value: db.raw('qty * rate') })
          .count({ line_count: '*' })
      : [];
    const summaryById = new Map(summaryRows.map(r => [r.inward_id, r]));

    let grandTotal = 0;
    const enriched = entries.map(entry => {
      const s = summaryById.get(entry.id);
      const entryTotal = s ? parseFloat(s.total_value) || 0 : 0;
      grandTotal += entryTotal;
      return { ...entry, total_value: entryTotal, line_count: s ? parseInt(s.line_count) || 0 : 0 };
    });

    res.json({ success: true, data: { vendor, entries: enriched, grand_total: grandTotal, entry_count: enriched.length } });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/export/:type
router.get('/export/:type', authenticate, async (req, res, next) => {
  try {
    const { type } = req.params;
    let rows = [];
    let sheetName = 'Sheet1';

    if (type === 'items') {
      sheetName = 'Items';
      const data = await db('items')
        .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
        .join('categories', 'categories.id', 'sub_categories.category_id')
        .leftJoin(
          db('batches').where('qty_remaining', '>', 0).groupBy('item_id')
            .select('item_id', db.raw('SUM(qty_remaining) as live_stock')).as('stock'),
          'stock.item_id', 'items.id'
        )
        .select(
          'items.item_code', 'items.barcode', 'items.hsn_code',
          'sub_categories.name as sub_category', 'categories.name as category',
          'items.unit', 'items.variant_grade', 'items.purchase_rate', 'items.mrp',
          'items.rop_kg', db.raw('COALESCE(stock.live_stock, 0) as live_stock_kg')
        )
        .orderBy('items.item_code');
      rows = data.map(r => ({
        'Item Code': r.item_code,
        'Barcode': r.barcode,
        'HSN Code': r.hsn_code || '',
        'Category': r.category,
        'Sub Category': r.sub_category,
        'Unit': r.unit,
        'Grade/Variant': r.variant_grade || '',
        'Purchase Rate': r.purchase_rate || '',
        'MRP': r.mrp || '',
        'Live Stock (kg)': parseFloat(r.live_stock_kg) || 0,
        'ROP (kg)': r.rop_kg || 0
      }));

    } else if (type === 'stock') {
      sheetName = 'Stock';
      const data = await db('batches')
        .join('items', 'items.id', 'batches.item_id')
        .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
        .where('batches.qty_remaining', '>', 0)
        .select(
          'items.item_code', 'batches.id as batch_id', 'batches.receipt_date',
          'batches.expiry_date', 'batches.qty_remaining', 'batches.risk_score',
          'sub_categories.name as sub_category'
        )
        .orderBy('items.item_code')
        .orderBy('batches.receipt_date', 'asc');
      rows = data.map(r => ({
        'Item Code': r.item_code,
        'Sub Category': r.sub_category,
        'Batch ID': r.batch_id,
        'Receipt Date': r.receipt_date ? String(r.receipt_date).slice(0, 10) : '',
        'Expiry Date': r.expiry_date ? String(r.expiry_date).slice(0, 10) : '',
        'Qty Remaining (kg)': parseFloat(r.qty_remaining) || 0,
        'Risk Score': r.risk_score || 0
      }));

    } else if (type === 'inward') {
      sheetName = 'Inward';
      const data = await db('inward_lines')
        .join('inward_entries', 'inward_entries.id', 'inward_lines.inward_id')
        .join('vendors', 'vendors.id', 'inward_entries.vendor_id')
        .join('items', 'items.id', 'inward_lines.item_id')
        .where('inward_entries.status', 'locked')
        .select(
          'inward_entries.invoice_date', 'inward_entries.invoice_no', 'inward_entries.locked_at',
          'vendors.name as vendor_name',
          'items.item_code', 'inward_lines.qty', 'inward_lines.rate', 'inward_lines.expiry_date'
        )
        .orderBy('inward_entries.locked_at', 'desc');
      rows = data.map(r => ({
        'Invoice Date': r.invoice_date ? String(r.invoice_date).slice(0, 10) : '',
        'Invoice No': r.invoice_no || '',
        'Vendor': r.vendor_name,
        'Item Code': r.item_code,
        'Qty (kg)': parseFloat(r.qty) || 0,
        'Rate': parseFloat(r.rate) || 0,
        'Value': (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0),
        'Expiry Date': r.expiry_date ? String(r.expiry_date).slice(0, 10) : ''
      }));

    } else if (type === 'outward') {
      sheetName = 'Outward';
      const data = await db('outward_lines')
        .join('outward_entries', 'outward_entries.id', 'outward_lines.outward_id')
        .join('customers', 'customers.id', 'outward_entries.customer_id')
        .join('items', 'items.id', 'outward_lines.item_id')
        .where('outward_entries.status', 'locked')
        .select(
          'outward_entries.dispatch_date', 'outward_entries.challan_no', 'outward_entries.locked_at',
          'customers.name as customer_name',
          'items.item_code',
          'outward_lines.batch_id', 'outward_lines.qty', 'outward_lines.rate'
        )
        .orderBy('outward_entries.locked_at', 'desc');
      rows = data.map(r => ({
        'Dispatch Date': r.dispatch_date ? String(r.dispatch_date).slice(0, 10) : '',
        'Challan No': r.challan_no || '',
        'Customer': r.customer_name,
        'Item Code': r.item_code,
        'Batch ID': r.batch_id || '',
        'Qty (kg)': parseFloat(r.qty) || 0,
        'Rate': parseFloat(r.rate) || 0,
        'Value': (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0)
      }));

    } else {
      return res.status(400).json({ success: false, error: 'Invalid export type. Use: items, stock, inward, outward' });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.set('Content-Disposition', `attachment; filename="${type}-${Date.now()}.xlsx"`);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/mis-dashboard — aggregated dashboard data
router.get('/mis-dashboard', authenticate, async (req, res, next) => {
  try {
    const [
      summaryRows,
      lowStockRows,
      expiryRows,
      recentInwardRows,
      recentOutwardRows,
      topItemsRows,
      categoryStockRows,
      monthlySummaryRows
    ] = await Promise.all([
      // Summary counts and totals
      db.raw(`
        SELECT
          (SELECT COUNT(*) FROM items) AS total_items,
          (SELECT COALESCE(SUM(b.qty_remaining * i.purchase_rate), 0)
           FROM batches b JOIN items i ON i.id = b.item_id
           WHERE b.qty_remaining > 0) AS total_stock_value,
          (SELECT COUNT(*) FROM vendors) AS active_vendors,
          (SELECT COUNT(*) FROM customers) AS active_customers,
          (SELECT COUNT(*) FROM inward_entries WHERE status NOT IN ('locked')) AS pending_inward,
          (SELECT COUNT(*) FROM outward_entries WHERE status NOT IN ('locked')) AS pending_outward
      `),

      // Low stock: top 10 items where live stock <= rop_kg
      db.raw(`
        SELECT
          i.item_code,
          COALESCE(i.variant_grade, sc.name) AS name,
          COALESCE(SUM(b.qty_remaining), 0) AS stock_kg,
          i.rop_kg
        FROM items i
        JOIN sub_categories sc ON sc.id = i.sub_category_id
        LEFT JOIN batches b ON b.item_id = i.id AND b.qty_remaining > 0
        WHERE i.rop_kg > 0
        GROUP BY i.id, i.item_code, i.variant_grade, sc.name, i.rop_kg
        HAVING COALESCE(SUM(b.qty_remaining), 0) <= i.rop_kg
        ORDER BY (i.rop_kg - COALESCE(SUM(b.qty_remaining), 0)) DESC
        LIMIT 10
      `),

      // Expiry alerts: batches expiring within 30 days
      db.raw(`
        SELECT
          i.item_code,
          COALESCE(i.variant_grade, sc.name) AS name,
          b.id AS batch_id,
          b.expiry_date,
          (b.expiry_date::date - CURRENT_DATE) AS days_to_expiry,
          b.qty_remaining,
          b.risk_score
        FROM batches b
        JOIN items i ON i.id = b.item_id
        JOIN sub_categories sc ON sc.id = i.sub_category_id
        WHERE b.qty_remaining > 0
          AND b.expiry_date IS NOT NULL
          AND b.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
        ORDER BY b.expiry_date ASC
        LIMIT 50
      `),

      // Recent inward: last 10 entries
      db.raw(`
        SELECT
          ie.id,
          v.name AS vendor_name,
          ie.invoice_no,
          ie.invoice_date,
          ie.status,
          ie.created_at
        FROM inward_entries ie
        JOIN vendors v ON v.id = ie.vendor_id
        ORDER BY ie.created_at DESC
        LIMIT 10
      `),

      // Recent outward: last 10 entries
      db.raw(`
        SELECT
          oe.id,
          c.name AS customer_name,
          oe.challan_no,
          oe.dispatch_date,
          oe.status,
          oe.created_at
        FROM outward_entries oe
        JOIN customers c ON c.id = oe.customer_id
        ORDER BY oe.created_at DESC
        LIMIT 10
      `),

      // Top 10 items by dispatch qty in last 30 days
      db.raw(`
        SELECT
          i.item_code,
          COALESCE(i.variant_grade, sc.name) AS name,
          SUM(ol.qty) AS total_dispatched,
          SUM(ol.qty * COALESCE(ol.rate, 0)) AS revenue
        FROM outward_lines ol
        JOIN outward_entries oe ON oe.id = ol.outward_id
        JOIN items i ON i.id = ol.item_id
        JOIN sub_categories sc ON sc.id = i.sub_category_id
        WHERE oe.status = 'locked'
          AND oe.dispatch_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY i.id, i.item_code, i.variant_grade, sc.name
        ORDER BY total_dispatched DESC
        LIMIT 10
      `),

      // Category stock breakdown
      db.raw(`
        SELECT
          c.name AS category,
          sc.name AS sub_category,
          COALESCE(SUM(b.qty_remaining), 0) AS total_stock,
          COALESCE(SUM(b.qty_remaining * i.purchase_rate), 0) AS total_value
        FROM categories c
        JOIN sub_categories sc ON sc.category_id = c.id
        JOIN items i ON i.sub_category_id = sc.id
        LEFT JOIN batches b ON b.item_id = i.id AND b.qty_remaining > 0
        GROUP BY c.id, c.name, sc.id, sc.name
        ORDER BY c.name, sc.name
      `),

      // Monthly summary: last 6 months
      db.raw(`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', CURRENT_DATE - INTERVAL '5 months'),
            date_trunc('month', CURRENT_DATE),
            INTERVAL '1 month'
          ) AS month
        ),
        inward_monthly AS (
          SELECT
            date_trunc('month', ie.invoice_date::date) AS month,
            SUM(il.qty) AS inward_qty,
            SUM(il.qty * il.rate) AS inward_value
          FROM inward_entries ie
          JOIN inward_lines il ON il.inward_id = ie.id
          WHERE ie.status = 'locked'
            AND ie.invoice_date >= CURRENT_DATE - INTERVAL '6 months'
          GROUP BY 1
        ),
        outward_monthly AS (
          SELECT
            date_trunc('month', oe.dispatch_date::date) AS month,
            SUM(ol.qty) AS outward_qty,
            SUM(ol.qty * COALESCE(ol.rate, 0)) AS outward_value
          FROM outward_entries oe
          JOIN outward_lines ol ON ol.outward_id = oe.id
          WHERE oe.status = 'locked'
            AND oe.dispatch_date >= CURRENT_DATE - INTERVAL '6 months'
          GROUP BY 1
        )
        SELECT
          to_char(m.month, 'YYYY-MM') AS month,
          COALESCE(im.inward_qty, 0) AS inward_qty,
          COALESCE(om.outward_qty, 0) AS outward_qty,
          COALESCE(im.inward_value, 0) AS inward_value,
          COALESCE(om.outward_value, 0) AS outward_value
        FROM months m
        LEFT JOIN inward_monthly im ON im.month = m.month
        LEFT JOIN outward_monthly om ON om.month = m.month
        ORDER BY m.month ASC
      `)
    ]);

    const sum = summaryRows.rows[0];

    res.json({
      success: true,
      data: {
        summary: {
          totalItems: parseInt(sum.total_items) || 0,
          totalStockValue: parseFloat(sum.total_stock_value) || 0,
          activeVendors: parseInt(sum.active_vendors) || 0,
          activeCustomers: parseInt(sum.active_customers) || 0,
          pendingInward: parseInt(sum.pending_inward) || 0,
          pendingOutward: parseInt(sum.pending_outward) || 0
        },
        lowStock: lowStockRows.rows.map(r => ({
          itemCode: r.item_code,
          name: r.name,
          stockKg: parseFloat(r.stock_kg) || 0,
          ropKg: parseFloat(r.rop_kg) || 0
        })),
        expiryAlerts: expiryRows.rows.map(r => ({
          itemCode: r.item_code,
          name: r.name,
          batchId: r.batch_id,
          expiryDate: r.expiry_date,
          daysToExpiry: parseInt(r.days_to_expiry) || 0,
          qtyRemaining: parseFloat(r.qty_remaining) || 0,
          riskScore: r.risk_score || 0
        })),
        recentInward: recentInwardRows.rows.map(r => ({
          id: r.id,
          vendorName: r.vendor_name,
          invoiceNo: r.invoice_no,
          invoiceDate: r.invoice_date,
          status: r.status,
          createdAt: r.created_at
        })),
        recentOutward: recentOutwardRows.rows.map(r => ({
          id: r.id,
          customerName: r.customer_name,
          challanNo: r.challan_no,
          dispatchDate: r.dispatch_date,
          status: r.status,
          createdAt: r.created_at
        })),
        topItems: topItemsRows.rows.map(r => ({
          itemCode: r.item_code,
          name: r.name,
          totalDispatched: parseFloat(r.total_dispatched) || 0,
          revenue: parseFloat(r.revenue) || 0
        })),
        categoryStock: categoryStockRows.rows.map(r => ({
          category: r.category,
          subCategory: r.sub_category,
          totalStock: parseFloat(r.total_stock) || 0,
          totalValue: parseFloat(r.total_value) || 0
        })),
        monthlySummary: monthlySummaryRows.rows.map(r => ({
          month: r.month,
          inwardQty: parseFloat(r.inward_qty) || 0,
          outwardQty: parseFloat(r.outward_qty) || 0,
          inwardValue: parseFloat(r.inward_value) || 0,
          outwardValue: parseFloat(r.outward_value) || 0
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/run-nightly — admin only manual trigger
router.post('/run-nightly', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await runNightly();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
