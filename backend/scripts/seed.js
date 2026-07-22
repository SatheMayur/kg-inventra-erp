require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

const ADMIN_PASSWORD = 'Admin@1234';
const TEST_PASSWORD = 'Test@1234';
const SALT_ROUNDS = 10;

const TEST_USERS = [
  { name: 'Purchase Manager', email: 'purchase@fg.local', role: 'purchase' },
  { name: 'Warehouse Staff',  email: 'warehouse@fg.local', role: 'warehouse' },
  { name: 'Sales Executive',  email: 'sales@fg.local',    role: 'sales' },
  { name: 'View Only',        email: 'view@fg.local',      role: 'view' }
];

const SUB_CATEGORIES = [
  { name: 'Rice',           shelf_life_days: 365 },
  { name: 'Pulses',         shelf_life_days: 540 },
  { name: 'Wheat & Flour',  shelf_life_days: 180 },
  { name: 'Dry Fruits',     shelf_life_days: 270 },
  { name: 'Almonds',        shelf_life_days: 270 },
  { name: 'Spices & Seeds', shelf_life_days: 365 },
  { name: 'Sugar & Jaggery', shelf_life_days: 730 }
];

async function run() {
  try {
    console.log('Seeding database...');

    // 1. Admin user
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    await db('users')
      .insert({
        name: 'Admin',
        email: 'admin@fg.local',
        password_hash: passwordHash,
        role: 'admin',
        is_active: true
      })
      .onConflict('email')
      .ignore();
    console.log('Admin user seeded — email: admin@fg.local  password: Admin@1234');
    console.log('IMPORTANT: Change the admin password after first login.');

    // 2. Test users (one per role)
    const testHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
    for (const u of TEST_USERS) {
      await db('users')
        .insert({ name: u.name, email: u.email, password_hash: testHash, role: u.role, is_active: true })
        .onConflict('email')
        .ignore();
      console.log('Test user seeded — email: %s  role: %s  password: %s', u.email, u.role, TEST_PASSWORD);
    }

    // 3. Category
    let [category] = await db('categories')
      .insert({ name: 'Food & Grains' })
      .onConflict('name')
      .ignore()
      .returning('*');

    if (!category) {
      category = await db('categories').where({ name: 'Food & Grains' }).first();
    }
    console.log('Category seeded: Food & Grains (id=%d)', category.id);

    // 4. Sub categories
    for (const sub of SUB_CATEGORIES) {
      const existing = await db('sub_categories')
        .where({ category_id: category.id, name: sub.name })
        .first();

      if (!existing) {
        await db('sub_categories').insert({
          category_id: category.id,
          name: sub.name,
          shelf_life_days: sub.shelf_life_days
        });
        console.log('  Sub-category seeded: %s (%d days)', sub.name, sub.shelf_life_days);
      } else {
        console.log('  Sub-category exists: %s', sub.name);
      }
    }

    console.log('\nSeed complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

run();
