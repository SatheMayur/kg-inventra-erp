const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:../prisma/dev.db'
    }
  }
});

async function main() {
  console.log('🧹 Starting WhatsApp message database cleanup...');
  
  // 1. Fetch all items and departments to build the keyword matcher
  const items = await prisma.item.findMany({
    where: { deletedAt: null },
    select: { name: true }
  });
  
  const depts = await prisma.department.findMany({
    select: { name: true }
  });

  const itemNames = items.map(i => i.name.toLowerCase().trim());
  const deptNames = depts.map(d => d.name.toLowerCase().trim());
  
  const storeKeywords = [
    'stock', 'avail', 'how many', 'kitna', 'quantity', 'qty',
    'approve', 'manjur', 'reject', 'cancel', 'deny',
    'need', 'request', 'issue', 'want', 'mange', 'joie',
    'req-', 'po-', 'grn-', 'inv-', 'invoice', 'challan', 'receipt'
  ];

  // 2. Fetch all inbound messages
  const inboundMessages = await prisma.whatsAppMessage.findMany({
    where: { direction: 'INBOUND' }
  });

  console.log(`Analyzing ${inboundMessages.length} inbound messages...`);

  let deletedCount = 0;

  for (const msg of inboundMessages) {
    const text = (msg.message || '').toLowerCase().trim();
    
    // Check if it matches any of the criteria
    let isStoreRelated = false;

    // Check action keywords
    if (storeKeywords.some(keyword => text.includes(keyword))) {
      isStoreRelated = true;
    }

    // Check item names
    if (!isStoreRelated && itemNames.some(name => text.includes(name))) {
      isStoreRelated = true;
    }

    // Check department names
    if (!isStoreRelated && deptNames.some(name => text.includes(name))) {
      isStoreRelated = true;
    }

    if (!isStoreRelated) {
      // Delete this unrelated message
      await prisma.whatsAppMessage.delete({
        where: { id: msg.id }
      });
      deletedCount++;
    }
  }

  console.log(`✅ Done! Deleted ${deletedCount} non-store-related messages from the database.`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
