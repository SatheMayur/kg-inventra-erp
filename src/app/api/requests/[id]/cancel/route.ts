import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { releaseReservation } from '@/lib/stock';
import { flattenRequest } from '@/lib/request-fulfillment';
import { SR_STATUS, CANCELLABLE_STATUSES, LINE_STATUS } from '@/lib/sr-status';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth required — employees can only cancel their own requests
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id }, include: { lines: true } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

      // Ownership check: employees can only cancel their own; admins can cancel any
      if (auth.user?.role !== 'admin' && auth.user?.role !== 'STORE_ADMIN' && req.userId !== auth.user?.id) {
        throw new ApiError(403, 'You can only cancel your own requests', 'FORBIDDEN');
      }

      // Guard against cancelling a request that already has a linked PO
      if (req.status === SR_STATUS.CONVERTED_TO_PO) {
        throw new ApiError(400, 'Cannot cancel — a Purchase Order has been created from this requisition', 'BAD_REQUEST');
      }

      if (!CANCELLABLE_STATUSES.includes(req.status)) {
        throw new ApiError(400, `Only draft, pending, or submitted requests can be cancelled (current status: ${req.status})`, 'BAD_REQUEST');
      }

      for (const line of req.lines) {
        const maxHeld = line.approvedQty > 0 ? Math.min(line.approvedQty, line.availableQty) : Math.min(line.requestedQty, line.availableQty);
        const held = Math.max(0, maxHeld - line.issuedQty);
        if (held > 0) await releaseReservation(tx, line.itemId, held);
        await tx.requestLine.update({ 
          where: { id: line.id }, 
          data: { status: LINE_STATUS.CANCELLED, fulfillmentStatus: 'CANCELLED' } 
        });
      }

      return tx.request.update({ where: { id }, data: { status: SR_STATUS.CANCELLED }, include: { lines: true } });
    });

    return NextResponse.json({ request: flattenRequest(result) });
  } catch (error) {
    return handleApiError(error);
  }
}
