/**
 * Seed script — Food & Grains Inventory
 * Usage:  node src/db/seed.js
 * Idempotent: uses ON CONFLICT DO NOTHING / INSERT WHERE NOT EXISTS.
 * Requires DATABASE_URL (or DB_* vars) in .env or environment.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const { Client } = require('pg');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 10;

// ── connection ────────────────────────────────────────────────────────────────

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { DB_USER = 'postgres', DB_PASSWORD = 'changeme',
          DB_HOST = 'localhost', DB_PORT = '5432', DB_NAME = 'fg_inventory' } = process.env;
  return `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

// ── seed data ─────────────────────────────────────────────────────────────────

const USERS = [
  { name: 'Admin',     email: 'admin@fg.local',     password: 'Admin@123',     role: 'admin' },
  { name: 'Purchase',  email: 'purchase@fg.local',  password: 'Purchase@123',  role: 'purchase' },
  { name: 'Warehouse', email: 'warehouse@fg.local', password: 'Warehouse@123', role: 'warehouse' },
  { name: 'Sales',     email: 'sales@fg.local',     password: 'Sales@123',     role: 'sales' },
  { name: 'Viewer',    email: 'view@fg.local',      password: 'View@123',      role: 'view' },
];

const SUB_CATEGORIES = [
  { name: 'Rice',           shelf_life_days: 365 },
  { name: 'Pulses',         shelf_life_days: 540 },
  { name: 'Wheat & Flour',  shelf_life_days: 180 },
  { name: 'Dry Fruits',     shelf_life_days: 270 },
  { name: 'Almonds',        shelf_life_days: 270 },
  { name: 'Spices & Seeds', shelf_life_days: 365 },
  { name: 'Sugar & Jaggery',shelf_life_days: 730 },
];

const VENDORS = [
  { name: 'Agro Traders',  gstin: '27AABCA1234A1Z5', contact: '+91-9800000001', payment_terms: 'Net 30' },
  { name: 'Grain Masters', gstin: '27AABCB5678B1Z3', contact: '+91-9800000002', payment_terms: 'Net 15' },
  { name: 'Spice World',   gstin: '27AABCC9012C1Z1', contact: '+91-9800000003', payment_terms: 'Immediate' },
];

const CUSTOMERS = [
  { name: 'Hotel Sunshine', contact: '+91-9900000001', address: '12 MG Road, Mumbai 400001' },
  { name: 'Retail Plus',    contact: '+91-9900000002', address: '45 Link Road, Andheri, Mumbai 400058' },
  { name: 'Corner Store',   contact: '+91-9900000003', address: '7 Market Lane, Pune 411001' },
];

// Each item references a sub_category by name; codes are FG-0001..FG-0005
const SAMPLE_ITEMS = [
  {
    item_code: 'FG-0001', sub_category: 'Rice',
    barcode: '8901234560001', hsn_code: '1006', unit: 'kg',
    variant_grade: 'Basmati Premium', purchase_rate: 85.00, mrp: 110.00,
    avg_daily_consumption: 50, lead_time_days: 7, demand_variability_pct: 20,
  },
  {
    item_code: 'FG-0002', sub_category: 'Pulses',
    barcode: '8901234560002', hsn_code: '0713', unit: 'kg',
    variant_grade: 'Chana Dal Split', purchase_rate: 72.00, mrp: 95.00,
    avg_daily_consumption: 30, lead_time_days: 7, demand_variability_pct: 20,
  },
  {
    item_code: 'FG-0003', sub_category: 'Wheat & Flour',
    barcode: '8901234560003', hsn_code: '1101', unit: 'kg',
    variant_grade: 'Atta (Whole Wheat)', purchase_rate: 32.00, mrp: 45.00,
    avg_daily_consumption: 100, lead_time_days: 5, demand_variability_pct: 15,
  },
  {
    item_code: 'FG-0004', sub_category: 'Dry Fruits',
    barcode: '8901234560004', hsn_code: '0801', unit: 'kg',
    variant_grade: 'Cashew W320', purchase_rate: 850.00, mrp: 1100.00,
    avg_daily_consumption: 5, lead_time_days: 14, demand_variability_pct: 25,
  },
  {
    item_code: 'FG-0005', sub_category: 'Sugar & Jaggery',
    barcode: '8901234560005', hsn_code: '1701', unit: 'kg',
    variant_grade: 'White Sugar M30', purchase_rate: 38.00, mrp: 50.00,
    avg_daily_consumption: 80, lead_time_days: 7, demand_variability_pct: 10,
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

async function hashPasswords(users) {
  return Promise.all(
    users.map(async (u) => ({
      ...u,
      password_hash: await bcrypt.hash(u.password, BCRYPT_ROUNDS),
    }))
  );
}

async function upsertUsers(client, users) {
  for (const u of users) {
    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, u.password_hash, u.role]
    );
  }
  console.log(`  users: ${users.length} rows processed`);
}

async function upsertCategory(client) {
  const res = await client.query(
    `INSERT INTO categories (name) VALUES ('Food & Grains')
     ON CONFLICT (name) DO NOTHING
     RETURNING id`
  );
  if (res.rows.length > 0) return res.rows[0].id;
  const sel = await client.query(`SELECT id FROM categories WHERE name = 'Food & Grains'`);
  return sel.rows[0].id;
}

async function upsertSubCategories(client, categoryId) {
  for (const sc of SUB_CATEGORIES) {
    await client.query(
      `INSERT INTO sub_categories (category_id, name, shelf_life_days)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM sub_categories WHERE category_id = $1 AND name = $2
       )`,
      [categoryId, sc.name, sc.shelf_life_days]
    );
  }
  console.log(`  sub_categories: ${SUB_CATEGORIES.length} rows processed`);
}

async function upsertVendors(client) {
  for (const v of VENDORS) {
    await client.query(
      `INSERT INTO vendors (name, gstin, contact, payment_terms)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE name = $1)`,
      [v.name, v.gstin, v.contact, v.payment_terms]
    );
  }
  console.log(`  vendors: ${VENDORS.length} rows processed`);
}

async function upsertCustomers(client) {
  for (const c of CUSTOMERS) {
    await client.query(
      `INSERT INTO customers (name, contact, address)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM customers WHERE name = $1)`,
      [c.name, c.contact, c.address]
    );
  }
  console.log(`  customers: ${CUSTOMERS.length} rows processed`);
}

async function upsertItems(client) {
  for (const item of SAMPLE_ITEMS) {
    const scRes = await client.query(
      `SELECT id FROM sub_categories WHERE name = $1 LIMIT 1`,
      [item.sub_category]
    );
    if (scRes.rows.length === 0) {
      console.warn(`  WARNING: sub_category "${item.sub_category}" not found — skipping ${item.item_code}`);
      continue;
    }
    const scId = scRes.rows[0].id;
    await client.query(
      `INSERT INTO items
         (sub_category_id, item_code, barcode, hsn_code, unit, variant_grade,
          purchase_rate, mrp, avg_daily_consumption, lead_time_days, demand_variability_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (item_code) DO NOTHING`,
      [scId, item.item_code, item.barcode, item.hsn_code, item.unit, item.variant_grade,
       item.purchase_rate, item.mrp, item.avg_daily_consumption,
       item.lead_time_days, item.demand_variability_pct]
    );
  }
  console.log(`  items: ${SAMPLE_ITEMS.length} rows processed`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const connStr = buildConnectionString();
  console.log('Connecting to database...');

  const client = new Client({ connectionString: connStr });
  await client.connect();
  console.log('Connected.\n');

  try {
    console.log('Seeding users...');
    const usersWithHashes = await hashPasswords(USERS);
    await upsertUsers(client, usersWithHashes);

    console.log('Seeding categories...');
    const categoryId = await upsertCategory(client);
    await upsertSubCategories(client, categoryId);

    console.log('Seeding vendors...');
    await upsertVendors(client);

    console.log('Seeding customers...');
    await upsertCustomers(client);

    console.log('Seeding items...');
    await upsertItems(client);

    console.log('\nSeed complete. All inserts are idempotent — safe to re-run.');
    console.log('\nTest credentials:');
    USERS.forEach((u) => console.log(`  ${u.role.padEnd(10)} ${u.email}  /  ${u.password}`));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
