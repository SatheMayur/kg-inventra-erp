import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog, AuditAction } from '@/lib/audit';

// POST /api/purchase-orders/[id]/approve — admin approves a PENDING_APPROVAL PO,
// moving it to SENT and recording who/when.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;

    const updated = await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!po) throw new ApiError(404, 'Purchase order not found', 'NOT_FOUND');
      if (po.status !== 'PENDING_APPROVAL') {
        throw new ApiError(400, 'Only POs pending approval can be approved', 'BAD_REQUEST');
      }
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: 'SENT', approvedBy: auth.user!.id, approvedAt: new Date() },
        include: { supplier: true, items: { include: { item: true } } },
      });
    });

    await createAuditLog({
      action: 'APPROVE_PO' as AuditAction,
      user: auth.user,
      targetId: id,
      targetName: updated.poNumber,
      metadata: { totalAmount: updated.totalAmount },
    });

    return NextResponse.json({ po: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
