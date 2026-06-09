import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { canApproveRequest } from '@/lib/approval';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');
      if (req.status !== 'Approved') {
        throw new ApiError(400, 'Only approved requests can be marked ready', 'BAD_REQUEST');
      }
      const u = await tx.user.findUnique({ where: { id: auth.user!.id } });
      if (!u || !canApproveRequest(
        { id: u.id, role: u.role, department: u.department, isDeptHead: u.isDeptHead },
        req.department,
      )) {
        throw new ApiError(403, 'Not authorized for this department', 'FORBIDDEN');
      }
      return tx.request.update({ where: { id }, data: { status: 'ReadyForPickup' } });
    });

    // Reuse existing audit vocabulary; metadata.step records the transition.
    await createAuditLog({
      action: 'ISSUE_REQUEST',
      user: auth.user,
      targetId: id,
      targetName: result.itemName,
      metadata: { step: 'ready_for_pickup', qty: result.qty },
    });

    return NextResponse.json({ request: result });
  } catch (error) {
    return handleApiError(error);
  }
}
