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

    const { id } = await params;

    const checkout = await db.itemCheckout.findUnique({
      where: { id },
      include: { item: { select: { name: true } } },
    });

    if (!checkout) throw new ApiError(404, 'Checkout not found', 'NOT_FOUND');
    if (checkout.status === 'RETURNED') {
      throw new ApiError(400, 'Item already returned', 'BAD_REQUEST');
    }

    const updated = await db.itemCheckout.update({
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

    await createAuditLog({
      action: 'RETURN_ITEM',
      user: auth.user,
      targetId: id,
      targetName: checkout.item.name,
      metadata: { qty: checkout.qty, checkoutId: id },
    });

    return NextResponse.json({ checkout: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
