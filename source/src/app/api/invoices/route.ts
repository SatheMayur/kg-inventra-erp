import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { INVOICEABLE_STATUSES } from '@/lib/po-status';
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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '200')));
    const skip = (page - 1) * pageSize;

    const invoices = await db.purchaseInvoice.findMany({
      include: { purchaseOrder: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
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
    if (!INVOICEABLE_STATUSES.includes(po.status as any)) {
      throw new ApiError(400, `Cannot link invoice to a PO in ${po.status} status`, 'BAD_REQUEST');
    }

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
