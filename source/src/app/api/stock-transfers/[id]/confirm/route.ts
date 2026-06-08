import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;

    const transfer = await db.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!transfer) throw new ApiError(404, 'Transfer not found', 'NOT_FOUND');
    if (transfer.status !== 'DRAFT') {
      throw new ApiError(400, `Transfer is already ${transfer.status.toLowerCase()}`, 'BAD_REQUEST');
    }
    if (transfer.items.length === 0) {
      throw new ApiError(400, 'Transfer has no items', 'BAD_REQUEST');
    }

    // Commit transfer atomically — stock check inside tx to prevent TOCTOU
    const result = await db.$transaction(async (tx) => {
      for (const ti of transfer.items) {
        const qty = Math.round(ti.qty);

        const item = await tx.item.findUnique({ where: { id: ti.itemId } });
        if (!item) throw new ApiError(404, `Item "${ti.itemName}" not found`, 'NOT_FOUND');
        if (item.stock < qty) {
          throw new ApiError(
            400,
            `Insufficient stock for "${ti.itemName}": have ${item.stock} ${item.unit}, need ${qty}`,
            'INSUFFICIENT_STOCK'
          );
        }

        await tx.item.update({
          where: { id: ti.itemId },
          data: {
            stock: { decrement: qty },
            version: { increment: 1 },
          },
        });

        await tx.transaction.create({
          data: {
            type: 'OUT',
            itemId: ti.itemId,
            itemName: ti.itemName,
            qty,
            reference: `Transfer ${transfer.memoNumber} → ${transfer.toLocation}`,
            userId: auth.user?.id,
            date: new Date(),
          },
        });
      }

      return tx.stockTransfer.update({
        where: { id },
        data: { status: 'CONFIRMED' },
        include: { items: true },
      });
    });

    await createAuditLog({
      action: 'CONFIRM_TRANSFER',
      user: auth.user,
      targetId: transfer.id,
      targetName: transfer.memoNumber,
      metadata: { toLocation: transfer.toLocation, itemCount: transfer.items.length },
    });

    return NextResponse.json({ transfer: result });
  } catch (error) {
    return handleApiError(error);
  }
}
