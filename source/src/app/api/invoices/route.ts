import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const invoices = await db.purchaseInvoice.findMany({
      include: { purchaseOrder: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json(invoices);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { invoiceNumber, purchaseOrderId, amount, status, notes } = body;

    const invoice = await db.purchaseInvoice.create({
      data: {
        invoiceNumber,
        purchaseOrderId,
        amount,
        status: status || 'UNPAID',
        notes,
      },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { id, status, notes } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const existing = await db.purchaseInvoice.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const invoice = await db.purchaseInvoice.update({
      where: { id },
      data: {
        status,
        notes,
      },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError(error);
  }
}
