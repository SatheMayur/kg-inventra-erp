// Smoke test: opening-stock dryRun mode.
// Verifies that ?dryRun=true returns a preview with no DB writes,
// then real run commits.

const XLSX = require('xlsx');

const API = 'http://localhost:4000';
const EMAIL = 'admin@fg.local';
const PASS = 'Admin@1234';

async function login() {
  const r = await fetch(API + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const j = await r.json();
  return j.data.token;
}

async function counts(token) {
  const h = { Authorization: 'Bearer ' + token };
  const items = await fetch(API + '/api/items?active=all', { headers: h }).then(r => r.json());
  const batches = await fetch(API + '/api/reports/expiry-alerts?days=99999', { headers: h }).then(r => r.json());
  return {
    items: items.data?.length || 0,
    batches: batches.data?.length || 0,
  };
}

function buildSheet(stamp) {
  const rows = [
    { existing_barcode: `DRY-${stamp}-A`, item_name: 'aloo',           sub_category: 'Root Vegetables', qty_kg: 25, receipt_date: '2026-05-22', expiry_date: '2026-08-01', purchase_rate: 18 },
    { existing_barcode: `DRY-${stamp}-B`, item_name: 'macadamia nuts roasted', sub_category: 'Nuts',  qty_kg: 3,  receipt_date: '2026-05-22', expiry_date: '2027-05-22', purchase_rate: 950 },
    { existing_barcode: `DRY-${stamp}-C`, item_name: 'dragonfruit',    sub_category: '',                qty_kg: 5,  receipt_date: '2026-05-22', expiry_date: '2026-06-30', purchase_rate: 200 }, // expected error: no sub_cat known
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OpeningStock');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function postSheet(token, buf, dryRun) {
  const boundary = '----dryrun-' + Math.random().toString(16).slice(2);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dry.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(head), buf, Buffer.from(tail)]);
  const url = API + '/api/inward/opening-stock' + (dryRun ? '?dryRun=true' : '');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  return r.json();
}

(async () => {
  const token = await login();
  console.log('login ok');

  const before = await counts(token);
  console.log('before:', before);

  const stamp = Date.now();
  const buf = buildSheet(stamp);

  // 1. Dry run
  const dryRes = await postSheet(token, buf, true);
  console.log('\n=== DRY RUN ===');
  console.log('summary:', {
    dry_run: dryRes.data.dry_run,
    items_created: dryRes.data.items_created,
    items_matched: dryRes.data.items_matched,
    aliases_registered: dryRes.data.aliases_registered,
    batches_created: dryRes.data.batches_created,
    errors: dryRes.data.errors.length,
  });
  console.log('preview rows:', dryRes.data.preview.length);
  for (const p of dryRes.data.preview) {
    console.log(`  row=${p.row} ${p.action.padEnd(15)} ${(p.canonical_name||'?').padEnd(18)} cat=${p.category||'?'} alias=${p.alias_action} qty=${p.batch_qty}`);
  }
  for (const e of dryRes.data.errors) console.log('  ERR row', e.row, '-', e.error);

  const afterDry = await counts(token);
  console.log('after dry run:', afterDry, 'delta items:', afterDry.items - before.items, 'delta batches:', afterDry.batches - before.batches);

  // 2. Real run
  const realRes = await postSheet(token, buf, false);
  console.log('\n=== REAL RUN ===');
  console.log('summary:', {
    items_created: realRes.data.items_created,
    items_matched: realRes.data.items_matched,
    aliases_registered: realRes.data.aliases_registered,
    batches_created: realRes.data.batches_created,
    errors: realRes.data.errors.length,
  });

  const afterReal = await counts(token);
  console.log('after real run:', afterReal, 'delta items:', afterReal.items - before.items, 'delta batches:', afterReal.batches - before.batches);
})();
