const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/intelligence/command-center
router.get('/command-center', async (req, res, next) => {
  try {
    const [kpis, velocityLeaders, activityFeed, categorySnapshot] = await Promise.all([
      fetchKPIs(),
      fetchVelocityLeaders(),
      fetchActivityFeed(),
      fetchCategorySnapshot(),
    ]);

    const insights = generateInsights(velocityLeaders, kpis);

    res.json({ success: true, kpis, velocityLeaders, activityFeed, categorySnapshot, insights });
  } catch (err) {
    next(err);
  }
});

async function fetchKPIs() {
  const [stockVal, itemCount, lowStock, expiryRisk, pendingPO, pendingOut, todayDispatched] = await Promise.all([
    db.raw(`SELECT COALESCE(SUM(b.qty_remaining * i.purchase_rate), 0) AS val
            FROM batches b JOIN items i ON i.id = b.item_id WHERE b.qty_remaining > 0`),
    db.raw(`SELECT COUNT(*) AS cnt FROM items`),
    db.raw(`SELECT COUNT(DISTINCT i.id) AS cnt
            FROM items i
            JOIN (SELECT item_id, SUM(qty_remaining) AS live FROM batches WHERE qty_remaining > 0 GROUP BY item_id) s ON s.item_id = i.id
            WHERE i.rop_kg > 0 AND s.live <= i.rop_kg`),
    db.raw(`SELECT COUNT(*) AS cnt FROM batches
            WHERE qty_remaining > 0 AND expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'`),
    db.raw(`SELECT COUNT(*) AS cnt FROM inward_entries WHERE status IN ('draft','confirmed')`),
    db.raw(`SELECT COUNT(*) AS cnt FROM outward_entries WHERE status IN ('draft','confirmed')`),
    db.raw(`SELECT COALESCE(SUM(ol.qty), 0) AS qty
            FROM outward_lines ol JOIN outward_entries oe ON oe.id = ol.outward_id
            WHERE oe.status = 'locked' AND oe.locked_at >= CURRENT_DATE`),
  ]);

  return {
    totalStockValue: parseFloat(stockVal.rows[0].val),
    totalItems: parseInt(itemCount.rows[0].cnt),
    lowStockCount: parseInt(lowStock.rows[0].cnt),
    expiryRiskCount: parseInt(expiryRisk.rows[0].cnt),
    pendingInward: parseInt(pendingPO.rows[0].cnt),
    pendingOutward: parseInt(pendingOut.rows[0].cnt),
    todayDispatchedKg: parseFloat(todayDispatched.rows[0].qty),
  };
}

async function fetchVelocityLeaders() {
  const result = await db.raw(`
    WITH vel AS (
      SELECT
        ol.item_id,
        COALESCE(SUM(ol.qty) FILTER (WHERE oe.locked_at >= NOW() - INTERVAL '30 days'), 0) / 30.0 AS vel_30d,
        COALESCE(SUM(ol.qty) FILTER (WHERE oe.locked_at >= NOW() - INTERVAL '7 days'), 0)  AS qty_7d,
        COALESCE(SUM(ol.qty) FILTER (WHERE oe.locked_at >= NOW() - INTERVAL '14 days'
                                       AND oe.locked_at <  NOW() - INTERVAL '7 days'), 0)   AS qty_prev_7d
      FROM outward_lines ol
      JOIN outward_entries oe ON oe.id = ol.outward_id
      WHERE oe.status = 'locked'
      GROUP BY ol.item_id
    ),
    stk AS (
      SELECT item_id, COALESCE(SUM(qty_remaining), 0) AS live_stock
      FROM batches WHERE qty_remaining > 0
      GROUP BY item_id
    )
    SELECT
      i.id,
      i.item_code,
      COALESCE(NULLIF(i.variant_grade,''), sc.name) AS name,
      c.name  AS category,
      COALESCE(v.vel_30d, 0)    AS velocity_per_day,
      COALESCE(s.live_stock, 0) AS stock_kg,
      i.rop_kg,
      i.lead_time_days,
      i.purchase_rate,
      CASE
        WHEN COALESCE(v.vel_30d, 0) > 0
        THEN ROUND((COALESCE(s.live_stock,0) / v.vel_30d)::NUMERIC, 1)
        ELSE NULL
      END AS days_remaining,
      CASE
        WHEN COALESCE(v.qty_7d, 0) > COALESCE(v.qty_prev_7d, 0) * 1.15 THEN 'rising'
        WHEN COALESCE(v.qty_7d, 0) < COALESCE(v.qty_prev_7d, 0) * 0.85 THEN 'declining'
        ELSE 'stable'
      END AS demand_trend,
      COALESCE(v.qty_7d, 0)      AS qty_7d,
      COALESCE(v.qty_prev_7d, 0) AS qty_prev_7d
    FROM items i
    JOIN sub_categories sc ON sc.id = i.sub_category_id
    JOIN categories c ON c.id = sc.category_id
    LEFT JOIN vel v ON v.item_id = i.id
    LEFT JOIN stk s ON s.item_id = i.id
    WHERE COALESCE(s.live_stock, 0) > 0 OR COALESCE(v.vel_30d, 0) > 0
    ORDER BY velocity_per_day DESC
    LIMIT 15
  `);

  return result.rows.map(r => ({
    ...r,
    velocity_per_day: parseFloat(r.velocity_per_day),
    stock_kg: parseFloat(r.stock_kg),
    rop_kg: parseFloat(r.rop_kg || 0),
    days_remaining: r.days_remaining ? parseFloat(r.days_remaining) : null,
    purchase_rate: parseFloat(r.purchase_rate || 0),
    stockout_risk: calcStockoutRisk(r),
  }));
}

function calcStockoutRisk(r) {
  const days = r.days_remaining ? parseFloat(r.days_remaining) : null;
  const lead = parseInt(r.lead_time_days || 7);
  if (days === null) return 'unknown';
  if (days < lead) return 'critical';
  if (days < lead * 1.5) return 'high';
  if (days < lead * 2.5) return 'medium';
  return 'low';
}

async function fetchActivityFeed() {
  const result = await db.raw(`
    SELECT 'inward' AS type, ie.id, ie.invoice_no AS ref, v.name AS party,
           ie.created_at, u.name AS user_name,
           (SELECT SUM(il.qty) FROM inward_lines il WHERE il.inward_id = ie.id) AS qty
    FROM inward_entries ie
    JOIN vendors v ON v.id = ie.vendor_id
    LEFT JOIN users u ON u.id = ie.created_by
    WHERE ie.created_at >= NOW() - INTERVAL '7 days'
    UNION ALL
    SELECT 'outward' AS type, oe.id, oe.challan_no AS ref, c.name AS party,
           oe.created_at, u.name AS user_name,
           (SELECT SUM(ol.qty) FROM outward_lines ol WHERE ol.outward_id = oe.id) AS qty
    FROM outward_entries oe
    LEFT JOIN customers c ON c.id = oe.customer_id
    LEFT JOIN users u ON u.id = oe.created_by
    WHERE oe.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  return result.rows;
}

async function fetchCategorySnapshot() {
  const result = await db.raw(`
    SELECT
      c.name AS category,
      COUNT(DISTINCT i.id) AS item_count,
      COALESCE(SUM(b.qty_remaining), 0) AS stock_kg,
      COALESCE(SUM(b.qty_remaining * i.purchase_rate), 0) AS stock_value
    FROM categories c
    JOIN sub_categories sc ON sc.category_id = c.id
    JOIN items i ON i.sub_category_id = sc.id
    LEFT JOIN batches b ON b.item_id = i.id AND b.qty_remaining > 0
    GROUP BY c.id, c.name
    ORDER BY stock_value DESC
  `);
  return result.rows.map(r => ({
    category: r.category,
    item_count: parseInt(r.item_count),
    stock_kg: parseFloat(r.stock_kg),
    stock_value: parseFloat(r.stock_value),
  }));
}

function generateInsights(leaders, kpis) {
  const insights = [];

  // Critical stockout items
  const critical = leaders.filter(l => l.stockout_risk === 'critical');
  if (critical.length > 0) {
    insights.push({
      id: 'stockout-critical',
      severity: 'critical',
      title: `${critical.length} item${critical.length > 1 ? 's' : ''} heading to stockout`,
      body: `${critical.map(l => l.name).slice(0, 3).join(', ')} ${critical.length > 3 ? `+${critical.length - 3} more` : ''} will run out before next replenishment.`,
      action: 'Raise Purchase Order',
      actionPath: '/purchase-orders',
    });
  }

  // Rising demand
  const rising = leaders.filter(l => l.demand_trend === 'rising' && l.velocity_per_day >= 1);
  if (rising.length > 0) {
    insights.push({
      id: 'demand-rising',
      severity: 'info',
      title: `Demand up for ${rising.length} SKU${rising.length > 1 ? 's' : ''}`,
      body: `${rising.map(l => l.name).slice(0, 3).join(', ')} showed >15% sales growth last 7 days.`,
      action: 'Review Stock',
      actionPath: '/items',
    });
  }

  // Expiry risk
  if (kpis.expiryRiskCount > 0) {
    insights.push({
      id: 'expiry-risk',
      severity: kpis.expiryRiskCount > 5 ? 'critical' : 'warning',
      title: `${kpis.expiryRiskCount} batch${kpis.expiryRiskCount > 1 ? 'es' : ''} expiring within 30 days`,
      body: 'Prioritise outward dispatch for at-risk batches to reduce shrinkage.',
      action: 'View Expiry Alerts',
      actionPath: '/expiry-alerts',
    });
  }

  // Low stock
  if (kpis.lowStockCount > 0) {
    insights.push({
      id: 'low-stock',
      severity: 'warning',
      title: `${kpis.lowStockCount} item${kpis.lowStockCount > 1 ? 's' : ''} below reorder point`,
      body: 'Dynamic reorder point breached. Raise POs before stockout window.',
      action: 'View Low Stock',
      actionPath: '/items?filter=low-stock',
    });
  }

  // Fast movers — congratulatory
  const fastMovers = leaders.filter(l => l.velocity_per_day >= 5);
  if (fastMovers.length > 0) {
    insights.push({
      id: 'fast-movers',
      severity: 'success',
      title: `${fastMovers.length} fast-moving SKU${fastMovers.length > 1 ? 's' : ''}`,
      body: `${fastMovers.map(l => l.name).slice(0, 2).join(', ')} selling ≥5 kg/day. Ensure buffer stock.`,
      action: null,
      actionPath: null,
    });
  }

  return insights;
}

module.exports = router;
