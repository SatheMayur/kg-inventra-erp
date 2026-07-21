const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- RECENT WHATSAPP MESSAGES ---');
  const messages = await prisma.whatsAppMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(messages, null, 2));

  console.log('\n--- REGISTERED USERS ---');
  const users = await prisma.user.findMany({
    select: { id: true, empId: true, name: true, phone: true, role: true }
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
