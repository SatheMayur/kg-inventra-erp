import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

const USER_SELECT = {
  id: true,
  empId: true,
  name: true,
  role: true,
  department: true,
  floor: true,
  active: true,
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const { name, department, floor, role } = body;

    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

    const updateData: Prisma.UserUpdateInput = {};
    if (name !== undefined) updateData.name = name;
    if (department !== undefined) updateData.department = department;
    if (floor !== undefined) updateData.floor = floor;
    if (role !== undefined) updateData.role = role;

    const updatedUser = await db.user.update({ where: { id }, data: updateData, select: USER_SELECT });

    // Propagate name/department changes to denormalised request fields
    if (name !== undefined || department !== undefined) {
      await db.request.updateMany({
        where: { userId: id, status: { in: ['Pending', 'Approved'] } },
        data: {
          ...(name !== undefined ? { employee: name } : {}),
          ...(department !== undefined ? { department } : {}),
        },
      });
    }

    await createAuditLog({
      action: 'UPDATE_USER',
      user: auth.user,
      targetId: id,
      targetName: updatedUser.name,
      metadata: { name, department, floor, role },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    return handleApiError(error);
  }
}
