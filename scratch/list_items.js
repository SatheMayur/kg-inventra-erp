const { PrismaClient } = require('@prisma/client');
const path = require('path');

const dbUrl = `file:${path.resolve(__dirname, '../prisma/dev.db')}`;
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } }
});

async function main() {
  const items = await prisma.item.findMany({
    where: { deletedAt: null, active: true },
    select: { name: true, category: true, unit: true, itemCode: true }
  });
  console.log(`Total active items in DB: ${items.length}`);
  console.log('Sample 30 item names:');
  items.slice(0, 30).forEach((i, idx) => console.log(`${idx+1}. [${i.category}] ${i.name} (${i.unit})`));
  await prisma.$disconnect();
}

main();
