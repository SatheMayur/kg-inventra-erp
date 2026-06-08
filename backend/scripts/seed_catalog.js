// Seed the items master from the normalizer canonical taxonomy.
// Idempotent: existing categories / sub-categories / items are left untouched.
//
// Run:  node scripts/seed_catalog.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { generateEAN13 } = require('../src/services/barcode');
const { CANONICAL, TAXONOMY } = require('../src/services/normalize');

// Default shelf life (days) per sub-category — used when a new sub_category row is created.
const SHELF_LIFE = {
  // Vegetables
  'Root Vegetables': 30,
  'Bulb Vegetables': 30,
  'Leafy Vegetables': 7,
  'Gourd Vegetables': 14,
  'Fruit Vegetables': 10,
  'Pod & Bean Vegetables': 10,
  'Stem & Flower Vegetables': 10,
  'Tuber & Other Vegetables': 14,
  // Fruits
  'Citrus Fruits': 21,
  'Tropical Fruits': 14,
  'Pome & Stone Fruits': 30,
  'Berries & Grapes': 7,
  'Melons': 14,
  // Pulses & Lentils
  'Split Dals': 540,
  'Whole Pulses': 540,
  // Grains & Flours
  'Rice': 540,
  'Wheat & Atta': 180,
  'Flours': 180,
  'Other Grains': 365,
  // Spices & Condiments
  'Whole Spices': 730,
  'Powdered Spices': 365,
  'Herbs & Leaves': 7,
  'Spice Blends': 365,
  // Dairy
  'Liquid Dairy': 7,
  'Fermented': 7,
  'Cheese': 21,
  'Fats': 180,
  // Oils & Fats
  'Cooking Oils': 365,
  // Dry Fruits & Nuts
  'Nuts': 270,
  'Dry Fruits': 365,
  // Sweeteners & Salt
  'Sweeteners': 730,
  'Salt': 1825,
  // Bakery & Snacks
  'Bread & Buns': 5,
  'Biscuits & Cookies': 180,
  'Snacks': 90,
  // Ready-to-Eat & Packaged Food
  'Instant Food': 365,
  'Ready Meals': 180,
  // Beverages
  'Tea & Coffee': 365,
  'Juices': 180,
  'Soft Drinks': 180,
  'Water': 365,
  // Confectionery
  'Chocolate': 270,
  'Candy': 365,
  // Eggs
  'Eggs': 21,
};

// HSN codes (4-digit prefix per category — informational, not legal advice).
const HSN_BY_CATEGORY = {
  'Vegetables': '0709',
  'Fruits': '0810',
  'Pulses & Lentils': '0713',
  'Grains & Flours': '1006',
  'Spices & Condiments': '0910',
  'Dairy': '0401',
  'Oils & Fats': '1512',
  'Dry Fruits & Nuts': '0802',
  'Sweeteners & Salt': '1701',
  'Bakery & Snacks': '1905',
  'Ready-to-Eat & Packaged Food': '2106',
  'Beverages': '2202',
  'Confectionery': '1806',
  'Eggs': '0407',
};

// Default unit per category (most items per category share this).
const DEFAULT_UNIT_BY_CATEGORY = {
  'Vegetables': 'kg',
  'Fruits': 'kg',
  'Pulses & Lentils': 'kg',
  'Grains & Flours': 'kg',
  'Spices & Condiments': 'kg',
  'Dairy': 'liter',
  'Oils & Fats': 'liter',
  'Dry Fruits & Nuts': 'kg',
  'Sweeteners & Salt': 'kg',
  'Bakery & Snacks': 'pcs',
  'Ready-to-Eat & Packaged Food': 'pack',
  'Beverages': 'liter',
  'Confectionery': 'pcs',
  'Eggs': 'pcs',
};

async function nextItemCode() {
  const row = await db('items').select('item_code').orderBy('id', 'desc').first();
  if (!row) return 'FG-0001';
  const num = parseInt(row.item_code.replace('FG-', ''), 10);
  return 'FG-' + String(num + 1).padStart(4, '0');
}

async function upsertCategory(name) {
  const existing = await db('categories').where({ name }).first();
  if (existing) return existing;
  const [row] = await db('categories').insert({ name }).returning('*');
  return row;
}

async function upsertSubCategory(categoryId, name) {
  const existing = await db('sub_categories')
    .where({ category_id: categoryId, name })
    .first();
  if (existing) return existing;
  const shelf = SHELF_LIFE[name] || 365;
  const [row] = await db('sub_categories')
    .insert({ category_id: categoryId, name, shelf_life_days: shelf })
    .returning('*');
  return row;
}

async function run() {
  console.log('Seeding catalog from normalizer taxonomy...');

  const summary = { categories: 0, sub_categories: 0, items_inserted: 0, items_skipped: 0 };

  // Build the unique (category, sub_category) list from TAXONOMY.
  const groupings = new Map(); // canonical -> {category, sub_category}
  for (const [canonical, info] of Object.entries(TAXONOMY)) {
    if (!CANONICAL[canonical]) continue;
    groupings.set(canonical, info);
  }

  // Step 1 — upsert all categories.
  const categoryIds = new Map(); // name -> id
  for (const { category } of groupings.values()) {
    if (categoryIds.has(category)) continue;
    const row = await upsertCategory(category);
    categoryIds.set(category, row.id);
    summary.categories++;
  }
  console.log(`  categories ready: ${categoryIds.size}`);

  // Step 2 — upsert all sub-categories.
  const subCategoryIds = new Map(); // "category|sub" -> id
  for (const { category, sub_category } of groupings.values()) {
    const key = `${category}|${sub_category}`;
    if (subCategoryIds.has(key)) continue;
    const row = await upsertSubCategory(categoryIds.get(category), sub_category);
    subCategoryIds.set(key, row.id);
    summary.sub_categories++;
  }
  console.log(`  sub-categories ready: ${subCategoryIds.size}`);

  // Step 3 — insert items (one per canonical, idempotent on (sub_category_id, variant_grade)).
  for (const [canonical, info] of groupings) {
    const subKey = `${info.category}|${info.sub_category}`;
    const subId = subCategoryIds.get(subKey);

    const existing = await db('items')
      .where({ sub_category_id: subId, variant_grade: canonical })
      .first();
    if (existing) {
      summary.items_skipped++;
      continue;
    }

    const item_code = await nextItemCode();
    const [newItem] = await db('items')
      .insert({
        sub_category_id: subId,
        item_code,
        barcode: 'TEMP_' + item_code,
        hsn_code: HSN_BY_CATEGORY[info.category] || null,
        unit: DEFAULT_UNIT_BY_CATEGORY[info.category] || 'kg',
        variant_grade: canonical,
        purchase_rate: 0,
        mrp: 0,
        avg_daily_consumption: 0,
        lead_time_days: 7,
        demand_variability_pct: 20,
        gst_rate: 5,
        reorder_qty: 0,
        description: `Canonical item: ${canonical} (auto-seeded from catalog)`,
        is_active: true,
      })
      .returning('*');

    const barcode = generateEAN13(newItem.id);
    await db('items').where({ id: newItem.id }).update({ barcode });
    summary.items_inserted++;
    console.log(`    + ${item_code}  ${canonical.padEnd(28)}  ${info.category} / ${info.sub_category}`);
  }

  console.log('\nDone:');
  console.log(`  categories upserted    : ${summary.categories}`);
  console.log(`  sub-categories upserted: ${summary.sub_categories}`);
  console.log(`  items inserted         : ${summary.items_inserted}`);
  console.log(`  items skipped (exists) : ${summary.items_skipped}`);

  process.exit(0);
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
