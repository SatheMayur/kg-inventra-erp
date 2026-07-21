const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:d:/Store_KG/Store_KG/source/prisma/dev.db' } }
});

async function main() {
  const items = await prisma.item.findMany({
    take: 50,
    select: { id: true, name: true, category: true, unit: true, aliases: true }
  });
  console.log(`Total database items: ${await prisma.item.count()}`);
  console.log('Sample 30 DB Items:');
  items.slice(0, 30).forEach(i => console.log(`ID: ${i.id} | Name: ${i.name} | Cat: ${i.category} | Unit: ${i.unit} | Aliases: ${i.aliases.map(a => a.aliasText).join(', ')}`));

  await prisma.$disconnect();
}

main();
