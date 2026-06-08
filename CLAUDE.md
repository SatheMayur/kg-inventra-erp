# Food & Grains — Inventory Management System
**SRS v1.0 | May 2026 | Coordinator: Prachi | Confidential — Internal Use Only**

---

## Project goal
Build a web-based inventory management system for a food & grains business.
Handles: barcode scan inward/outward, FIFO batch tracking, expiry alerts, role-based access, Excel import/export, audit trail, and an intelligence layer for risk scoring and margin tracking.

---

## Recommended stack
- **Backend:** Node.js + Express (or Python/FastAPI)
- **Database:** PostgreSQL
- **Frontend:** React + Vite (web-only, Chrome/Edge/desktop)
- **Auth:** JWT + role middleware
- **Excel:** SheetJS (import/export)
- **Cron:** node-cron (or pg_cron inside Postgres)

---

## User roles
| Role | Permissions |
|------|-------------|
| Admin | Full access + user management |
| Purchase | Inward entry, PO, vendor |
| Warehouse | Inward receive, barcode scan, stock view |
| Sales | Outward dispatch, challan |
| View-only | Read-only reports |

---

## Database schema

```sql
-- Categories
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE sub_categories (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id),
  name VARCHAR(100) NOT NULL,
  shelf_life_days INT DEFAULT 365
);

-- Items
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  sub_category_id INT REFERENCES sub_categories(id),
  item_code VARCHAR(20) UNIQUE NOT NULL,     -- auto-generated: FG-0001
  barcode VARCHAR(50) UNIQUE NOT NULL,        -- auto-generated EAN-13
  hsn_code VARCHAR(20),
  unit VARCHAR(20) DEFAULT 'kg',
  variant_grade VARCHAR(50),
  purchase_rate NUMERIC(10,2),
  mrp NUMERIC(10,2),
  min_stock_level NUMERIC(10,2) DEFAULT 0,   -- legacy static field, kept for reference
  avg_daily_consumption NUMERIC(10,2) DEFAULT 0,
  lead_time_days INT DEFAULT 7,
  demand_variability_pct INT DEFAULT 20,
  rop_kg NUMERIC(10,2) DEFAULT 0,            -- dynamic reorder point, updated nightly
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Batches (FIFO unit)
CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  item_id INT REFERENCES items(id),
  receipt_date DATE NOT NULL,                 -- FIFO sort key — index this
  expiry_date DATE,
  qty_received NUMERIC(10,2) NOT NULL,
  qty_remaining NUMERIC(10,2) NOT NULL,
  risk_score INT DEFAULT 0,                  -- 0-100, updated nightly
  expired_at TIMESTAMPTZ,
  expired_qty NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_batches_item_receipt ON batches(item_id, receipt_date ASC);
CREATE INDEX idx_batches_expiry ON batches(expiry_date);

-- Vendors & Customers
CREATE TABLE vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  gstin VARCHAR(20),
  contact VARCHAR(100),
  payment_terms VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact VARCHAR(100),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inward (Purchase)
CREATE TABLE purchase_orders (
  id SERIAL PRIMARY KEY,
  vendor_id INT REFERENCES vendors(id),
  po_date DATE NOT NULL,
  delivery_date DATE,
  status VARCHAR(20) DEFAULT 'open',         -- open | received | closed
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inward_entries (
  id SERIAL PRIMARY KEY,
  po_id INT REFERENCES purchase_orders(id),
  vendor_id INT REFERENCES vendors(id),
  invoice_no VARCHAR(100),
  invoice_date DATE,
  invoice_scan_url TEXT,
  status VARCHAR(20) DEFAULT 'draft',        -- draft | confirmed | locked
  locked_at TIMESTAMPTZ,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inward_lines (
  id SERIAL PRIMARY KEY,
  inward_id INT REFERENCES inward_entries(id),
  item_id INT REFERENCES items(id),
  batch_id INT REFERENCES batches(id),       -- created on confirm
  qty NUMERIC(10,2) NOT NULL,
  rate NUMERIC(10,2) NOT NULL,
  expiry_date DATE
);

-- Outward (Sales Dispatch)
CREATE TABLE outward_entries (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  challan_no VARCHAR(50) UNIQUE,             -- auto-generated on lock
  dispatch_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',        -- draft | confirmed | locked
  locked_at TIMESTAMPTZ,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE outward_lines (
  id SERIAL PRIMARY KEY,
  outward_id INT REFERENCES outward_entries(id),
  item_id INT REFERENCES items(id),
  batch_id INT REFERENCES batches(id),       -- FIFO-selected batch
  qty NUMERIC(10,2) NOT NULL,
  rate NUMERIC(10,2)
);

-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL,                 -- admin|purchase|warehouse|sales|view
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name VARCHAR(100),
  record_id INT,
  action VARCHAR(20),                        -- INSERT | UPDATE | DELETE | LOCK
  user_id INT REFERENCES users(id),
  changed_fields JSONB,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cron job log
CREATE TABLE cron_log (
  id SERIAL PRIMARY KEY,
  job VARCHAR(100),
  ran_at TIMESTAMPTZ DEFAULT NOW(),
  result JSONB
);
```

---

## Core business logic

### FIFO dispatch (run on every outward confirmation)
```js
async function fifoPick(itemId, qtyRequired, trx) {
  const batches = await trx('batches')
    .where({ item_id: itemId })
    .where('qty_remaining', '>', 0)
    .where('expiry_date', '>', new Date())
    .orderBy('receipt_date', 'asc');

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

  return picks; // each pick → one outward_lines row + UPDATE batches SET qty_remaining = qty_remaining - take
}
```

### Business rules (enforce in service layer, not just UI)
1. FIFO batch selection is mandatory on every outward — no manual batch override except Admin
2. Inward confirm → create batch row + increment qty_remaining
3. Outward lock → deduct qty_remaining per FIFO picks, generate challan_no, set locked_at
4. Once locked, NO edits. Any correction requires a reversal entry (new row, not UPDATE)
5. Every write action → insert row in audit_log with old + new JSONB
6. Barcode scanner = HID keyboard emulation → focused `<input>` that captures string on Enter keypress
7. Excel import: validate columns before insert, reject row on error, report failures

---

## Intelligence layer (nightly cron at 2am)

### 1. Risk scoring — per batch
```js
function riskScore(qty, daysToExpiry, avgDailyVelocity, shelfLifeDays) {
  if (daysToExpiry <= 0) return 100;
  const canSell = avgDailyVelocity * daysToExpiry;
  const excessQty = Math.max(0, qty - canSell);
  const timeRisk = Math.max(0, 1 - daysToExpiry / shelfLifeDays);
  const volumeRisk = excessQty > 0 ? Math.min(1, excessQty / qty) : 0;
  return Math.round((timeRisk * 0.5 + volumeRisk * 0.5) * 100);
}
// Store result in batches.risk_score — surface in Expiry Alert report with RAG colour
```

### 2. Dynamic reorder point — per item (z=1.65 → 95% service level)
```js
function calcROP(avgDaily, leadDays, variabilityPct) {
  const safetyStock = avgDaily * leadDays * (variabilityPct / 100) * 1.65;
  return Math.ceil(avgDaily * leadDays + safetyStock);
}
// Store in items.rop_kg — Low Stock Alert fires when SUM(batch.qty_remaining) <= rop_kg
```

### 3. Mark expired batches
```js
// For each batch where expiry_date < today AND qty_remaining > 0:
// SET expired_qty = qty_remaining, expired_at = NOW(), qty_remaining = 0
// This value feeds shrinkage cost in margin tracker
```

### 4. Dead stock detection (report query)
```sql
SELECT i.item_code, i.name, SUM(b.qty_remaining) AS stock_kg,
       MAX(ol.created_at) AS last_dispatch
FROM items i
JOIN batches b ON b.item_id = i.id AND b.qty_remaining > 0
LEFT JOIN outward_lines ol ON ol.item_id = i.id
  AND ol.created_at >= NOW() - INTERVAL '$N days'
WHERE ol.id IS NULL
GROUP BY i.id
ORDER BY stock_kg DESC;
-- Expose as GET /api/reports/dead-stock?days=30
```

### 5. Margin & shrinkage per item
```js
function itemPnL(item) {
  const grossMargin = (item.avgDispatchRate - item.purchaseRate) * item.qtyDispatched;
  const shrinkage = item.expiredQty * item.purchaseRate;
  const netMargin = grossMargin - shrinkage;
  const marginPct = Math.round((netMargin / (item.purchaseRate * item.qtyDispatched)) * 100);
  return { grossMargin, shrinkage, netMargin, marginPct };
}
// Surface in Monthly MIS Dashboard — per item breakdown
```

---

## Item category structure
| Main | Sub-category | Shelf life |
|------|-------------|-----------|
| Food & Grains | Rice (Basmati, Non-Basmati, Brown) | 365d |
| | Pulses (Chana, Moong, Toor, Masoor, Urad) | 540d |
| | Wheat & Flour (Wheat, Atta, Maida, Suji, Besan) | 180d |
| | Dry Fruits (Cashew, Raisins, Walnuts, Pista) | 270d |
| | Almonds (Mamro, Tucda, Running) | 270d |
| | Spices & Seeds (Whole, Ground, Seeds) | 365d |
| | Sugar & Jaggery (White Sugar, Jaggery, Khandsari) | 730d |

---

## Development phases
| Phase | Weeks | Build |
|-------|-------|-------|
| 1 | 1–4 | Item Master CRUD, barcode generate/scan, label print, user auth + roles |
| 2 | 5–8 | Inward flow (PO→Receive→Scan/Import→Confirm→Lock), Outward flow (Dispatch→FIFO→Challan→Lock) |
| 3 | 9–12 | Expiry alerts, vendor history, all reports + MIS dashboard, Excel export, intelligence cron jobs |
| 4 | 13–16 | UAT with Prachi, training, production deploy |

---

## Open questions (resolve with Prachi before Phase 2)
- [ ] Excel import column schema — which columns, which are mandatory?
- [ ] Does PO need approval before goods receipt, or single-person flow?
- [ ] Customer master fields needed
- [ ] Vendor master fields (GSTIN, payment terms?)
- [ ] Challan layout — logo, numbering format, required fields
- [ ] Pet Pooja API docs (Phase 3/4, optional integration)

---

## Start here — Phase 1 first task
Build in this order:
1. `POST /api/auth/login` → JWT response with role
2. Role middleware (guard all routes by role)
3. Category + SubCategory + Item CRUD with auto item_code and EAN-13 barcode generation
4. `GET /api/items/scan/:barcode` → returns item + live stock
5. Basic React app with login screen + Item Master page + barcode scan input field
