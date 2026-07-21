import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { z } from 'zod';

const schema = z.object({ userId: z.string().min(1) });

// POST /api/assets/[id]/assign — assign an asset to an employee (admin).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const { userId } = schema.parse(await request.json());

    const result = await db.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id } });
      if (!asset) throw new ApiError(404, 'Asset not found', 'NOT_FOUND');
      if (asset.status === 'RETIRED') throw new ApiError(400, 'Retired assets cannot be assigned', 'BAD_REQUEST');

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

      return tx.asset.update({
        where: { id },
        data: { status: 'ASSIGNED', assignedToUserId: userId, assignedAt: new Date() },
      });
    });

    await createAuditLog({
      action: 'ASSIGN_ASSET' as AuditAction,
      user: auth.user,
      targetId: id,
      targetName: result.name,
      metadata: { assignedTo: userId },
    });

    return NextResponse.json({ asset: result });
  } catch (error) {
    return handleApiError(error);
  }
}
