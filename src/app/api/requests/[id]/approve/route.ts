import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { canApproveRequest } from '@/lib/approval';
import { flattenRequest, deriveFulfillmentStatus } from '@/lib/request-fulfillment';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request); // any authenticated user; dept-head/admin check below
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    const linePlan: Array<{ lineId: string; approvedQty?: number }> = Array.isArray(body.lines)
      ? body.lines
      : [];
    let partialApproval = false;

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id }, include: { lines: true } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

      if (req.status !== 'Pending' && req.status !== 'SUBMITTED' && req.status !== 'UNDER_REVIEW') {
        throw new ApiError(400, 'Only pending or submitted requests can be approved', 'BAD_REQUEST');
      }

      // Dept-head routing: admin approves anything; a dept head only their own dept.
      const approver = await tx.user.findUnique({ where: { id: auth.user!.id } });
      if (!approver) throw new ApiError(401, 'Unknown user', 'UNAUTHORIZED');
      if (!canApproveRequest(
        { id: approver.id, role: approver.role, department: approver.department, isDeptHead: approver.isDeptHead },
        req.department,
      )) {
        throw new ApiError(403, 'You can only approve requests for your department', 'FORBIDDEN');
      }

      // Approve every line at requested qty by default. When `body.lines` is supplied,
      // allow line-level partial approval and release any quantity not approved.
      let approvedLineCount = 0;
      for (const line of req.lines) {
        const plan = linePlan.find((entry) => entry.lineId === line.id);
        const approvedQty =
          plan?.approvedQty === undefined ? line.requestedQty : Math.max(0, Math.min(plan.approvedQty, line.requestedQty));
        if (plan && approvedQty !== line.requestedQty) partialApproval = true;

        if (approvedQty <= 0) {
          await tx.requestLine.update({
            where: { id: line.id },
            data: { approvedQty: 0, status: 'Rejected', fulfillmentStatus: 'CANCELLED', availableQty: 0 },
          });
          if ((line.availableQty || 0) > 0) {
            await tx.item.update({
              where: { id: line.itemId },
              data: { reservedQty: { decrement: line.availableQty || 0 }, version: { increment: 1 } },
            });
          }
          continue;
        }

        approvedLineCount += 1;

        const available = line.availableQty || 0;
        const newAvailableQty = Math.min(available, approvedQty);
        const newPendingPurchaseQty = approvedQty - newAvailableQty;
        const releaseQty = available - newAvailableQty; // = max(0, available - approvedQty)

        await tx.requestLine.update({
          where: { id: line.id },
          data: {
            approvedQty,
            status: 'APPROVED',
            availableQty: newAvailableQty,
            pendingPurchaseQty: newPendingPurchaseQty,
            fulfillmentStatus: deriveFulfillmentStatus(
              {
                requestedQty: line.requestedQty,
                approvedQty,
                issuedQty: line.issuedQty,
                availableQty: newAvailableQty,
                pendingPurchaseQty: newPendingPurchaseQty,
                status: 'APPROVED',
              },
              false,
            ),
          },
        });

        if (releaseQty > 0) {
          await tx.item.update({
            where: { id: line.itemId },
            data: { reservedQty: { decrement: releaseQty }, version: { increment: 1 } },
          });
        }
      }

      if (approvedLineCount === 0) {
        throw new ApiError(400, 'At least one line must be approved', 'BAD_REQUEST');
      }

      return tx.request.update({ where: { id }, data: { status: 'APPROVED' }, include: { lines: true } });
    });

    const flat = flattenRequest(result);

    await createAuditLog({
      action: partialApproval
        ? 'APPROVE_REQUEST_PARTIAL'
        : 'APPROVE_REQUEST',
      user: auth.user,
      targetId: id,
      targetName: flat.itemName,
      metadata: { employee: result.employee, lines: result.lines.length, comment: comment || undefined },
    });

    await createNotification({
      userId: result.userId,
      title: partialApproval ? 'Request Partially Approved' : 'Request Approved',
      message: partialApproval
        ? `Your request (${flat.itemName}) has been partially approved. Check the approved quantities in the request details.`
        : `Your request (${flat.itemName}) has been approved. You can collect it from the store.`,
      type: 'success',
      link: 'requests',
    });

    return NextResponse.json({ request: flat });
  } catch (error) {
    return handleApiError(error);
  }
}
