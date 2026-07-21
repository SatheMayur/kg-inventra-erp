import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { canApproveRequest } from '@/lib/approval';
import { flattenRequest } from '@/lib/request-fulfillment';
import { SR_STATUS } from '@/lib/sr-status';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id }, include: { lines: true } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');
      if (req.status !== SR_STATUS.APPROVED) {
        throw new ApiError(400, 'Only approved requests can be marked ready', 'BAD_REQUEST');
      }
      const u = await tx.user.findUnique({ where: { id: auth.user!.id } });
      if (!u || !canApproveRequest(
        { id: u.id, role: u.role, department: u.department, isDeptHead: u.isDeptHead },
        req.department,
      )) {
        throw new ApiError(403, 'Not authorized for this department', 'FORBIDDEN');
      }
      return tx.request.update({ where: { id }, data: { status: SR_STATUS.READY_FOR_PICKUP }, include: { lines: true } });
    });

    const flat = flattenRequest(result);

    await createAuditLog({
      action: 'READY_REQUEST',
      user: auth.user,
      targetId: id,
      targetName: flat.itemName,
      metadata: { step: 'ready_for_pickup' },
    });

    return NextResponse.json({ request: flat });
  } catch (error) {
    return handleApiError(error);
  }
}
