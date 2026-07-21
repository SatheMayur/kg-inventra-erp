const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const actions = await prisma.auditLog.findMany({
    select: { action: true },
    distinct: ['action']
  });
  console.log('Distinct Actions in AuditLog:', actions);
}

main().catch(console.error).finally(() => prisma.$disconnect());
