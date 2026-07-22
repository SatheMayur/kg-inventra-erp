// Smoke test: opening-stock import flow.
// Builds an in-memory XLSX, hits the live API, verifies items/aliases/batches/scan.

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://localhost:4000';
const EMAIL = process.env.EMAIL || 'admin@fg.local';
const PASS  = process.env.PASS  || 'Admin@1234';

async function req(method, p, { token, body, raw } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await fetch(API + p, {
    method,
    headers: raw ? (token ? { Authorization: 'Bearer ' + token } : {}) : h,
    body: raw ? body : (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
}

(async () => {
  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASS } });
  if (!login.body.success) throw new Error('login failed: ' + JSON.stringify(login.body));
  const token = login.body.data.token;
  console.log('login ok');

  const stamp = Date.now();
  const rows = [
    { existing_barcode: `BC-SMOKE-${stamp}-A`, item_name: 'aloo',           sub_category: 'Root Vegetables', qty_kg: 50,  receipt_date: '2026-05-01', expiry_date: '2026-09-30', purchase_rate: 18, mrp: 25,  storage_location: 'Smoke A1' },
    { existing_barcode: `BC-SMOKE-${stamp}-B`, item_name: 'tamatar',        sub_category: 'Fruit Vegetables', qty_kg: 30,  receipt_date: '2026-05-02', expiry_date: '2026-06-10', purchase_rate: 22, mrp: 35,  storage_location: 'Smoke B2' },
    { existing_barcode: `BC-SMOKE-${stamp}-C`, item_name: 'kashmiri lal mirch', sub_category: 'Powdered Spices', qty_kg: 5,   receipt_date: '2026-05-10', expiry_date: '2027-03-20', purchase_rate: 320, mrp: 450, storage_location: 'Smoke C3' },
    { existing_barcode: '',                    item_name: 'kaju w320',      sub_category: 'Nuts',            qty_kg: 10,  receipt_date: '2026-05-15', expiry_date: '2027-05-15', purchase_rate: 850, mrp: 1100, storage_location: 'Smoke D4' },
    { existing_barcode: `BC-SMOKE-${stamp}-E`, item_name: '',               sub_category: '',                qty_kg: 99,  expiry_date: '2027-01-01', purchase_rate: 10 }, // expected error: no name + new barcode
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OpeningStock');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Multipart form
  const boundary = '----formdata-' + Math.random().toString(16).slice(2);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="smoke.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(head), buf, Buffer.from(tail)]);

  const res = await fetch(API + '/api/inward/opening-stock', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const out = await res.json();
  console.log('import result:', JSON.stringify(out.data, null, 2));

  // Scan tests — vendor barcode then primary
  const scanA = await req('GET', `/api/items/scan/BC-SMOKE-${stamp}-A`, { token });
  console.log('scan vendor barcode A:', scanA.status, scanA.body.success
    ? `item ${scanA.body.data.item_code} variant=${scanA.body.data.variant_grade} via=${scanA.body.data.matched_via} stock=${scanA.body.data.live_stock_kg}`
    : scanA.body.error);

  if (scanA.body.success) {
    const primary = scanA.body.data.barcode;
    const scanPrim = await req('GET', `/api/items/scan/${primary}`, { token });
    console.log('scan primary EAN-13:', scanPrim.status, scanPrim.body.success
      ? `item ${scanPrim.body.data.item_code} via=${scanPrim.body.data.matched_via}`
      : scanPrim.body.error);
  }

  // Idempotency — re-run same sheet, expect items_matched grow + new batches
  const res2 = await fetch(API + '/api/inward/opening-stock', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const out2 = await res2.json();
  console.log('re-import result (idempotency check):', JSON.stringify(out2.data, null, 2));
})();
