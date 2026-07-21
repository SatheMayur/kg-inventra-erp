import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { hashPassword } from '@/lib/auth-provider';
import { ApiError, handleApiError } from '@/lib/api-utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin', 'STORE_ADMIN'], { rootOnly: true });
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters', 'BAD_REQUEST');
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

    const hashed = await hashPassword(password);

    const updatedUser = await db.user.update({
      where: { id },
      data: { password: hashed },
      select: { id: true, empId: true, name: true, role: true, department: true, active: true },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    return handleApiError(error);
  }
}
