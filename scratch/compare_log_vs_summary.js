const xlsx = require('xlsx');

const wb = xlsx.readFile('D:/Store_KG/Store_KG/Grocery_Price_Tracker_v3.xlsx');

// 1. Purchase Log totals per item and per category
const logSheet = wb.Sheets['Purchase Log'];
const logData = xlsx.utils.sheet_to_json(logSheet, { header: 1 }).slice(5);

const itemLogTotals = {};
const catLogTotals = {};

logData.forEach((row) => {
  if (!row || !row[0]) return;
  const item = row[1];
  const cat = row[3];
  const amt = Number(row[6]) || 0;

  if (item) {
    itemLogTotals[item] = (itemLogTotals[item] || 0) + amt;
  }
  if (cat) {
    catLogTotals[cat] = (catLogTotals[cat] || 0) + amt;
  }
});

console.log('=== PURCHASE LOG CATEGORY TOTALS ===');
console.log(catLogTotals);

// 2. Item Price Summary totals per item and per category
const summarySheet = wb.Sheets['Item Price Summary'];
const summaryData = xlsx.utils.sheet_to_json(summarySheet, { header: 1 }).slice(5);

const itemSummaryTotals = {};
const catSummaryTotals = {};

summaryData.forEach((row) => {
  if (!row || !row[0]) return;
  const item = row[0];
  const cat = row[1];
  const spend = Number(row[15]) || 0; // Total Spend column

  if (item) {
    itemSummaryTotals[item] = spend;
  }
  if (cat) {
    catSummaryTotals[cat] = (catSummaryTotals[cat] || 0) + spend;
  }
});

console.log('\n=== ITEM PRICE SUMMARY CATEGORY TOTALS ===');
console.log(catSummaryTotals);

console.log('\n=== DISCREPANCIES PER ITEM (Purchase Log vs Item Price Summary) ===');
const allItems = new Set([...Object.keys(itemLogTotals), ...Object.keys(itemSummaryTotals)]);
let diffCount = 0;

allItems.forEach(item => {
  const logAmt = (itemLogTotals[item] || 0);
  const sumAmt = (itemSummaryTotals[item] || 0);
  const diff = Math.abs(logAmt - sumAmt);
  if (diff > 0.05) {
    diffCount++;
    console.log(`Item "${item}": Log = ₹${logAmt.toFixed(2)}, Summary = ₹${sumAmt.toFixed(2)}, Diff = ₹${(sumAmt - logAmt).toFixed(2)}`);
  }
});

console.log(`Total items with discrepancy: ${diffCount}`);
