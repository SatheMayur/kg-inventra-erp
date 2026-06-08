require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const sqls = [
    'ALTER TABLE items ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE',
    'ALTER TABLE items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 5.00',
    'ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_qty NUMERIC(10,2) DEFAULT 0',
    "ALTER TABLE items ADD COLUMN IF NOT EXISTS pack_size VARCHAR(50)",
    "ALTER TABLE items ADD COLUMN IF NOT EXISTS storage_location VARCHAR(100)",
    'ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT',
    "ALTER TABLE items ADD COLUMN IF NOT EXISTS item_image_url TEXT",
    `CREATE TABLE IF NOT EXISTS vendor_items (
      id SERIAL PRIMARY KEY,
      vendor_id INT REFERENCES vendors(id) ON DELETE CASCADE,
      item_id INT REFERENCES items(id) ON DELETE CASCADE,
      vendor_sku VARCHAR(100),
      purchase_rate NUMERIC(10,2),
      lead_time_days INT DEFAULT 7,
      is_preferred BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(vendor_id, item_id)
    )`,
    `CREATE TABLE IF NOT EXISTS item_aliases (
      id SERIAL PRIMARY KEY,
      item_id INT REFERENCES items(id) ON DELETE CASCADE,
      alias_barcode VARCHAR(50) UNIQUE,
      alias_name VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  ];

  for (const sql of sqls) {
    try {
      await client.query(sql);
      console.log('OK:', sql.slice(0, 60));
    } catch (e) {
      console.log('SKIP:', e.message.slice(0, 80));
    }
  }

  await client.end();
  console.log('MDM migration complete.');
  process.exit(0);
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
