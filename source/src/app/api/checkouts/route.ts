import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { createAuditLog, AuditAction } from '@/lib/audit';

const createCheckoutSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  qty: z.number().positive('Qty must be positive'),
  purpose: z.string().max(300).optional(),
  expectedReturnAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // ACTIVE | RETURNED | OVERDUE
    const itemId = searchParams.get('itemId');

    const where: Record<string, unknown> = {};
    if (itemId) where.itemId = itemId;
    // OVERDUE is computed — filter ACTIVE from DB then classify
    if (statusFilter === 'RETURNED') {
      where.status = 'RETURNED';
    } else if (statusFilter === 'ACTIVE' || statusFilter === 'OVERDUE') {
      where.status = 'ACTIVE';
    }

    const rows = await db.itemCheckout.findMany({
      where,
      include: {
        item: { select: { name: true, unit: true } },
        user: { select: { name: true, empId: true } },
      },
      orderBy: { checkedOutAt: 'desc' },
    });

    const now = new Date();

    const checkouts = rows.map((c) => {
      const isOverdue =
        c.status === 'ACTIVE' &&
        c.expectedReturnAt !== null &&
        c.expectedReturnAt < now;

      const computedStatus = isOverdue ? 'OVERDUE' : c.status;
      return { ...c, status: computedStatus };
    }).filter((c) => {
      if (!statusFilter) return true;
      return c.status === statusFilter;
    });

    return NextResponse.json({ checkouts });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const validated = createCheckoutSchema.parse(body);

    const item = await db.item.findUnique({ where: { id: validated.itemId, deletedAt: null } });
    if (!item) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    const checkout = await db.itemCheckout.create({
      data: {
        itemId: validated.itemId,
        userId: auth.user!.id,
        qty: validated.qty,
        purpose: validated.purpose,
        expectedReturnAt: validated.expectedReturnAt ? new Date(validated.expectedReturnAt) : null,
        notes: validated.notes,
      },
      include: {
        item: { select: { name: true, unit: true } },
        user: { select: { name: true, empId: true } },
      },
    });

    await createAuditLog({
      action: 'CHECKOUT_ITEM' as AuditAction,
      user: auth.user,
      targetId: checkout.id,
      targetName: item.name,
      metadata: { itemId: item.id, qty: validated.qty, purpose: validated.purpose ?? null },
    });

    return NextResponse.json({ checkout }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
