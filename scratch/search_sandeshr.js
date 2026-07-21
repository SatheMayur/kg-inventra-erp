const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

async function checkDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`Database does not exist: ${dbPath}`);
    return;
  }
  console.log(`Checking database: ${dbPath}`);
  const prisma = new PrismaClient({
    datasources: {
      db: { url: `file:${dbPath}` }
    }
  });
  try {
    const user = await prisma.user.findFirst({
      where: { empId: 'sandeshr' }
    });
    if (user) {
      console.log(`FOUND sandeshr in database ${dbPath}:`, user);
    } else {
      console.log(`sandeshr NOT found in ${dbPath}`);
    }
  } catch (err) {
    console.error(`Error reading database ${dbPath}:`, err.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const dbs = [
    'd:\\Store_KG\\Store_KG\\source\\prisma\\dev.db',
    'd:\\Store_KG\\Store_KG\\source\\prisma\\test.db',
    'd:\\Store_KG\\Store_KG\\source\\prisma\\prisma\\dev.db'
  ];
  for (const db of dbs) {
    await checkDb(db);
  }
}

main().catch(console.error);
