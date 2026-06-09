import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { mutateStock } from '@/lib/stock';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const updated = await db.$transaction(async (tx) => {
      const checkout = await tx.itemCheckout.findUnique({
        where: { id },
        include: { item: { select: { name: true } } },
      });

      if (!checkout) throw new ApiError(404, 'Checkout not found', 'NOT_FOUND');
      if (checkout.status === 'RETURNED') {
        throw new ApiError(400, 'Item already returned', 'BAD_REQUEST');
      }

      const u = await tx.itemCheckout.update({
        where: { id },
        data: {
          returnedAt: new Date(),
          status: 'RETURNED',
        },
        include: {
          item: { select: { name: true, unit: true } },
          user: { select: { name: true, empId: true } },
        },
      });

      // Return the units to on-hand stock — mirror of the checkout decrement.
      await mutateStock(tx, {
        itemId: checkout.itemId,
        delta: Math.round(checkout.qty),
        reference: `Return ${id}`,
        userId: auth.user?.id,
      });

      return u;
    });

    await createAuditLog({
      action: 'RETURN_ITEM',
      user: auth.user,
      targetId: id,
      targetName: updated.item.name,
      metadata: { qty: updated.qty, checkoutId: id },
    });

    return NextResponse.json({ checkout: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
