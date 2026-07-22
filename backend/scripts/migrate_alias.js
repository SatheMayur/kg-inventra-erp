require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const sqls = [
    `CREATE TABLE IF NOT EXISTS item_translations (
      id SERIAL PRIMARY KEY,
      item_id INT REFERENCES items(id) ON DELETE CASCADE,
      language VARCHAR(30) NOT NULL,
      display_name VARCHAR(200) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(item_id, language)
    )`,
    'ALTER TABLE vendor_items ADD COLUMN IF NOT EXISTS vendor_item_name VARCHAR(200)',
    'ALTER TABLE vendor_items ADD COLUMN IF NOT EXISTS vendor_barcode VARCHAR(100)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_items_barcode ON vendor_items(vendor_barcode) WHERE vendor_barcode IS NOT NULL'
  ];

  for (const sql of sqls) {
    try {
      await client.query(sql);
      console.log('OK:', sql.slice(0, 80));
    } catch (e) {
      console.log('SKIP:', e.message.slice(0, 80));
    }
  }

  await client.end();
  console.log('Alias migration complete.');
  process.exit(0);
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
