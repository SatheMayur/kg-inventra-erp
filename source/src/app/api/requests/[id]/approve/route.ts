import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { canApproveRequest } from '@/lib/approval';
import { flattenRequest, deriveFulfillmentStatus } from '@/lib/request-fulfillment';
import { SR_STATUS, APPROVABLE_STATUSES, LINE_STATUS } from '@/lib/sr-status';
import { approveStep, startApproval } from '@/lib/approvals/engine';

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
    const linePlan: Array<{ lineId: string; approvedQty?: number }> = Array.isArray(body.lines)
      ? body.lines
      : [];
    let partialApproval = false;

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id }, include: { lines: true } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

      if (!APPROVABLE_STATUSES.includes(req.status)) {
        throw new ApiError(400, 'Only pending or submitted requests can be approved', 'BAD_REQUEST');
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

      if (instance.status === 'APPROVED') {
        throw new ApiError(400, 'Requisition is already approved', 'BAD_REQUEST');
      }

      // Check current step's role and enforce department check if it's DEPT_HEAD
      const currentStep = instance.steps.find((s) => s.sequence === instance.currentStep);
      if (currentStep?.approverRole === 'DEPT_HEAD') {
        if (!canApproveRequest(
          { id: approver.id, role: approver.role, department: approver.department, isDeptHead: approver.isDeptHead },
          req.department,
        )) {
          throw new ApiError(403, 'You can only approve requests for your department', 'FORBIDDEN');
        }
      }

      // Advance step inside the engine
      const { instance: updatedInstance, step } = await approveStep(tx, {
        instanceId: instance.id,
        user: { id: approver.id, role: approver.role, isDeptHead: approver.isDeptHead },
        remarks: comment,
      });

      // Calculate total amount for approval log
      let approvalAmount = 0;
      for (const line of req.lines) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (item) {
          approvalAmount += (item.price ?? 0) * line.requestedQty;
        }
      }

      // Record approval history
      await tx.approvalLog.create({
        data: {
          reqId: id,
          userId: approver.id,
          userName: approver.name,
          role: approver.role,
          action: 'APPROVE',
          remarks: comment || null,
          amount: approvalAmount,
        },
      });

      // If the workflow is now fully APPROVED, update request status and apply line plans
      if (updatedInstance.status === 'APPROVED') {
        let approvedLineCount = 0;
        for (const line of req.lines) {
          const plan = linePlan.find((entry) => entry.lineId === line.id);
          const approvedQty =
            plan?.approvedQty === undefined ? line.requestedQty : Math.max(0, Math.min(plan.approvedQty, line.requestedQty));
          if (plan && approvedQty !== line.requestedQty) partialApproval = true;

          if (approvedQty <= 0) {
            await tx.requestLine.update({
              where: { id: line.id },
              data: { approvedQty: 0, status: LINE_STATUS.REJECTED, fulfillmentStatus: 'CANCELLED', availableQty: 0 },
            });
            if ((line.availableQty || 0) > 0) {
              await tx.item.update({
                where: { id: line.itemId },
                data: { reservedQty: { decrement: line.availableQty || 0 }, version: { increment: 1 } },
              });
            }
            await tx.item.updateMany({
              where: { id: line.itemId, active: false, sourceChannel: 'REQUISITION', stock: 0 },
              data: { deletedAt: new Date() },
            });
            continue;
          }

          approvedLineCount += 1;

          const available = line.availableQty || 0;
          const newAvailableQty = Math.min(available, approvedQty);
          const newPendingPurchaseQty = approvedQty - newAvailableQty;
          const releaseQty = available - newAvailableQty;

          await tx.requestLine.update({
            where: { id: line.id },
            data: {
              approvedQty,
              status: LINE_STATUS.APPROVED,
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

          await tx.item.updateMany({
            where: { id: line.itemId, active: false, sourceChannel: 'REQUISITION' },
            data: { active: true },
          });
        }

        if (approvedLineCount === 0) {
          throw new ApiError(400, 'At least one line must be approved', 'BAD_REQUEST');
        }

        return tx.request.update({
          where: { id },
          data: { status: SR_STATUS.APPROVED },
          include: { lines: true },
        });
      }

      // Requisition is still in-progress of a multi-step approval
      return req;
    });

    const flat = flattenRequest(result);

    // Write audit log and send notifications if final approval is met, or log step approval
    if (result.status === SR_STATUS.APPROVED) {
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
    } else {
      // Step approval audit log
      await createAuditLog({
        action: 'APPROVE_REQUEST', // Reuse existing action category for notifications/filters
        user: auth.user,
        targetId: id,
        targetName: flat.itemName,
        metadata: { stepApprover: auth.user!.name, comment: comment || undefined, stepStatus: 'PENDING_NEXT_STEP' },
      });
    }

    return NextResponse.json({ request: flat });
  } catch (error) {
    return handleApiError(error);
  }
}
