const xlsx = require('xlsx');

const wb = xlsx.readFile('D:/Store_KG/Store_KG/Grocery_Price_Tracker_v3.xlsx', { cellFormulas: true, cellDates: true });

console.log('=== WORKBOOK SHEET NAMES ===');
console.log(wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  console.log(`\n========================================`);
  console.log(`SHEET: ${sheetName}`);
  console.log(`========================================`);
  const sheet = wb.Sheets[sheetName];
  const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
  console.log(`Range: ${sheet['!ref']}`);
  
  // Convert sheet to json with raw values and formulas
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  console.log(`Total rows: ${data.length}`);
  
  console.log('--- FIRST 15 ROWS ---');
  data.slice(0, 15).forEach((row, idx) => {
    console.log(`Row ${idx + 1}:`, JSON.stringify(row));
  });

  // Collect some formulas
  const formulas = [];
  for (let cell in sheet) {
    if (cell[0] === '!') continue;
    if (sheet[cell].f) {
      formulas.push({ cell, formula: sheet[cell].f, val: sheet[cell].v });
    }
  }
  console.log(`Total formulas found in ${sheetName}: ${formulas.length}`);
  if (formulas.length > 0) {
    console.log('Sample formulas:');
    formulas.slice(0, 15).forEach(f => console.log(`  Cell ${f.cell}: =${f.formula} (Value: ${f.val})`));
  }
});
