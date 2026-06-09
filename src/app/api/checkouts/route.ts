import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { mutateStock } from '@/lib/stock';

const createCheckoutSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  qty: z.number().int('Qty must be a whole number').positive('Qty must be positive'),
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

    const checkout = await db.$transaction(async (tx) => {
      const created = await tx.itemCheckout.create({
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

      // Physically remove the units from on-hand stock. mutateStock validates the
      // item exists/active and that enough stock is available (throws 409 otherwise).
      await mutateStock(tx, {
        itemId: validated.itemId,
        delta: -validated.qty,
        reference: `Checkout ${created.id}`,
        userId: auth.user!.id,
      });

      return created;
    });

    await createAuditLog({
      action: 'CHECKOUT_ITEM' as AuditAction,
      user: auth.user,
      targetId: checkout.id,
      targetName: checkout.item.name,
      metadata: { itemId: validated.itemId, qty: validated.qty, purpose: validated.purpose ?? null },
    });

    return NextResponse.json({ checkout }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
