import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { mutateStock } from '@/lib/stock';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { id: poId } = await params;

    const result = await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: poId },
        include: { items: true },
      });
      if (!po) throw new ApiError(404, 'Purchase Order not found', 'NOT_FOUND');

      // Atomically claim the PO. If a concurrent request already received it,
      // count === 0 and we abort — this prevents double stock increments from
      // two parallel receive calls (the status read was previously outside the tx).
      const claim = await tx.purchaseOrder.updateMany({
        where: { id: poId, status: { not: 'RECEIVED' } },
        data: { status: 'RECEIVED' },
      });
      if (claim.count === 0) throw new ApiError(409, 'PO already received', 'CONFLICT');

      await tx.purchaseOrder.update({ where: { id: poId }, data: { receivedAt: new Date() } });

      for (const poItem of po.items) {
        // mutateStock throws if a PO line's item was deleted — aborting the whole
        // receive rather than silently skipping the line and losing that stock.
        const { before } = await mutateStock(tx, {
          itemId: poItem.itemId,
          delta: poItem.qty,
          reference: `GRN for ${po.poNumber}`,
          userId: auth.user?.id,
        });

        if (poItem.unitPrice > 0) {
          await tx.item.update({
            where: { id: poItem.itemId },
            data: { price: poItem.unitPrice },
          });
        }

        await tx.pOItem.update({ where: { id: poItem.id }, data: { receivedQty: poItem.qty } });

        await tx.auditLog.create({
          data: {
            action: 'GRN_RECEIVED',
            userId: auth.user?.id,
            userName: auth.user?.name,
            targetId: poItem.itemId,
            targetName: before.name,
            metadata: JSON.stringify({ poNumber: po.poNumber, qty: poItem.qty }),
            ip: request.headers.get('x-forwarded-for') || '127.0.0.1',
          },
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id: poId },
        include: { supplier: true },
      });
    });

    return NextResponse.json({ po: result });
  } catch (error) {
    return handleApiError(error);
  }
}
