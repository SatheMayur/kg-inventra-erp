const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { mutateStock } = require('../src/lib/stock.ts');
const { threeWayMatch } = require('../src/lib/three-way-match.ts');

async function testReceive() {
  const poNumber = 'PO-AUTO-20260621-01-789a';
  console.log('--- Starting Goods Receipt Match Test ---');

  // Set PO to SENT first
  await prisma.purchaseOrder.update({ where: { poNumber }, data: { status: 'SENT' } });

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNumber },
    include: { items: true }
  });
  const poId = po.id;
  console.log(`Original PO Status: ${po.status}`);

  const result = await prisma.$transaction(async (tx) => {
    // Check if there is a posted invoice for this PO
    const invoice = await tx.purchaseInvoice.findFirst({
      where: { purchaseOrderId: poId, status: { not: 'CANCELLED' } },
    });

    let nextStatus = 'RECEIVED';
    let finalizeStock = true;
    let notes = po.notes;

    if (invoice) {
      const orderedQty = po.items.reduce((sum, item) => sum + item.qty, 0);
      const receivedQty = orderedQty;
      const orderedAmount = po.totalAmount;
      const invoicedAmount = invoice.amount;

      const match = threeWayMatch({
        orderedQty,
        receivedQty,
        orderedAmount,
        invoicedAmount,
      });

      if (!match.matched) {
        nextStatus = 'NEEDS_REVIEW';
        finalizeStock = false;
        notes = `3-Way Match Mismatch: ${match.discrepancies.join(', ')}`;
      }
    } else {
      nextStatus = 'RECEIVED_PENDING_INVOICE';
      finalizeStock = false;
      notes = 'Received goods; pending vendor invoice upload for 3-way match verification.';
    }

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: nextStatus,
        notes,
        receivedAt: nextStatus === 'RECEIVED' ? new Date() : undefined,
      },
    });

    for (const poItem of po.items) {
      let beforeItem = await tx.item.findUnique({ where: { id: poItem.itemId } });

      if (finalizeStock) {
        const { before } = await mutateStock(tx, {
          itemId: poItem.itemId,
          delta: poItem.qty,
          reference: `GRN for ${po.poNumber}`,
          userId: 'cmpc9b140000ndqxgv1dhkcxp',
          subType: 'PURCHASE',
        });
        beforeItem = before;
      }

      await tx.pOItem.update({
        where: { id: poItem.id },
        data: { receivedQty: poItem.qty },
      });
    }

    return tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { supplier: true, items: true }
    });
  });

  console.log(`Received PO Status: ${result.status}`);
  console.log(`PO Notes: "${result.notes}"`);
  
  // Verify physical stock was NOT updated (since no invoice was present)
  const item = await prisma.item.findUnique({ where: { id: result.items[0].itemId } });
  console.log(`Physical Stock: ${item.stock} (expected: 120, because match was pending invoice!)`);

  // Now, let's simulate uploading the invoice!
  console.log('\n--- Simulating Invoice Intake ---');
  const invoiceNumber = 'INV-999';
  
  // Clean up old invoice if exists
  await prisma.purchaseInvoice.deleteMany({ where: { invoiceNumber } });
  await prisma.invoiceIntake.deleteMany({ where: { invoiceNumber } });

  // We will auto-post this invoice. The amount is 0 (since Blue Gel Pen price is 0).
  const calculatedSubtotal = 0; 
  
  const intakeResult = await prisma.$transaction(async (tx) => {
    const freshPo = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });

    const inv = await tx.purchaseInvoice.create({
      data: {
        invoiceNumber,
        purchaseOrderId: poId,
        amount: calculatedSubtotal,
        status: 'UNPAID',
      },
    });

    if (freshPo.status === 'RECEIVED_PENDING_INVOICE' || freshPo.status === 'NEEDS_REVIEW') {
      const orderedQty = freshPo.items.reduce((sum, item) => sum + item.qty, 0);
      const receivedQty = orderedQty;
      const orderedAmount = freshPo.totalAmount;
      const invoicedAmount = inv.amount;

      const match = threeWayMatch({
        orderedQty,
        receivedQty,
        orderedAmount,
        invoicedAmount,
      });

      if (match.matched) {
        // Finalize stock!
        for (const poItem of freshPo.items) {
          await mutateStock(tx, {
            itemId: poItem.itemId,
            delta: poItem.qty,
            reference: `GRN for ${freshPo.poNumber} (3-Way Match Verified)`,
            userId: 'cmpc9b140000ndqxgv1dhkcxp',
            subType: 'PURCHASE',
          });
        }
        await tx.purchaseOrder.update({
          where: { id: freshPo.id },
          data: {
            status: 'RECEIVED',
            receivedAt: new Date(),
            notes: `3-Way Match Succeeded. Verified on ${new Date().toLocaleDateString('en-US')}`,
          },
        });
      } else {
        await tx.purchaseOrder.update({
          where: { id: freshPo.id },
          data: {
            status: 'NEEDS_REVIEW',
            notes: `3-Way Match Mismatch: ${match.discrepancies.join(', ')}`,
          },
        });
      }
    }

    return tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true }
    });
  });

  console.log(`After Invoice posted, PO Status: ${intakeResult.status}`);
  console.log(`PO Notes: "${intakeResult.notes}"`);
  
  // Verify physical stock was updated (since match succeeded)
  const finalizedItem = await prisma.item.findUnique({ where: { id: intakeResult.items[0].itemId } });
  console.log(`Final Physical Stock: ${finalizedItem.stock} (expected: 150, because 120 + 30 received)`);
}

testReceive()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
