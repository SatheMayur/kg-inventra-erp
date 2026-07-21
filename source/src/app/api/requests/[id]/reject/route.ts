import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { canApproveRequest } from '@/lib/approval';
import { releaseReservation } from '@/lib/stock';
import { flattenRequest } from '@/lib/request-fulfillment';
import { SR_STATUS, REJECTABLE_STATUSES, LINE_STATUS } from '@/lib/sr-status';
import { rejectStep, startApproval } from '@/lib/approvals/engine';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id }, include: { lines: true } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

      if (!REJECTABLE_STATUSES.includes(req.status)) {
        throw new ApiError(400, 'Only pending, submitted, or approved requests can be rejected', 'BAD_REQUEST');
      }

      const approver = await tx.user.findUnique({ where: { id: auth.user!.id } });
      if (!approver) throw new ApiError(401, 'Unknown user', 'UNAUTHORIZED');

      // Find or start approval workflow instance
      let instance = await tx.approvalInstance.findFirst({
        where: { moduleName: 'STORE_REQUISITION', documentId: id },
        orderBy: { createdAt: 'desc' },
        include: { steps: true },
      });

      if (!instance) {
        let totalAmount = 0;
        const flags: string[] = [];
        for (const line of req.lines) {
          const item = await tx.item.findUnique({ where: { id: line.itemId } });
          if (item) {
            totalAmount += (item.price ?? 0) * line.requestedQty;
            if (item.category && item.category.trim().toLowerCase().includes('asset')) {
              if (!flags.includes('isAsset')) flags.push('isAsset');
            }
          }
        }
        instance = await startApproval(tx, {
          moduleName: 'STORE_REQUISITION',
          documentType: 'STORE_REQUISITION',
          documentId: id,
          createdById: req.userId,
          ctx: { amount: totalAmount, flags },
        });
      }

      // Check current step's role and enforce department check if it's DEPT_HEAD
      const currentStep = instance.steps.find((s) => s.sequence === instance.currentStep);
      if (currentStep?.approverRole === 'DEPT_HEAD') {
        if (!canApproveRequest(
          { id: approver.id, role: approver.role, department: approver.department, isDeptHead: approver.isDeptHead },
          req.department,
        )) {
          throw new ApiError(403, 'You can only reject requests for your department', 'FORBIDDEN');
        }
      }

      // Reject step in the engine -> rejects entire instance
      await rejectStep(tx, {
        instanceId: instance.id,
        user: { id: approver.id, role: approver.role, isDeptHead: approver.isDeptHead },
        remarks: comment,
      });

      // Calculate total amount for approval log
      let rejectAmount = 0;
      for (const line of req.lines) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (item) {
          rejectAmount += (item.price ?? 0) * line.requestedQty;
        }
      }

      // Record rejection history
      await tx.approvalLog.create({
        data: {
          reqId: id,
          userId: approver.id,
          userName: approver.name,
          role: approver.role,
          action: 'REJECT',
          remarks: comment || null,
          amount: rejectAmount,
        },
      });

      // Release the still-held reservation per line (requested minus already issued).
      for (const line of req.lines) {
        const maxHeld = line.approvedQty > 0 ? Math.min(line.approvedQty, line.availableQty) : Math.min(line.requestedQty, line.availableQty);
        const held = Math.max(0, maxHeld - line.issuedQty);
        if (held > 0) await releaseReservation(tx, line.itemId, held);
        await tx.requestLine.update({ 
          where: { id: line.id }, 
          data: { status: LINE_STATUS.REJECTED, fulfillmentStatus: 'CANCELLED' } 
        });
      }

      return tx.request.update({ where: { id }, data: { status: SR_STATUS.REJECTED }, include: { lines: true } });
    });

    const flat = flattenRequest(result);

    await createAuditLog({
      action: 'REJECT_REQUEST',
      user: auth.user,
      targetId: id,
      targetName: flat.itemName,
      metadata: { employee: result.employee, comment: comment || undefined },
    });

    await createNotification({
      userId: result.userId,
      title: 'Request Rejected',
      message: `Your request (${flat.itemName}) has been rejected by the administrator.`,
      type: 'error',
      link: 'requests',
    });

    return NextResponse.json({ request: flat });
  } catch (error) {
    return handleApiError(error);
  }
}
