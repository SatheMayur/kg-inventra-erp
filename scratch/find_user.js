const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userById = await prisma.user.findUnique({
    where: { id: 'cmqw8yxjf000x80lof65xp6x5' }
  });
  console.log('User by ID:', userById);

  const userByEmpId = await prisma.user.findFirst({
    where: { empId: 'sandeshr' }
  });
  console.log('User by empId sandeshr:', userByEmpId);
}

main().catch(console.error).finally(() => prisma.$disconnect());
