import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { getKolkataDateString } from '@/lib/date-utils';

const gatePassCreateSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  requestId: z.string().min(1).nullable().optional(),
  receiverName: z.string().min(1).max(200),
  vehicleNumber: z.string().max(50).nullable().optional(),
  purpose: z.string().min(1).max(300),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const isStoreUser = auth.user?.role === 'admin' || auth.user?.role === 'STORE_ADMIN' || auth.user?.role === 'STORE_OPERATOR';
    if (!isStoreUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const gatePasses = await db.gatePass.findMany({
      include: { request: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json(gatePasses);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const isStoreUser = auth.user?.role === 'admin' || auth.user?.role === 'STORE_ADMIN' || auth.user?.role === 'STORE_OPERATOR';
    if (!isStoreUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const data = gatePassCreateSchema.parse(await request.json());

    if (data.requestId) {
      const linkedRequest = await db.request.findUnique({ where: { id: data.requestId } });
      if (!linkedRequest) throw new ApiError(404, 'Linked request not found', 'NOT_FOUND');
    }

    // Generate sequential pass number GP-YYYYMMDD-NNN
    const date = getKolkataDateString().replace(/-/g, '');
    const count = await db.gatePass.count({
      where: { passNumber: { startsWith: `GP-${date}` } },
    });
    const passNumber = `GP-${date}-${(count + 1).toString().padStart(3, '0')}`;

    const pass = await db.gatePass.create({
      data: {
        passNumber,
        type: data.type,
        requestId: data.requestId ?? null,
        receiverName: data.receiverName,
        vehicleNumber: data.vehicleNumber ?? null,
        purpose: data.purpose,
        status: 'ISSUED',
      },
    });

    return NextResponse.json(pass, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const isStoreUser = auth.user?.role === 'admin' || auth.user?.role === 'STORE_ADMIN' || auth.user?.role === 'STORE_OPERATOR';
    if (!isStoreUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const VALID_STATUSES = ['DRAFT', 'ISSUED', 'COMPLETED', 'CANCELLED'];
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    const existing = await db.gatePass.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Gate pass not found', 'NOT_FOUND');

    // Prevent invalid status transitions
    if (existing.status === 'CANCELLED') {
      throw new ApiError(400, 'Cancelled gate passes cannot be modified', 'BAD_REQUEST');
    }
    if (existing.status === 'COMPLETED' && status !== 'CANCELLED') {
      throw new ApiError(400, 'Completed gate passes can only be cancelled', 'BAD_REQUEST');
    }

    const pass = await db.gatePass.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json(pass);
  } catch (error) {
    return handleApiError(error);
  }
}
