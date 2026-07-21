const xlsx = require('xlsx');

const wb = xlsx.readFile('D:/Store_KG/Store_KG/Grocery_Price_Tracker_v3.xlsx', { cellFormulas: true, cellDates: true, cellNF: true });

const sheet = wb.Sheets['Purchase Log'];
const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log('=== PURCHASE LOG HEADERS ===');
console.log(rawData[0]);
console.log(rawData[1]);
console.log(rawData[2]);
console.log(rawData[3]);
console.log(rawData[4]);

// Find header row
let headerIdx = -1;
for (let i = 0; i < 10; i++) {
  if (rawData[i] && rawData[i].includes('Item Name') || rawData[i].includes('Item') || rawData[i].includes('Date')) {
    headerIdx = i;
    break;
  }
}

console.log(`Header row index: ${headerIdx}`);
console.log('Header row content:', rawData[headerIdx]);

const rows = rawData.slice(headerIdx + 1).filter(r => r.length > 0 && r[0]);
console.log(`Total data rows in Purchase Log: ${rows.length}`);

console.log('\n--- SAMPLE 10 LOG ROWS ---');
rows.slice(0, 10).forEach((r, i) => console.log(`Row ${i+1}:`, r));

// Collect unique items, categories, units, suppliers
const items = new Set();
const categories = new Set();
const units = new Set();
const suppliers = new Set();
const dates = new Set();

rows.forEach(r => {
  if (r[0]) dates.add(r[0]);
  if (r[1]) items.add(r[1]);
  if (r[2]) units.add(r[2]);
  if (r[3]) categories.add(r[3]);
  if (r[6]) suppliers.add(r[6]);
});

console.log('\n=== UNIQUE CATEGORIES ===', Array.from(categories));
console.log('=== UNIQUE UNITS ===', Array.from(units));
console.log('=== UNIQUE SUPPLIERS ===', Array.from(suppliers));
console.log(`=== UNIQUE ITEMS (${items.size}) ===`, Array.from(items).slice(0, 20), '...');
console.log('=== DATES ===', Array.from(dates));
