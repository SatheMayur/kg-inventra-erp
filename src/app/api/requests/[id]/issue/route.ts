import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { mutateStock, releaseReservation } from '@/lib/stock';
import { checkReorder } from '@/lib/reorder';
import {
  assertIssuable,
  assertReadyToIssue,
  deriveFulfillmentStatus,
  lineStatusAfterIssue,
  rollupRequestStatus,
  flattenRequest,
} from '@/lib/request-fulfillment';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin', 'STORE_ADMIN', 'STORE_OPERATOR']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { issuedBy } = body;

    if (!issuedBy) {
      throw new ApiError(400, 'issuedBy is required', 'BAD_REQUEST');
    }

    // Optional partial plan: [{ lineId, qty }]. When omitted, issue every line's
    // full unissued approved balance (the common "issue whole request" action).
    const requestedLines: Array<{ lineId: string; qty: number }> | undefined =
      Array.isArray(body.lines) ? body.lines : undefined;

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id }, include: { lines: true } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

      if (!['Approved', 'ReadyForPickup', 'PartiallyIssued'].includes(req.status)) {
        throw new ApiError(
          400,
          'Only approved, ready-for-pickup or partially-issued requests can be issued',
          'BAD_REQUEST'
        );
      }

      const plan =
        requestedLines && requestedLines.length > 0
          ? requestedLines
          : req.lines
              .filter((l) => l.status !== 'Rejected' && l.status !== 'Cancelled' && l.approvedQty - l.issuedQty > 0)
              .map((l) => ({ lineId: l.id, qty: l.approvedQty - l.issuedQty }));

      if (plan.length === 0) throw new ApiError(400, 'Nothing to issue', 'BAD_REQUEST');

      const openPo = await tx.purchaseOrder.findFirst({
        where: { linkedSrId: id, status: { notIn: ['CANCELLED', 'REJECTED', 'CLOSED'] } },
        select: { id: true },
      });
      const hasOpenPo = !!openPo;

      let lastItem = null as Awaited<ReturnType<typeof mutateStock>>['after'] | null;

      for (const p of plan) {
        const line = req.lines.find((l) => l.id === p.lineId);
        if (!line) throw new ApiError(404, `Request line not found: ${p.lineId}`, 'NOT_FOUND');

        try {
          assertIssuable(line.approvedQty, line.issuedQty, p.qty);
        } catch (e) {
          throw new ApiError(400, (e as Error).message, 'BAD_REQUEST');
        }

        try {
          assertReadyToIssue(line.availableQty || 0, line.issuedQty, p.qty);
        } catch (e) {
          throw new ApiError(400, (e as Error).message, 'BAD_REQUEST');
        }

        // mutateStock validates stock/existence, decrements, bumps version and
        // writes the ISSUE ledger row (single source of truth).
        const { after } = await mutateStock(tx, {
          itemId: line.itemId,
          delta: -p.qty,
          reference: `Request ${req.id}`,
          userId: req.userId,
          subType: 'ISSUE',
        });
        lastItem = after;

        const remainingReservation = Math.max(0, Math.min(line.approvedQty, line.availableQty || 0) - line.issuedQty);
        const reservationRelease = Math.min(p.qty, remainingReservation);
        if (reservationRelease > 0) {
          await releaseReservation(tx, line.itemId, reservationRelease);
        }

        const newIssued = line.issuedQty + p.qty;
        await tx.requestLine.update({
          where: { id: line.id },
          data: {
            issuedQty: newIssued,
            status: lineStatusAfterIssue(line.approvedQty, newIssued),
            fulfillmentStatus: deriveFulfillmentStatus({ ...line, issuedQty: newIssued }, hasOpenPo),
          },
        });

        // Auto-create a reorder PO if this issue dropped the item to its threshold.
        await checkReorder(tx, line.itemId);
      }

      const fresh = await tx.requestLine.findMany({ where: { requestId: id } });
      const headerStatus = rollupRequestStatus(fresh);

      const updated = await tx.request.update({
        where: { id },
        data: {
          status: headerStatus,
          issuedAt: headerStatus === 'Issued' ? new Date() : req.issuedAt,
          issuedBy: headerStatus === 'Issued' ? issuedBy : req.issuedBy,
        },
        include: { lines: true },
      });

      return { request: updated, item: lastItem };
    });

    const flat = flattenRequest(result.request);

    await createAuditLog({
      action: 'ISSUE_REQUEST',
      user: auth.user,
      targetId: id,
      targetName: flat.itemName,
      metadata: { status: result.request.status, employee: result.request.employee },
    });

    await createNotification({
      userId: result.request.userId,
      title: result.request.status === 'Issued' ? 'Items Issued' : 'Items Partially Issued',
      message: `Your request "${flat.itemName}" has been ${result.request.status === 'Issued' ? 'fully' : 'partially'} issued.`,
      type: 'info',
      link: 'requests',
    });

    return NextResponse.json({ request: flat, item: result.item });
  } catch (error) {
    return handleApiError(error);
  }
}
