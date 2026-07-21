const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:d:/Store_KG/Store_KG/source/prisma/dev.db'
    }
  }
});
const wb = xlsx.readFile('D:/Store_KG/Store_KG/Grocery_Price_Tracker_v3.xlsx');

async function main() {
  const logSheet = wb.Sheets['Purchase Log'];
  const logData = xlsx.utils.sheet_to_json(logSheet, { header: 1 }).slice(5);

  const workbookItemsMap = new Map();
  logData.forEach(row => {
    if (!row || !row[0] || !row[1]) return;
    const name = row[1];
    const unit = row[2];
    const cat = row[3];
    if (!workbookItemsMap.has(name)) {
      workbookItemsMap.set(name, { name, unit, cat, count: 0 });
    }
    workbookItemsMap.get(name).count++;
  });

  const dbItems = await prisma.item.findMany({
    include: { aliases: true }
  });

  console.log(`=== DATABASE ITEMS COUNT: ${dbItems.length} ===`);
  console.log(`=== WORKBOOK UNIQUE ITEMS: ${workbookItemsMap.size} ===\n`);

  let exactMatches = 0;
  let aliasMatches = 0;
  let noMatches = 0;

  const mappingResults = [];

  for (const [wbName, wbInfo] of workbookItemsMap.entries()) {
    const cleanName = wbName.trim().toLowerCase();
    
    // 1. Exact name match
    let matched = dbItems.find(i => i.name.trim().toLowerCase() === cleanName);
    let matchType = 'EXACT';

    // 2. Short name match
    if (!matched) {
      matched = dbItems.find(i => (i.shortName || '').trim().toLowerCase() === cleanName);
      if (matched) matchType = 'SHORT_NAME';
    }

    // 3. Alias match
    if (!matched) {
      matched = dbItems.find(i => (i.aliases || []).some(a => a.aliasText.trim().toLowerCase() === cleanName));
      if (matched) matchType = 'ALIAS';
    }

    // 4. Substring / Transliteration match
    if (!matched) {
      matched = dbItems.find(i => i.name.toLowerCase().includes(cleanName) || cleanName.includes(i.name.toLowerCase()));
      if (matched) matchType = 'PROBABLE';
    }

    if (matched) {
      if (matchType === 'EXACT') exactMatches++;
      else aliasMatches++;
      mappingResults.push({ wbName, dbId: matched.id, dbName: matched.name, matchType, cat: wbInfo.cat, unit: wbInfo.unit });
    } else {
      noMatches++;
      mappingResults.push({ wbName, dbId: null, dbName: null, matchType: 'NO_MATCH', cat: wbInfo.cat, unit: wbInfo.unit });
    }
  }

  console.log(`Exact Matches: ${exactMatches}`);
  console.log(`Alias/Probable Matches: ${aliasMatches}`);
  console.log(`Unmatched Items: ${noMatches}`);
  
  console.log('\n--- SAMPLE MAPPING RESULTS ---');
  console.table(mappingResults.slice(0, 30));

  await prisma.$disconnect();
}

main().catch(console.error);
