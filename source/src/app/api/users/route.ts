import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { hashPassword } from '@/lib/auth-provider';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { userCreateSchema } from '@/lib/validation';
import { createAuditLog } from '@/lib/audit';

const USER_SELECT = {
  id: true,
  empId: true,
  name: true,
  department: true,
  floor: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin'], { rootOnly: true });
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const users = await db.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return NextResponse.json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin'], { rootOnly: true });
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const validated = userCreateSchema.parse(body);

    const existing = await db.user.findUnique({ where: { empId: validated.empId } });
    if (existing) throw new ApiError(409, 'Employee ID already exists', 'CONFLICT');

    const hashed = await hashPassword(validated.password);

    const user = await db.user.create({
      data: {
        empId: validated.empId,
        name: validated.name,
        department: validated.department,
        floor: validated.floor || '',
        role: validated.role,
        password: hashed,
        active: true,
      },
      select: USER_SELECT,
    });

    await createAuditLog({
      action: 'CREATE_USER',
      user: auth.user,
      targetId: user.id,
      targetName: user.name,
      metadata: { empId: user.empId, role: user.role, department: user.department },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
