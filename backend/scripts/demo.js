require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../src/config/db');
const { generateEAN13 } = require('../src/services/barcode');
const { runNightly } = require('../src/jobs/nightly');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function daysFromReceipt(receiptDateStr, n) {
  const d = new Date(receiptDateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

async function nextItemCode() {
  const row = await db('items').select('item_code').orderBy('id', 'desc').first();
  if (!row) return 'FG-0001';
  const num = parseInt(row.item_code.replace('FG-', ''), 10);
  return 'FG-' + String(num + 1).padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Demo data definitions
// ---------------------------------------------------------------------------

const VENDORS = [
  { name: 'Ramesh Agro Traders', gstin: '27AABCU9603R1ZX', contact: '9876543210', payment_terms: 'Net 30' },
  { name: 'Punjab Grain Suppliers', gstin: '03BBBFF5678G2ZY', contact: '9812345678', payment_terms: 'Net 15' },
  { name: 'Maharashtra Exports Pvt Ltd', gstin: '27CCCDE1234H3ZZ', contact: '9898765432', payment_terms: 'Immediate' }
];

const CUSTOMERS = [
  { name: 'Star Supermart', contact: '9123456789', address: 'Plot 12, MG Road, Pune 411001' },
  { name: 'Daily Fresh Stores', contact: '9234567890', address: 'Shop 5, Laxmi Nagar, Mumbai 400064' },
  { name: 'Bharat Kirana Wholesale', contact: '9345678901', address: 'Godown 7, APMC Market, Navi Mumbai' }
];

// Each entry: [sub_category_name, variant_grade, unit, purchase_rate, mrp, avg_daily_consumption, lead_time_days]
const ITEMS_SPEC = [
  ['Rice',            'Basmati Premium',         'kg',  85.00,  110.00, 50,  7],
  ['Rice',            'Non-Basmati Sona Masuri',  'kg',  42.00,   58.00, 80,  5],
  ['Pulses',          'Chana Dal',               'kg',  68.00,   90.00, 30,  7],
  ['Pulses',          'Toor Dal',                'kg',  95.00,  125.00, 25, 10],
  ['Pulses',          'Moong Dal',               'kg', 105.00,  138.00, 20,  7],
  ['Wheat & Flour',   'Sharbati Wheat',          'kg',  28.00,   38.00, 100,  5],
  ['Wheat & Flour',   'Maida',                   'kg',  32.00,   42.00, 40,  5],
  ['Wheat & Flour',   'Besan',                   'kg',  72.00,   95.00, 25,  7],
  ['Dry Fruits',      'Cashew W320',             'kg', 650.00,  850.00,  5, 14],
  ['Almonds',         'Mamro Almonds',           'kg', 780.00, 1050.00,  3, 14],
  ['Spices & Seeds',  'Turmeric Powder',         'kg', 145.00,  190.00,  8,  7],
  ['Sugar & Jaggery', 'White Sugar M30',         'kg',  38.00,   48.00, 120,  5]
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  try {
    console.log('Inserting demo data...');

    // ---- Admin user id ----
    const adminUser = await db('users').where({ role: 'admin' }).first();
    if (!adminUser) throw new Error('Admin user not found — run seed.js first');
    const adminId = adminUser.id;

    // ---- Vendors ----
    const vendorIds = [];
    for (const v of VENDORS) {
      const existing = await db('vendors').where({ name: v.name }).first();
      if (existing) {
        vendorIds.push(existing.id);
        console.log('  Vendor exists: %s', v.name);
      } else {
        const [row] = await db('vendors').insert(v).returning('id');
        vendorIds.push(row.id);
        console.log('  Vendor inserted: %s (id=%d)', v.name, row.id);
      }
    }

    // ---- Customers ----
    const customerIds = [];
    for (const c of CUSTOMERS) {
      const existing = await db('customers').where({ name: c.name }).first();
      if (existing) {
        customerIds.push(existing.id);
        console.log('  Customer exists: %s', c.name);
      } else {
        const [row] = await db('customers').insert(c).returning('id');
        customerIds.push(row.id);
        console.log('  Customer inserted: %s (id=%d)', c.name, row.id);
      }
    }

    // ---- Sub-category map ----
    const subCatRows = await db('sub_categories').select('id', 'name');
    const subCatMap = {};
    for (const s of subCatRows) subCatMap[s.name] = s.id;

    // ---- Items ----
    const itemIds = {}; // keyed by variant_grade
    for (const [subName, variant, unit, purchaseRate, mrp, avgDaily, leadDays] of ITEMS_SPEC) {
      const subCatId = subCatMap[subName];
      if (!subCatId) throw new Error(`Sub-category not found: ${subName} — run seed.js first`);

      const existing = await db('items').where({ variant_grade: variant }).first();
      if (existing) {
        itemIds[variant] = existing.id;
        console.log('  Item exists: %s (id=%d)', variant, existing.id);
        continue;
      }

      const item_code = await nextItemCode();

      const [newItem] = await db('items')
        .insert({
          sub_category_id: subCatId,
          item_code,
          barcode: 'TEMP_' + item_code,
          unit,
          variant_grade: variant,
          purchase_rate: purchaseRate,
          mrp,
          avg_daily_consumption: avgDaily,
          lead_time_days: leadDays,
          demand_variability_pct: 20
        })
        .returning('*');

      const barcode = generateEAN13(newItem.id);
      await db('items').where({ id: newItem.id }).update({ barcode });
      itemIds[variant] = newItem.id;
      console.log('  Item inserted: %s → %s / barcode %s (id=%d)', item_code, variant, barcode, newItem.id);
    }

    // ---- Purchase Orders ----
    const poIds = [];
    const poSpecs = [
      { vendorIdx: 0, po_date: daysAgo(30), delivery_date: daysAgo(25) },
      { vendorIdx: 1, po_date: daysAgo(20), delivery_date: daysAgo(15) },
      { vendorIdx: 0, po_date: daysAgo(10), delivery_date: daysAgo(7) }
    ];

    for (const spec of poSpecs) {
      const existing = await db('purchase_orders')
        .where({ vendor_id: vendorIds[spec.vendorIdx], po_date: spec.po_date })
        .first();
      if (existing) {
        poIds.push(existing.id);
        console.log('  PO exists: id=%d', existing.id);
      } else {
        const [row] = await db('purchase_orders')
          .insert({
            vendor_id: vendorIds[spec.vendorIdx],
            po_date: spec.po_date,
            delivery_date: spec.delivery_date,
            status: 'received',
            created_by: adminId
          })
          .returning('id');
        poIds.push(row.id);
        console.log('  PO inserted: id=%d (vendor_id=%d, po_date=%s)', row.id, vendorIds[spec.vendorIdx], spec.po_date);
      }
    }

    // ---- Inward Entries, Lines & Batches ----
    // Helper to insert one inward entry with lines + batches, idempotent by invoice_no
    async function insertInward({ poId, vendorId, invoiceNo, lockedDaysAgo, lines }) {
      const receiptDate = daysAgo(lockedDaysAgo);
      const lockedAt = new Date();
      lockedAt.setDate(lockedAt.getDate() - lockedDaysAgo);

      const existing = await db('inward_entries').where({ invoice_no: invoiceNo }).first();
      if (existing) {
        console.log('  Inward exists: %s', invoiceNo);
        // Return batch ids in insertion order for re-use
        const lines_ = await db('inward_lines')
          .where({ inward_id: existing.id })
          .orderBy('id', 'asc')
          .select('batch_id');
        return lines_.map(l => l.batch_id);
      }

      const [inward] = await db('inward_entries')
        .insert({
          po_id: poId,
          vendor_id: vendorId,
          invoice_no: invoiceNo,
          invoice_date: receiptDate,
          status: 'locked',
          locked_at: lockedAt.toISOString(),
          created_by: adminId
        })
        .returning('id');

      const batchIds = [];
      for (const line of lines) {
        const expiryDate = line.expiryFixed
          ? line.expiryFixed
          : daysFromReceipt(receiptDate, line.expiryDays);

        const [batch] = await db('batches')
          .insert({
            item_id: itemIds[line.variant],
            receipt_date: receiptDate,
            expiry_date: expiryDate,
            qty_received: line.qty,
            qty_remaining: line.qty,
            risk_score: 0
          })
          .returning('id');

        await db('inward_lines').insert({
          inward_id: inward.id,
          item_id: itemIds[line.variant],
          batch_id: batch.id,
          qty: line.qty,
          rate: line.rate,
          expiry_date: expiryDate
        });

        batchIds.push(batch.id);
        console.log('    Batch inserted: id=%d item=%s qty=%d exp=%s', batch.id, line.variant, line.qty, expiryDate);
      }

      console.log('  Inward locked: %s (id=%d, %d lines)', invoiceNo, inward.id, lines.length);
      return batchIds;
    }

    // Inward 1 — receipt_date = 25 days ago
    const inward1Batches = await insertInward({
      poId: poIds[0],
      vendorId: vendorIds[0],
      invoiceNo: 'INV-2026-001',
      lockedDaysAgo: 25,
      lines: [
        { variant: 'Basmati Premium',        qty: 500, rate:  83.00, expiryDays: 365 },
        { variant: 'Non-Basmati Sona Masuri', qty: 800, rate:  40.00, expiryDays: 365 },
        { variant: 'Chana Dal',              qty: 300, rate:  66.00, expiryDays: 540 },
        { variant: 'Toor Dal',               qty: 250, rate:  93.00, expiryDays: 540 }
      ]
    });

    // Inward 2 — receipt_date = 15 days ago
    const inward2Batches = await insertInward({
      poId: poIds[1],
      vendorId: vendorIds[1],
      invoiceNo: 'INV-2026-045',
      lockedDaysAgo: 15,
      lines: [
        { variant: 'Sharbati Wheat',  qty: 1000, rate: 26.50, expiryDays: 180 },
        { variant: 'Maida',           qty:  400, rate: 30.00, expiryFixed: daysFromToday(25) }, // near-expiry for demo
        { variant: 'Besan',           qty:  250, rate: 70.00, expiryDays: 180 },
        { variant: 'White Sugar M30', qty: 1500, rate: 36.00, expiryDays: 730 }
      ]
    });

    // Inward 3 — receipt_date = 7 days ago
    const inward3Batches = await insertInward({
      poId: poIds[2],
      vendorId: vendorIds[0],
      invoiceNo: 'INV-2026-078',
      lockedDaysAgo: 7,
      lines: [
        { variant: 'Cashew W320',    qty:  50, rate: 640.00, expiryDays: 270 },
        { variant: 'Mamro Almonds',  qty:  30, rate: 770.00, expiryDays: 270 },
        { variant: 'Turmeric Powder', qty:  80, rate: 142.00, expiryDays: 365 },
        { variant: 'Moong Dal',      qty: 200, rate: 102.00, expiryDays: 540 }
      ]
    });

    // ---- Outward Entries ----
    async function insertOutward({ customerId, challanNo, dispatchDaysAgo, lines }) {
      const dispatchDate = daysAgo(dispatchDaysAgo);
      const lockedAt = new Date();
      lockedAt.setDate(lockedAt.getDate() - dispatchDaysAgo);

      const existing = await db('outward_entries').where({ challan_no: challanNo }).first();
      if (existing) {
        console.log('  Outward exists: %s', challanNo);
        return;
      }

      const [outward] = await db('outward_entries')
        .insert({
          customer_id: customerId,
          challan_no: challanNo,
          dispatch_date: dispatchDate,
          status: 'locked',
          locked_at: lockedAt.toISOString(),
          created_by: adminId
        })
        .returning('id');

      for (const line of lines) {
        await db('outward_lines').insert({
          outward_id: outward.id,
          item_id: itemIds[line.variant],
          batch_id: line.batchId,
          qty: line.qty,
          rate: line.rate
        });

        await db('batches')
          .where({ id: line.batchId })
          .decrement('qty_remaining', line.qty);

        console.log('    Outward line: %s qty=%d from batch_id=%d', line.variant, line.qty, line.batchId);
      }

      console.log('  Outward locked: %s (id=%d, %d lines)', challanNo, outward.id, lines.length);
    }

    // Outward 1 — customer: Star Supermart, 20 days ago
    await insertOutward({
      customerId: customerIds[0],
      challanNo: 'CH-20260501-0001',
      dispatchDaysAgo: 20,
      lines: [
        { variant: 'Basmati Premium',  batchId: inward1Batches[0], qty: 100, rate: 108.00 },
        { variant: 'Chana Dal',        batchId: inward1Batches[2], qty:  50, rate:  88.00 },
        { variant: 'White Sugar M30',  batchId: inward2Batches[3], qty: 200, rate:  46.00 }
      ]
    });

    // Outward 2 — customer: Daily Fresh Stores, 10 days ago
    await insertOutward({
      customerId: customerIds[1],
      challanNo: 'CH-20260511-0001',
      dispatchDaysAgo: 10,
      lines: [
        { variant: 'Non-Basmati Sona Masuri', batchId: inward1Batches[1], qty: 150, rate:  56.00 },
        { variant: 'Toor Dal',                batchId: inward1Batches[3], qty:  80, rate: 122.00 },
        { variant: 'Sharbati Wheat',          batchId: inward2Batches[0], qty: 200, rate:  36.00 }
      ]
    });

    // ---- Nightly job ----
    console.log('\nRunning nightly job to compute risk scores and ROP...');
    await runNightly();
    console.log('Nightly job ran — risk scores and ROP updated.');

    // ---- Summary ----
    console.log('\nDemo data inserted successfully!');
    console.log('  Vendors: 3');
    console.log('  Customers: 3');
    console.log('  Items: 12');
    console.log('  Inward entries: 3 (all locked)');
    console.log('  Outward entries: 2 (all locked with challans)');
    console.log('  Batches: 12 (with varying expiry dates)');
    console.log('  Nightly job ran: risk scores + ROP updated');

    process.exit(0);
  } catch (err) {
    console.error('Demo seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
