import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';

const transferItemSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  variantId: z.string().optional(),
  variantName: z.string().optional(),
  qty: z.number().positive('Qty must be positive'),
  unit: z.string().min(1).default('pcs'),
});

const createTransferSchema = z.object({
  fromLocation: z.string().min(1, 'From location required').max(200),
  toLocation: z.string().min(1, 'To location required').max(200),
  notes: z.string().max(500).optional(),
  items: z.array(transferItemSchema).min(1, 'At least one item required'),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const reconciled = searchParams.get('reconciled');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (reconciled !== null) where.ppReconciled = reconciled === 'true';

    const transfers = await db.stockTransfer.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ transfers });
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
    const validated = createTransferSchema.parse(body);

    // Verify all items exist
    for (const ti of validated.items) {
      const item = await db.item.findUnique({ where: { id: ti.itemId, deletedAt: null } });
      if (!item) throw new ApiError(404, `Item "${ti.itemName}" not found`, 'NOT_FOUND');
    }

    // Generate memo number TM-YYYYMMDD-NNN
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await db.stockTransfer.count({
      where: { memoNumber: { startsWith: `TM-${date}` } },
    });
    const memoNumber = `TM-${date}-${(count + 1).toString().padStart(3, '0')}`;

    const transfer = await db.stockTransfer.create({
      data: {
        memoNumber,
        fromLocation: validated.fromLocation,
        toLocation: validated.toLocation,
        notes: validated.notes,
        createdBy: auth.user?.name,
        items: {
          create: validated.items.map((ti) => ({
            itemId: ti.itemId,
            itemName: ti.itemName,
            variantId: ti.variantId,
            variantName: ti.variantName,
            qty: ti.qty,
            unit: ti.unit,
          })),
        },
      },
      include: { items: true },
    });

    await createAuditLog({
      action: 'CREATE_TRANSFER',
      user: auth.user,
      targetId: transfer.id,
      targetName: transfer.memoNumber,
      metadata: { fromLocation: transfer.fromLocation, toLocation: transfer.toLocation, itemCount: validated.items.length },
    });

    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
