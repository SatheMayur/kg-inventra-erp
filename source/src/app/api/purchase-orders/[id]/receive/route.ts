import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { id: poId } = await params;
    const po = await db.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });

    if (!po) return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
    if (po.status === 'RECEIVED') return NextResponse.json({ error: 'PO already received' }, { status: 400 });

    // Transaction to update stock and PO status
    const result = await db.$transaction(async (tx) => {
      // 1. Update status
      const updatedPo = await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: 'RECEIVED' },
        include: { supplier: true }
      });

      // 2. For each item in PO, update stock and create transaction
      for (const poItem of po.items) {
        const item = await tx.item.findUnique({ where: { id: poItem.itemId } });
        if (!item) continue;

        await tx.item.update({
          where: { id: poItem.itemId },
          data: { 
            stock: { increment: poItem.qty },
            ...(poItem.unitPrice > 0 && { price: poItem.unitPrice }),
            version: { increment: 1 }
          }
        });

        await tx.transaction.create({
          data: {
            type: 'IN',
            itemId: poItem.itemId,
            itemName: item.name,
            qty: poItem.qty,
            reference: `GRN for ${po.poNumber}`,
            userId: auth.user?.id,
            date: new Date(),
          }
        });
        
        // Log in AuditLog
        await tx.auditLog.create({
          data: {
            action: 'GRN_RECEIVED',
            userId: auth.user?.id,
            userName: auth.user?.name,
            targetId: poItem.itemId,
            targetName: item.name,
            metadata: JSON.stringify({ poNumber: po.poNumber, qty: poItem.qty }),
            ip: request.headers.get('x-forwarded-for') || '127.0.0.1',
          }
        });
      }

      return updatedPo;
    });

    return NextResponse.json({ po: result });
  } catch (error) {
    return handleApiError(error);
  }
}
