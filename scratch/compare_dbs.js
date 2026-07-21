const { PrismaClient } = require('@prisma/client');
const path = require('path');

async function checkDb(dbPath) {
  const absolutePath = path.resolve(dbPath);
  console.log(`\nChecking database at: ${absolutePath}`);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${absolutePath}`
      }
    }
  });
  try {
    const users = await prisma.user.findMany({ select: { empId: true, name: true } });
    console.log(`-> Total users: ${users.length}`);
    console.log(`-> Users: ${users.map(u => u.empId).join(', ')}`);
  } catch (err) {
    console.error(`-> Error: ${err.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await checkDb('prisma/dev.db');
  await checkDb('prisma/prisma/dev.db');
}

main().catch(console.error);
