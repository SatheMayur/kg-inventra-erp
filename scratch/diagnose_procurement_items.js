const { PrismaClient } = require('@prisma/client');
const path = require('path');
const process = require('process');

const dbUrl = `file:${path.resolve(__dirname, '../prisma/dev.db')}`;
const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
});

async function main() {
  console.log('--- DIAGNOSTIC DATA REPORT ---');
  
  // 5. Number of Item Master records in DB
  const totalItems = await prisma.item.count({ where: { deletedAt: null } });
  console.log('5. Total Item Master records (not deleted):', totalItems);

  // 6. Number of active items
  const activeItems = await prisma.item.findMany({
    where: { deletedAt: null, active: true },
    select: {
      id: true,
      name: true,
      category: true,
      unit: true,
      dailyProcurementEligible: true,
      itemNature: true,
      aliases: { select: { aliasText: true } }
    }
  });
  console.log('6. Number of active items (active: true):', activeItems.length);

  // Breakdown of dailyProcurementEligible values
  const trueEligible = activeItems.filter(i => i.dailyProcurementEligible === true);
  const falseEligible = activeItems.filter(i => i.dailyProcurementEligible === false);
  const nullEligible = activeItems.filter(i => i.dailyProcurementEligible === null || i.dailyProcurementEligible === undefined);
  const serviceItems = activeItems.filter(i => i.itemNature === 'SERVICE');

  console.log('   - dailyProcurementEligible === true:', trueEligible.length);
  console.log('   - dailyProcurementEligible === false:', falseEligible.length);
  console.log('   - dailyProcurementEligible === null/undefined:', nullEligible.length);
  console.log('   - itemNature === SERVICE:', serviceItems.length);

  // 7. Number of Daily Procurement-eligible items using current frontend filter condition:
  // (item.active !== false && item.deletedAt === null && item.itemNature !== 'SERVICE' && item.dailyProcurementEligible !== false)
  const frontendEligible = activeItems.filter(item => 
    item.itemNature !== 'SERVICE' && item.dailyProcurementEligible !== false
  );
  console.log('7. Daily Procurement-eligible items under current frontend condition:', frontendEligible.length);

  // Sample items with dailyProcurementEligible values
  console.log('\nSample items from database:');
  activeItems.slice(0, 10).forEach(i => {
    console.log(`- ID: ${i.id} | Name: "${i.name}" | Cat: "${i.category}" | Unit: "${i.unit}" | Eligible: ${i.dailyProcurementEligible} | Nature: ${i.itemNature} | Aliases: ${JSON.stringify(i.aliases.map(a => a.aliasText))}`);
  });

  // Check categories in database
  const categories = [...new Set(activeItems.map(i => i.category).filter(Boolean))];
  console.log('\nCategories in active items:', categories);

  // Test search query "bata" against active items
  const query = 'bata';
  const bataMatches = activeItems.filter(item => {
    const haystack = [item.name, item.category, ...(item.aliases ?? []).map(a => a.aliasText)].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  console.log(`\nItems matching query "${query}":`, bataMatches.length);
  bataMatches.forEach(i => console.log(`  -> Match: ${i.name} (Category: ${i.category})`));

  // Check for Bataka or Potato or similar
  const potatoMatches = activeItems.filter(item => 
    item.name.toLowerCase().includes('potat') || item.name.toLowerCase().includes('batak') || item.name.toLowerCase().includes('aloo') ||
    item.aliases.some(a => a.aliasText.toLowerCase().includes('batak') || a.aliasText.toLowerCase().includes('bata'))
  );
  console.log('\nPotato / Bataka items in database:', potatoMatches.map(i => ({ name: i.name, aliases: i.aliases.map(a => a.aliasText) })));

  // Count total aliases in database
  const totalAliases = await prisma.itemAlias.count();
  console.log('\n10. Total item aliases in database:', totalAliases);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
