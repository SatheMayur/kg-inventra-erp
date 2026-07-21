const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, empId: true, name: true, department: true, role: true, isDeptHead: true }
  });
  console.log(`Total users in DB: ${users.length}`);
  console.log('Users:', JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
