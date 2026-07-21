const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const requests = await prisma.request.findMany({
    include: { lines: true }
  });
  console.log(`Total requests: ${requests.length}`);
  console.log('Requests:', JSON.stringify(requests, null, 2));

  const instances = await prisma.approvalInstance.findMany({
    include: { steps: true }
  });
  console.log('Approval Instances:', JSON.stringify(instances, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
