const XLSX = require('xlsx');
const wb = XLSX.readFile('D:\\Store_KG\\Store_KG\\kg_store_import_ready.xlsx');
console.log('Sheets in workbook:', wb.SheetNames);
