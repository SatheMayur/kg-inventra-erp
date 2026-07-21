const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deptCount = await prisma.department.count();
  const itemCount = await prisma.item.count();
  const txCount = await prisma.transaction.count();
  
  console.log('Database Counts:');
  console.log('Departments:', deptCount);
  console.log('Items:', itemCount);
  console.log('Transactions:', txCount);

  const sampleDepts = await prisma.department.findMany({ take: 5 });
  console.log('Sample Departments:', sampleDepts);

  const sampleItems = await prisma.item.findMany({ take: 5, select: { id: true, name: true, category: true, unit: true, sourceItemName: true, sourceFileName: true, importBatchId: true } });
  console.log('Sample Items:', sampleItems);

  // Check unique sources
  const deptSources = await prisma.department.groupBy({
    by: ['sourceSheetName', 'sourceFileName'],
    _count: true
  });
  console.log('Department Grouped Sources:', deptSources);

  const itemSources = await prisma.item.groupBy({
    by: ['sourceSheetName', 'sourceFileName'],
    _count: true
  });
  console.log('Item Grouped Sources:', itemSources);
  
  const transSources = await prisma.transaction.groupBy({
    by: ['sourceSheetName', 'sourceFileName'],
    _count: true
  });
  console.log('Transaction Grouped Sources:', transSources);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
