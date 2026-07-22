/**
 * Migration: create invoice_bank table
 */
exports.up = function(knex) {
  return knex.schema.createTable('invoice_bank', (t) => {
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
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('invoice_bank');
};
