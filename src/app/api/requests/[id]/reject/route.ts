import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { releaseReservation } from '@/lib/stock';

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

      if (req.status !== 'Pending' && req.status !== 'Approved') {
        throw new ApiError(
          400,
          'Only pending or approved requests can be rejected',
          'BAD_REQUEST'
        );
      }

      // Release the stock reservation (atomic decrement — no lost update)
      await releaseReservation(tx, req.itemId, req.qty);

      return tx.request.update({ where: { id }, data: { status: 'Rejected' } });
    });

    await createAuditLog({
      action: 'REJECT_REQUEST',
      user: auth.user,
      targetId: id,
      targetName: result.itemName,
      metadata: { qty: result.qty, employee: result.employee },
    });

    await createNotification({
      userId: result.userId,
      title: 'Request Rejected',
      message: `Your request for ${result.qty} ${result.itemName} has been rejected by the administrator.`,
      type: 'error',
      link: 'requests'
    });

    return NextResponse.json({ request: result });
  } catch (error) {
    return handleApiError(error);
  }
}
