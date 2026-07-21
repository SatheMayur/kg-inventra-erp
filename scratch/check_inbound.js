const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('--- USERS IN DATABASE ---');
  users.forEach(u => {
    console.log(`ID: ${u.id}, Name: ${u.name}, Phone: ${u.phone}, Role: ${u.role}`);
  });

  const messages = await prisma.whatsAppMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  console.log('\n--- RECENT WHATSAPP MESSAGES ---');
  messages.forEach(m => {
    console.log(`[${m.id}] [${m.createdAt.toISOString()}] ${m.direction} ${m.status} (${m.phone}): "${m.message}"`);
  });
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
