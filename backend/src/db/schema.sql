-- Food & Grains Inventory — Full Schema
-- Run this against your PostgreSQL database first, then run seed.sql

-- Users (must come before tables that reference it)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL,                 -- admin|purchase|warehouse|sales|view
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sub_categories (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id),
  name VARCHAR(100) NOT NULL,
  shelf_life_days INT DEFAULT 365
);

-- Items
CREATE TABLE IF NOT EXISTS items (
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
CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY,
  item_id INT REFERENCES items(id),
  receipt_date DATE NOT NULL,                 -- FIFO sort key
  expiry_date DATE,
  qty_received NUMERIC(10,2) NOT NULL,
  qty_remaining NUMERIC(10,2) NOT NULL,
  risk_score INT DEFAULT 0,                  -- 0-100, updated nightly
  expired_at TIMESTAMPTZ,
  expired_qty NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_item_receipt ON batches(item_id, receipt_date ASC);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  gstin VARCHAR(20),
  contact VARCHAR(100),
  payment_terms VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact VARCHAR(100),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  vendor_id INT REFERENCES vendors(id),
  po_date DATE NOT NULL,
  delivery_date DATE,
  status VARCHAR(20) DEFAULT 'open',         -- open | received | closed
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inward Entries
CREATE TABLE IF NOT EXISTS inward_entries (
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

CREATE TABLE IF NOT EXISTS inward_lines (
  id SERIAL PRIMARY KEY,
  inward_id INT REFERENCES inward_entries(id),
  item_id INT REFERENCES items(id),
  batch_id INT REFERENCES batches(id),       -- created on confirm
  qty NUMERIC(10,2) NOT NULL,
  rate NUMERIC(10,2) NOT NULL,
  expiry_date DATE
);

-- Outward Entries
CREATE TABLE IF NOT EXISTS outward_entries (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  challan_no VARCHAR(50) UNIQUE,             -- auto-generated on lock
  dispatch_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',        -- draft | confirmed | locked
  locked_at TIMESTAMPTZ,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outward_lines (
  id SERIAL PRIMARY KEY,
  outward_id INT REFERENCES outward_entries(id),
  item_id INT REFERENCES items(id),
  batch_id INT REFERENCES batches(id),       -- FIFO-selected batch
  qty NUMERIC(10,2) NOT NULL,
  rate NUMERIC(10,2)
);

-- Audit Trail
CREATE TABLE IF NOT EXISTS audit_log (
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

-- Cron Job Log
CREATE TABLE IF NOT EXISTS cron_log (
  id SERIAL PRIMARY KEY,
  job VARCHAR(100),
  ran_at TIMESTAMPTZ DEFAULT NOW(),
  result JSONB
);

-- MDM enhancements (run after initial schema)
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 5.00;
ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_qty NUMERIC(10,2) DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pack_size VARCHAR(50);
ALTER TABLE items ADD COLUMN IF NOT EXISTS storage_location VARCHAR(100);
ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS item_image_url TEXT;

-- Vendor-Item price mapping
CREATE TABLE IF NOT EXISTS vendor_items (
  id SERIAL PRIMARY KEY,
  vendor_id INT REFERENCES vendors(id) ON DELETE CASCADE,
  item_id INT REFERENCES items(id) ON DELETE CASCADE,
  vendor_sku VARCHAR(100),
  purchase_rate NUMERIC(10,2),
  lead_time_days INT DEFAULT 7,
  is_preferred BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, item_id)
);

-- Item alternate barcodes / aliases
CREATE TABLE IF NOT EXISTS item_aliases (
  id SERIAL PRIMARY KEY,
  item_id INT REFERENCES items(id) ON DELETE CASCADE,
  alias_barcode VARCHAR(50) UNIQUE,
  alias_name VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Three-layer alias mapping
CREATE TABLE IF NOT EXISTS item_translations (
  id SERIAL PRIMARY KEY,
  item_id INT REFERENCES items(id) ON DELETE CASCADE,
  language VARCHAR(30) NOT NULL,        -- 'hindi', 'marathi', 'gujarati', 'trade', 'common'
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, language)
);

ALTER TABLE vendor_items ADD COLUMN IF NOT EXISTS vendor_item_name VARCHAR(200);
ALTER TABLE vendor_items ADD COLUMN IF NOT EXISTS vendor_barcode VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_items_barcode ON vendor_items(vendor_barcode) WHERE vendor_barcode IS NOT NULL;

-- User-added catalog items (extends the built-in normalizer dictionary)
CREATE TABLE IF NOT EXISTS custom_catalog_items (
  id SERIAL PRIMARY KEY,
  canonical VARCHAR(200) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  sub_category VARCHAR(100) NOT NULL,
  aliases JSONB DEFAULT '[]'::jsonb,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
