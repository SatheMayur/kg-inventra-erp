const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

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
    const req = await prisma.request.findFirst({
      where: {
        OR: [
          { id: { contains: 'CMQW9JR9' } },
          { requestNumber: { contains: 'CMQW9JR9' } }
        ]
      }
    });
    if (req) {
      console.log(`FOUND request CMQW9JR9 in database ${dbPath}:`, req);
    } else {
      console.log(`Request CMQW9JR9 NOT found in ${dbPath}`);
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
