import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';

const pickListItemSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  qty: z.number().positive('Qty must be positive'),
  unit: z.string().min(1).default('pcs'),
});

const createPickListSchema = z.object({
  name: z.string().min(1, 'Name required').max(200),
  notes: z.string().max(500).optional(),
  items: z.array(pickListItemSchema).min(1, 'At least one item required'),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const pickLists = await db.pickList.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ pickLists });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const validated = createPickListSchema.parse(body);

    const pickList = await db.$transaction(async (trx) => {
      return trx.pickList.create({
        data: {
          name: validated.name,
          notes: validated.notes,
          createdBy: auth.user?.name,
          items: {
            create: validated.items.map((i) => ({
              itemId: i.itemId,
              itemName: i.itemName,
              qty: i.qty,
              unit: i.unit,
            })),
          },
        },
        include: { items: true },
      });
    });

    await createAuditLog({
      action: 'CREATE_TRANSFER', // reuse closest available action
      user: auth.user,
      targetId: pickList.id,
      targetName: pickList.name,
      metadata: { type: 'CREATE_PICK_LIST', itemCount: validated.items.length },
    });

    return NextResponse.json({ pickList }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
