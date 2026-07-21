const db = require('../config/db');

async function ensure() {
  const exists = await db.schema.hasTable('invoice_bank');
  if (!exists) {
    await db.schema.createTable('invoice_bank', (t) => {
      t.increments('id');
      t.integer('user_id').nullable();
      t.integer('vendor_id').nullable();
      t.string('invoice_no', 120).nullable();
      t.date('invoice_date').nullable();
      t.string('status', 40);
      t.string('ocr_hash', 128).unique().nullable();
      t.text('raw_text');
      t.decimal('calculated_subtotal', 14, 2).nullable();
      t.json('payload');
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Created invoice_bank table');
  } else {
    console.log('invoice_bank table already exists');
  }
  process.exit(0);
}

ensure().catch((err) => {
  console.error('Failed to ensure invoice_bank table:', err);
  process.exit(1);
});
