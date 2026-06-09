import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Restock is an admin-only operation
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const { qty, reference, userId } = body;

    if (!qty || typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) {
      throw new ApiError(400, 'Quantity must be a positive number', 'BAD_REQUEST');
    }

    const result = await db.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

      const updated = await tx.item.update({
        where: { id },
        data: { stock: { increment: qty }, version: { increment: 1 } },
      });

      await tx.transaction.create({
        data: {
          type: 'IN',
          itemId: id,
          itemName: item.name,
          qty,
          reference: reference || 'Restock',
          userId: userId || null,
        },
      });

      return updated;
    });

    await createAuditLog({
      action: 'UPDATE_ITEM',
      user: auth.user,
      targetId: id,
      targetName: result.name,
      metadata: { type: 'RESTOCK', qty, reference: reference || 'Restock' },
    });

    return NextResponse.json({ item: result });
  } catch (error) {
    return handleApiError(error);
  }
}
