import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const USER_SELECT = {
  id: true,
  empId: true,
  name: true,
  role: true,
  department: true,
  floor: true,
  active: true,
  isDeptHead: true,
} as const;

const userUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  department: z.string().min(1, 'Department is required').max(100).optional(),
  floor: z.string().max(50).optional(),
  role: z.enum([
    'admin', 'employee', 'STORE_ADMIN', 'STORE_OPERATOR', 
    'DEPT_USER', 'DEPT_HEAD', 'PURCHASE_USER', 'ACCOUNTS_USER', 'MANAGEMENT'
  ]).optional(),
  isDeptHead: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin', 'STORE_ADMIN']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const validated = userUpdateSchema.parse(body);

    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

    const updateData: Prisma.UserUpdateInput = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.department !== undefined) updateData.department = validated.department;
    if (validated.floor !== undefined) updateData.floor = validated.floor;
    if (validated.role !== undefined) updateData.role = validated.role;
    if (validated.isDeptHead !== undefined) updateData.isDeptHead = validated.isDeptHead;

    const updatedUser = await db.user.update({ where: { id }, data: updateData, select: USER_SELECT });

    // Propagate name/department changes to denormalised request fields
    if (validated.name !== undefined || validated.department !== undefined) {
      await db.request.updateMany({
        where: { userId: id, status: { in: ['Pending', 'Approved'] } },
        data: {
          ...(validated.name !== undefined ? { employee: validated.name } : {}),
          ...(validated.department !== undefined ? { department: validated.department } : {}),
        },
      });
    }

    await createAuditLog({
      action: 'UPDATE_USER',
      user: auth.user,
      targetId: id,
      targetName: updatedUser.name,
      metadata: { name: validated.name, department: validated.department, floor: validated.floor, role: validated.role },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    return handleApiError(error);
  }
}
