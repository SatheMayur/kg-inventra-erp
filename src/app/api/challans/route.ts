import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const challans = await db.deliveryChallan.findMany({
      include: { purchaseOrder: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
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
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { challanNumber, purchaseOrderId, receivedBy, notes } = body;

    if (!challanNumber || !purchaseOrderId || !receivedBy) {
      return NextResponse.json({ error: 'challanNumber, purchaseOrderId, and receivedBy are required' }, { status: 400 });
    }

    const challan = await db.deliveryChallan.create({
      data: { challanNumber, purchaseOrderId, receivedBy, notes },
    });

    return NextResponse.json(challan, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
