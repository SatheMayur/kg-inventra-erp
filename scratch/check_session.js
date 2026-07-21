const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const session = await prisma.whatsAppSession.findUnique({
    where: { id: 'default' }
  });
  console.log('--- WhatsApp Session Status ---');
  console.log(JSON.stringify(session, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
