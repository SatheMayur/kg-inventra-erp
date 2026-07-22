const db = require('../config/db');

async function logAudit({ table_name, record_id, action, user_id, changed_fields, old_value, new_value }, trx) {
  const conn = trx || db;
  await conn('audit_log').insert({
    table_name,
    record_id,
    action,
    user_id,
    changed_fields: changed_fields ? JSON.stringify(changed_fields) : null,
    old_value: old_value ? JSON.stringify(old_value) : null,
    new_value: new_value ? JSON.stringify(new_value) : null
  });
}

module.exports = { logAudit };
