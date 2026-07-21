import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin', 'STORE_ADMIN']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

      // Prevent deactivating a user who has open requests
      if (user.active) {
        const openRequest = await tx.request.findFirst({
          where: { userId: id, status: { in: ['Pending', 'Approved'] } },
        });
        if (openRequest) {
          throw new ApiError(409, 'Cannot deactivate user with open requests', 'CONFLICT');
        }
      }

      return tx.user.update({
        where: { id },
        data: { active: !user.active },
        select: { id: true, empId: true, name: true, role: true, department: true, floor: true, active: true },
      });
    });

    return NextResponse.json({ user: result });
  } catch (error) {
    return handleApiError(error);
  }
}
