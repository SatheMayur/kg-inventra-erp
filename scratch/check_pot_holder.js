const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const req = await prisma.request.findFirst({
    where: { requestNumber: { contains: 'CMQXMSIU' } },
    include: { lines: true }
  });
  if (req) {
    console.log('FOUND request CMQXMSIU:', req);
  } else {
    const all = await prisma.request.findMany({
      include: { lines: true }
    });
    console.log('All requests in DB:', JSON.stringify(all, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
