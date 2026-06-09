import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';

const reconcileSchema = z.object({
  ppPoReference: z.string().min(1, 'Petpooja PO reference required').max(200),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;

    const transfer = await db.stockTransfer.findUnique({ where: { id } });
    if (!transfer) throw new ApiError(404, 'Transfer not found', 'NOT_FOUND');
    if (transfer.status === 'DRAFT') {
      throw new ApiError(400, 'Confirm the transfer before reconciling', 'BAD_REQUEST');
    }
    if (transfer.ppReconciled) {
      throw new ApiError(400, 'Transfer already reconciled', 'BAD_REQUEST');
    }

    const body = await request.json();
    const { ppPoReference } = reconcileSchema.parse(body);

    const updated = await db.stockTransfer.update({
      where: { id },
      data: {
        ppPoReference,
        ppReconciled: true,
        status: 'RECONCILED',
      },
      include: { items: true },
    });

    await createAuditLog({
      action: 'RECONCILE_TRANSFER',
      user: auth.user,
      targetId: transfer.id,
      targetName: transfer.memoNumber,
      metadata: { ppPoReference },
    });

    return NextResponse.json({ transfer: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
