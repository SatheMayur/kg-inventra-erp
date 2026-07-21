import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { mutateStock } from '@/lib/stock';
import { checkReorder } from '@/lib/reorder';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!['admin', 'STORE_ADMIN', 'STORE_OPERATOR'].includes(auth.user!.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
        // Shared helper: validates existence + sufficient stock, decrements,
        // bumps version and writes the OUT ledger row (was duplicated inline).
        await mutateStock(tx, {
          itemId: ti.itemId,
          delta: -Math.round(ti.qty),
          reference: `Transfer ${transfer.memoNumber} → ${transfer.toLocation}`,
          userId: auth.user?.id,
          subType: 'TRANSFER_OUT',
        });
        await checkReorder(tx, ti.itemId);
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
