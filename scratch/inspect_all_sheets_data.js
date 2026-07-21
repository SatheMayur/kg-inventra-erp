const xlsx = require('xlsx');

const wb = xlsx.readFile('D:/Store_KG/Store_KG/Grocery_Price_Tracker_v3.xlsx', { cellFormulas: true, cellDates: true, cellNF: true });

// Function to dump sheet
function dumpSheetDetails(sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return;
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n========================================`);
  console.log(`SHEET: ${sheetName}`);
  console.log(`========================================`);
  console.log(`Dimensions: ${sheet['!ref']}`);
  console.log(`Total rows: ${json.length}`);

  // Print header and first 5 data rows
  json.slice(0, 8).forEach((r, i) => console.log(`Row ${i+1}:`, JSON.stringify(r)));
}

wb.SheetNames.forEach(dumpSheetDetails);

// Detailed analysis of Purchase Log
const logSheet = wb.Sheets['Purchase Log'];
const logData = xlsx.utils.sheet_to_json(logSheet, { header: 1 }).slice(5);

const suppliers = new Set();
const itemsMap = new Map();

logData.forEach((row, idx) => {
  if (!row || row.length === 0 || !row[0]) return;
  const date = row[0];
  const item = row[1];
  const unit = row[2];
  const category = row[3];
  const rate = Number(row[4]);
  const qty = Number(row[5]);
  const amount = Number(row[6]);
  const supplier = row[7];
  const invoice = row[8];
  const notes = row[9];

  if (supplier) suppliers.add(supplier);

  if (item) {
    if (!itemsMap.has(item)) {
      itemsMap.set(item, { category, unit, entries: [] });
    }
    itemsMap.get(item).entries.push({ date, rate, qty, amount, supplier, invoice, notes });
  }
});

console.log('\n========================================');
console.log('SUPPLIERS LIST IN PURCHASE LOG:');
console.log(Array.from(suppliers));

console.log('\n========================================');
console.log('ITEMS SUMMARY FROM PURCHASE LOG:');
console.log(`Total unique items: ${itemsMap.size}`);

let totalLogAmount = 0;
itemsMap.forEach((val, key) => {
  const itemSpend = val.entries.reduce((sum, e) => sum + (e.amount || 0), 0);
  totalLogAmount += itemSpend;
});

console.log(`GRAND TOTAL SPEND IN PURCHASE LOG: ₹${totalLogAmount.toFixed(2)}`);
