const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const batches = await prisma.importBatch.findMany();
  console.log('Import Batches:', JSON.stringify(batches, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
