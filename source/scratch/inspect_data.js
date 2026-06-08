const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const suppliers = await prisma.supplier.findMany();
  console.log('Suppliers:', JSON.stringify(suppliers, null, 2));
  
  const items = await prisma.item.findMany({ take: 10 });
  console.log('Sample Items:', JSON.stringify(items, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
