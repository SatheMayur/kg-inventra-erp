import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog, AuditAction } from '@/lib/audit';

// POST /api/assets/[id]/return — return an assigned asset to stock (admin).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id } });
      if (!asset) throw new ApiError(404, 'Asset not found', 'NOT_FOUND');
      if (asset.status !== 'ASSIGNED') throw new ApiError(400, 'Only assigned assets can be returned', 'BAD_REQUEST');

      return tx.asset.update({
        where: { id },
        data: { status: 'IN_STOCK', assignedToUserId: null, assignedAt: null },
      });
    });

    await createAuditLog({
      action: 'RETURN_ASSET' as AuditAction,
      user: auth.user,
      targetId: id,
      targetName: result.name,
    });

    return NextResponse.json({ asset: result });
  } catch (error) {
    return handleApiError(error);
  }
}
