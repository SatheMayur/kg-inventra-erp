import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { releaseReservation } from '@/lib/stock';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required — employees can only cancel their own requests
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) throw new ApiError(400, 'userId is required', 'BAD_REQUEST');

    // Employees can only cancel for themselves; admins can cancel any
    if (auth.user?.role === 'employee' && userId !== auth.user.id) {
      throw new ApiError(403, 'You can only cancel your own requests', 'FORBIDDEN');
    }

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

      // Ownership check inside transaction (covers admin path too)
      if (auth.user?.role !== 'admin' && req.userId !== auth.user?.id) {
        throw new ApiError(403, 'You can only cancel your own requests', 'FORBIDDEN');
      }

      if (req.status !== 'Pending') {
        throw new ApiError(400, 'Only pending requests can be cancelled', 'BAD_REQUEST');
      }

      // Release the stock reservation (atomic decrement — no lost update)
      await releaseReservation(tx, req.itemId, req.qty);

      return tx.request.update({ where: { id }, data: { status: 'Cancelled' } });
    });

    return NextResponse.json({ request: result });
  } catch (error) {
    return handleApiError(error);
  }
}
