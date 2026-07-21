import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { RECEIVABLE_STATUSES } from '@/lib/po-status';

const challanCreateSchema = z.object({
  challanNumber: z.string().min(1, 'Challan number is required').max(100),
  purchaseOrderId: z.string().min(1, 'Purchase order is required'),
  receivedBy: z.string().min(1, 'Received by is required').max(200),
  notes: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const isStoreUser = auth.user?.role === 'admin' || auth.user?.role === 'STORE_ADMIN' || auth.user?.role === 'STORE_OPERATOR';
    if (!isStoreUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '200')));
    const skip = (page - 1) * pageSize;

    const challans = await db.deliveryChallan.findMany({
      include: { purchaseOrder: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });
    return NextResponse.json(challans);
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

    const data = challanCreateSchema.parse(await request.json());

    // Validate PO exists
    const po = await db.purchaseOrder.findUnique({ where: { id: data.purchaseOrderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'NOT_FOUND');
    if (!RECEIVABLE_STATUSES.includes(po.status as any) && po.status !== 'FULLY_RECEIVED' && po.status !== 'INVOICE_PENDING' && po.status !== 'CLOSED') {
      throw new ApiError(400, `Cannot create challan for a PO in ${po.status} status`, 'BAD_REQUEST');
    }

    // Duplicate check
    const existing = await db.deliveryChallan.findUnique({ where: { challanNumber: data.challanNumber } });
    if (existing) throw new ApiError(409, 'Challan number already exists', 'CONFLICT');

    const challan = await db.deliveryChallan.create({
      data: {
        challanNumber: data.challanNumber,
        purchaseOrderId: data.purchaseOrderId,
        receivedBy: data.receivedBy,
        notes: data.notes,
      },
    });

    return NextResponse.json(challan, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
