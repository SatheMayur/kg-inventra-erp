let prisma;

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();

  const suppliers = await prisma.supplier.findMany();
  console.log('Suppliers:', JSON.stringify(suppliers, null, 2));
  
  const items = await prisma.item.findMany({ take: 10 });
  console.log('Sample Items:', JSON.stringify(items, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => prisma && await prisma.$disconnect());
