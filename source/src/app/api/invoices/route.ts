import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';

const invoiceCreateSchema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  purchaseOrderId: z.string().min(1),
  amount: z.number().nonnegative(),
  status: z.enum(['UNPAID', 'PAID', 'CANCELLED']).optional(),
  notes: z.string().max(500).optional(),
});

const invoicePatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['UNPAID', 'PAID', 'CANCELLED']).optional(),
  notes: z.string().max(500).nullable().optional(),
});

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
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const data = invoiceCreateSchema.parse(await request.json());

    const po = await db.purchaseOrder.findUnique({ where: { id: data.purchaseOrderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'NOT_FOUND');

    const dupe = await db.purchaseInvoice.findUnique({ where: { invoiceNumber: data.invoiceNumber } });
    if (dupe) throw new ApiError(409, 'Invoice number already exists', 'CONFLICT');

    const invoice = await db.purchaseInvoice.create({
      data: {
        invoiceNumber: data.invoiceNumber,
        purchaseOrderId: data.purchaseOrderId,
        amount: data.amount,
        status: data.status ?? 'UNPAID',
        notes: data.notes ?? null,
      },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id, status, notes } = invoicePatchSchema.parse(await request.json());

    const existing = await db.purchaseInvoice.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Invoice not found', 'NOT_FOUND');

    const invoice = await db.purchaseInvoice.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError(error);
  }
}
