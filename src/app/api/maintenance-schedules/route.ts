import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const createSchema = z.object({
  itemId: z.string().min(1),
  title: z.string().min(1).max(200),
  dueDate: z.string().min(1),
  recurringDays: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const itemId = searchParams.get('itemId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (itemId) where.itemId = itemId;

    const schedules = await db.maintenanceSchedule.findMany({
      where,
      include: { item: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    });

    return NextResponse.json({ schedules });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const validated = createSchema.parse(body);

    const item = await db.item.findUnique({ where: { id: validated.itemId, deletedAt: null } });
    if (!item) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    const schedule = await db.maintenanceSchedule.create({
      data: {
        itemId: validated.itemId,
        title: validated.title,
        dueDate: new Date(validated.dueDate),
        recurringDays: validated.recurringDays,
        notes: validated.notes,
        status: 'PENDING',
      },
      include: { item: { select: { name: true } } },
    });

    await createAuditLog({
      action: 'CREATE_MAINTENANCE',
      user: auth.user,
      targetId: schedule.id,
      targetName: schedule.title,
      metadata: { itemId: validated.itemId, itemName: item.name, dueDate: validated.dueDate },
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
