import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { requestCreateSchema } from '@/lib/validation';

const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'qty', 'status'] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const sortBy = searchParams.get('sortBy') || 'createdAt_desc';

    const where: Prisma.RequestWhereInput = {};

    // Employees can only see their own requests
    if (auth.user?.role === 'employee') {
      where.userId = auth.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (status) where.status = status;

    // Validate sort field to prevent arbitrary injection
    const [rawField, rawDir] = sortBy.split('_');
    const safeField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(rawField)
      ? rawField
      : 'createdAt';
    const safeDir = rawDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [safeField]: safeDir } as Prisma.RequestOrderByWithRelationInput;

    // No `include` — the user relation was fetched and immediately discarded before
    // Cap at 500 to prevent unbounded queries; clients can filter by status to narrow results
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '500')));
    const requests = await db.request.findMany({ where, orderBy, take: limit });

    return NextResponse.json({ requests });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    // Schema enforces integer qty >= 1 (prevents fractional reservations on Int stock)
    const { userId, itemId, qty } = requestCreateSchema.parse(body);
    const note: string | undefined = typeof body.note === 'string' ? body.note : undefined;

    // Employees can only create requests for themselves
    if (auth.user?.role === 'employee' && userId !== auth.user.id) {
      throw new ApiError(403, 'You can only create requests for yourself', 'FORBIDDEN');
    }

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

      const available = item.stock - item.reservedQty;
      if (available < qty) {
        throw new ApiError(409, `Insufficient stock. Available: ${available}`, 'CONFLICT');
      }

      const updatedItem = await tx.item.update({
        where: { id: itemId },
        data: { 
          reservedQty: { increment: qty },
          version: { increment: 1 } 
        },
      });

      const req = await tx.request.create({
        data: {
          userId,
          employee: user.name,
          department: user.department,
          itemId,
          itemName: item.name,
          qty,
          note: note?.trim() || null,
          status: 'Pending',
        },
      });

      return { request: req, item: updatedItem };
    });

    return NextResponse.json({ request: result.request }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
