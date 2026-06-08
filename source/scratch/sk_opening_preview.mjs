import puppeteer from 'puppeteer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('E:/Store_KG/backend/node_modules/xlsx');
import fs from 'fs';
import path from 'path';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 1000 });

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.type('input[type=email]', 'admin@fg.local');
await page.type('input[type=password]', 'Admin@1234');
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }),
]);

await page.goto('http://localhost:5173/opening-stock', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 400));

// Build sample xlsx file
const stamp = Date.now();
const rows = [
  { existing_barcode: `UI-${stamp}-A`, item_name: 'aloo',           sub_category: 'Root Vegetables', qty_kg: 25, receipt_date: '2026-05-22', expiry_date: '2026-08-01', purchase_rate: 18 },
  { existing_barcode: `UI-${stamp}-B`, item_name: 'iranian pista roasted', sub_category: 'Nuts', qty_kg: 3, receipt_date: '2026-05-22', expiry_date: '2027-05-22', purchase_rate: 1200 },
  { existing_barcode: `UI-${stamp}-C`, item_name: 'india gate basmati 1121', sub_category: 'Rice', qty_kg: 50, receipt_date: '2026-05-22', expiry_date: '2028-06-30', purchase_rate: 95 },
];
const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'OpeningStock');
const tmp = path.join(process.cwd(), 'scratch', 'sample_opening.xlsx');
fs.writeFileSync(tmp, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

// Set file input
const input = await page.$('#os-file-input');
await input.uploadFile(tmp);
await new Promise(r => setTimeout(r, 300));

// Click Preview
const buttons = await page.$$('button');
for (const b of buttons) {
  const t = await page.evaluate(el => el.textContent, b);
  if (/^Preview$/.test(t.trim())) { await b.click(); break; }
}
// Wait for preview table to appear (look for "Preview (dry run)" text)
await page.waitForFunction(
  () => document.body.innerText.includes('Preview (dry run)'),
  { timeout: 30000 }
);
await new Promise(r => setTimeout(r, 400));

await page.screenshot({ path: 'scratch/sk_opening_preview.png', fullPage: true });
console.log('saved sk_opening_preview.png');

await browser.close();
