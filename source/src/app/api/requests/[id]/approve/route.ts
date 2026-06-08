import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

      if (req.status !== 'Pending') {
        throw new ApiError(400, 'Only pending requests can be approved', 'BAD_REQUEST');
      }

      const item = await tx.item.findUnique({ where: { id: req.itemId } });
      if (!item || item.deletedAt) {
        throw new ApiError(404, 'Item not found', 'NOT_FOUND');
      }

      // The request quantity is already included in item.reservedQty from the POST /api/requests step.
      // We just need to ensure the item still exists and we haven't somehow over-reserved.
      if (item.stock < item.reservedQty) {
        throw new ApiError(
          409,
          `Insufficient total stock to cover all reservations. Stock: ${item.stock}, Total Reserved: ${item.reservedQty}`,
          'CONFLICT'
        );
      }

      return tx.request.update({ where: { id }, data: { status: 'Approved' } });
    });

    await createAuditLog({
      action: 'APPROVE_REQUEST',
      user: auth.user,
      targetId: id,
      targetName: result.itemName,
      metadata: { qty: result.qty, employee: result.employee },
    });

    await createNotification({
      userId: result.userId,
      title: 'Request Approved',
      message: `Your request for ${result.qty} ${result.itemName} has been approved. You can collect it from the store.`,
      type: 'success',
      link: 'requests'
    });

    return NextResponse.json({ request: result });
  } catch (error) {
    return handleApiError(error);
  }
}
