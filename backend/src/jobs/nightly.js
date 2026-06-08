const cron = require('node-cron');
const db = require('../config/db');

function riskScore(qty, daysToExpiry, avgDailyVelocity, shelfLifeDays) {
  if (daysToExpiry <= 0) return 100;
  const canSell = avgDailyVelocity * daysToExpiry;
  const excessQty = Math.max(0, qty - canSell);
  const timeRisk = Math.max(0, 1 - daysToExpiry / shelfLifeDays);
  const volumeRisk = excessQty > 0 ? Math.min(1, excessQty / qty) : 0;
  return Math.round((timeRisk * 0.5 + volumeRisk * 0.5) * 100);
}

function calcROP(avgDaily, leadDays, variabilityPct) {
  const safetyStock = avgDaily * leadDays * (variabilityPct / 100) * 1.65;
  return Math.ceil(avgDaily * leadDays + safetyStock);
}

// Date-only cutoff (YYYY-MM-DD) for expiring batches. A batch is sellable
// THROUGH its expiry date — the FIFO picker (outward.js) keeps batches where
// expiry_date >= today. So a batch may only be marked expired once its
// expiry_date is strictly before today's DATE. Mirrors the FIFO date handling
// (new Date().toISOString().split('T')[0]) so the "still sellable" boundary and
// the "expired" boundary line up exactly with no overlap and no gap.
function expiryCutoff(now = new Date()) {
  return now.toISOString().split('T')[0];
}

// Pure mirror of the SQL predicate used by Job 1 (`expiry_date < cutoff`),
// exported for regression testing of the same-day-expiry boundary.
function isBatchExpired(expiryDate, now = new Date()) {
  if (!expiryDate) return false;
  const exp = new Date(expiryDate).toISOString().split('T')[0];
  return exp < expiryCutoff(now);
}

async function runNightly() {
  const result = { started_at: new Date(), jobs: {} };
  const today = new Date();

  // Job 0: Recalculate avg_daily_consumption from rolling 30-day dispatch window
  const dispatchData = await db('outward_lines')
    .join('outward_entries', 'outward_entries.id', 'outward_lines.outward_id')
    .where('outward_entries.status', 'locked')
    .where('outward_entries.dispatch_date', '>=', db.raw("CURRENT_DATE - INTERVAL '30 days'"))
    .groupBy('outward_lines.item_id')
    .select('outward_lines.item_id', db.raw('SUM(outward_lines.qty) as total_qty'));

  await Promise.all(dispatchData.map(row => {
    const avgDaily = Math.round((parseFloat(row.total_qty) / 30) * 100) / 100;
    return db('items').where({ id: row.item_id }).update({ avg_daily_consumption: avgDaily });
  }));
  result.jobs.avgDailyConsumptionUpdated = dispatchData.length;

  // Job 1: Mark expired batches — only batches whose expiry_date is strictly
  // before today's DATE. Comparing against the full `today` timestamp (the cron
  // fires at 02:00) would zero out batches expiring TODAY, which the FIFO picker
  // still treats as sellable (expiry_date >= today).
  const expired = await db('batches')
    .where('expiry_date', '<', expiryCutoff(today))
    .where('qty_remaining', '>', 0)
    .update({
      expired_qty: db.raw('qty_remaining'),
      expired_at: db.fn.now(),
      qty_remaining: 0
    });
  result.jobs.batchesExpired = expired;

  // Job 2: Update risk scores on active batches
  const activeBatches = await db('batches')
    .join('items', 'items.id', 'batches.item_id')
    .join('sub_categories', 'sub_categories.id', 'items.sub_category_id')
    .where('batches.qty_remaining', '>', 0)
    .select(
      'batches.id',
      'batches.qty_remaining',
      'batches.expiry_date',
      'items.avg_daily_consumption',
      'sub_categories.shelf_life_days'
    );

  await Promise.all(activeBatches.map(b => {
    const daysToExpiry = b.expiry_date
      ? Math.floor((new Date(b.expiry_date) - today) / 86400000)
      : 9999;
    const score = riskScore(
      parseFloat(b.qty_remaining),
      daysToExpiry,
      parseFloat(b.avg_daily_consumption) || 0,
      b.shelf_life_days || 365
    );
    return db('batches').where({ id: b.id }).update({ risk_score: score });
  }));
  result.jobs.batchesScored = activeBatches.length;

  // Job 3: Recalculate ROP for all items
  const items = await db('items').select(
    'id', 'avg_daily_consumption', 'lead_time_days', 'demand_variability_pct'
  );
  await Promise.all(items.map(item => {
    const rop = calcROP(
      parseFloat(item.avg_daily_consumption) || 0,
      item.lead_time_days || 7,
      item.demand_variability_pct || 20
    );
    return db('items').where({ id: item.id }).update({ rop_kg: rop });
  }));
  result.jobs.itemsRopUpdated = items.length;

  result.finished_at = new Date();

  await db('cron_log').insert({ job: 'nightly-intelligence', result: JSON.stringify(result) });
  console.log('[cron] nightly complete', result);
  return result;
}

function startCronJobs() {
  cron.schedule('0 2 * * *', () => {
    runNightly().catch(err => console.error('[cron] nightly failed:', err));
  });
  console.log('[cron] nightly job scheduled at 02:00');
}

module.exports = { startCronJobs, runNightly, expiryCutoff, isBatchExpired };
