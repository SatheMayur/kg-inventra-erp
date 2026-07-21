import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { PO_STATUS, normalizePoStatus } from '@/lib/po-status';
import { approveStep, startApproval } from '@/lib/approvals/engine';
import {
  canFinalizePoWithoutWorkflow,
  resolvePoCreatorId,
  validatePoForApproval,
} from '@/lib/po-approval';

function poInclude() {
  return {
    supplier: true,
    items: { include: { item: true } },
    linkedSr: true,
  } as const;
}

// POST /api/purchase-orders/[id]/approve - approves the current step of a PO approval workflow.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let poIdentifier = 'unknown';
  let actor: { id?: string; empId?: string; role?: string } = {};

  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = auth.user;
    actor = { id: user.id, empId: user.empId, role: user.role };

    const { id } = await params;
    poIdentifier = id.trim();
    if (!poIdentifier) {
      throw new ApiError(400, 'Purchase Order identifier is required', 'BAD_REQUEST');
    }

    const body = await request.json().catch(() => ({}));
    const remarks = typeof body.remarks === 'string' && body.remarks.trim()
      ? body.remarks.trim()
      : 'Approved';

    const result = await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: {
          OR: [{ id: poIdentifier }, { poNumber: poIdentifier }],
        },
        include: poInclude(),
      });

      if (!po) throw new ApiError(404, 'Purchase Order not found', 'NOT_FOUND');

      if (normalizePoStatus(po.status) === PO_STATUS.APPROVED) {
        return { po, changed: false };
      }

      validatePoForApproval(po);

      let instance = await tx.approvalInstance.findFirst({
        where: { moduleName: 'PURCHASE_ORDER', documentId: po.id },
        orderBy: { createdAt: 'desc' },
        include: { steps: true },
      });

      if (!instance) {
        const creatorId = await resolvePoCreatorId(tx, po, user.id);
        instance = await startApproval(tx, {
          moduleName: 'PURCHASE_ORDER',
          documentType: 'PURCHASE_ORDER',
          documentId: po.id,
          createdById: creatorId,
          ctx: { amount: po.totalAmount },
        });
      }

      if (instance.status === 'APPROVED') {
        if (!canFinalizePoWithoutWorkflow(user.role)) {
          throw new ApiError(403, 'You do not have permission to approve this Purchase Order', 'FORBIDDEN');
        }

        await tx.approvalLog.create({
          data: {
            poId: po.id,
            userId: user.id,
            userName: user.name,
            role: user.role,
            action: 'APPROVE',
            remarks,
            amount: po.totalAmount,
          },
        });

        const approvedPo = await tx.purchaseOrder.update({
          where: { id: po.id },
          data: {
            status: PO_STATUS.APPROVED,
            approvedBy: user.id,
            approvedAt: new Date(),
          },
          include: poInclude(),
        });

        return { po: approvedPo, changed: true };
      }

      if (instance.status !== 'PENDING_APPROVAL') {
        throw new ApiError(400, 'This Purchase Order is no longer pending approval', 'BAD_REQUEST');
      }

      const { instance: updatedInstance } = await approveStep(tx, {
        instanceId: instance.id,
        user: {
          id: user.id,
          role: user.role,
          isDeptHead: user.isDeptHead,
        },
        remarks,
      });

      await tx.approvalLog.create({
        data: {
          poId: po.id,
          userId: user.id,
          userName: user.name,
          role: user.role,
          action: 'APPROVE',
          remarks,
          amount: po.totalAmount,
        },
      });

      if (updatedInstance.status !== 'APPROVED') {
        if (normalizePoStatus(po.status) !== PO_STATUS.PENDING_APPROVAL) {
          const pendingPo = await tx.purchaseOrder.update({
            where: { id: po.id },
            data: { status: PO_STATUS.PENDING_APPROVAL },
            include: poInclude(),
          });
          return { po: pendingPo, changed: true };
        }
        return { po, changed: true };
      }

      const updatedPo = await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: PO_STATUS.APPROVED,
          approvedBy: user.id,
          approvedAt: new Date(),
        },
        include: poInclude(),
      });

      if (updatedPo.supplier?.phone) {
        try {
          const cleanSupplierPhone = updatedPo.supplier.phone.replace(/\D/g, '');
          if (cleanSupplierPhone) {
            await tx.whatsAppMessage.create({
              data: {
                phone: `${cleanSupplierPhone}@s.whatsapp.net`,
                message: `Attached is Purchase Order ${updatedPo.poNumber} from KG Store.\nTotal Amount: Rs. ${updatedPo.totalAmount}\nItems:\n${updatedPo.items.map((item) => `- ${item.item.name}: ${item.qty} ${item.item.unit}`).join('\n')}`,
                direction: 'OUTBOUND',
                status: 'PENDING',
              },
            });
          }
        } catch (msgErr) {
          console.error('[PO_APPROVAL_NOTIFICATION_ERROR]', {
            poId: updatedPo.id,
            poNumber: updatedPo.poNumber,
            error: msgErr,
          });
        }
      }

      return { po: updatedPo, changed: true };
    });

    if (result.changed) {
      await createAuditLog({
        action: 'APPROVE_PO' as AuditAction,
        user,
        targetId: result.po.id,
        targetName: result.po.poNumber,
        metadata: {
          totalAmount: result.po.totalAmount,
          status: result.po.status,
          stepStatus: result.po.status === PO_STATUS.APPROVED ? 'APPROVED' : 'PENDING_NEXT_STEP',
        },
      });
    }

    return NextResponse.json({ po: result.po });
  } catch (error) {
    if (error instanceof ApiError) {
      console.warn('[PO_APPROVAL_REJECTED]', {
        poIdentifier,
        actor,
        status: error.status,
        code: error.code,
        message: error.message,
      });
      return handleApiError(error);
    }

    const reference = `POAPP-${Date.now().toString(36).toUpperCase()}`;
    console.error('[PO_APPROVAL_ERROR]', {
      reference,
      poIdentifier,
      actor,
      error,
    });

    return NextResponse.json(
      {
        error: `Approval failed due to a server error. Reference: ${reference}`,
        code: 'INTERNAL_SERVER_ERROR',
        reference,
      },
      { status: 500 },
    );
  }
}
