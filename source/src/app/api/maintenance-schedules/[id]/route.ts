import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';

const patchSchema = z.object({
  action: z.literal('complete').optional(),
  title: z.string().min(1).max(200).optional(),
  dueDate: z.string().optional(),
  recurringDays: z.number().int().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  status: z.enum(['PENDING', 'OVERDUE', 'COMPLETED']).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const validated = patchSchema.parse(body);

    const existing = await db.maintenanceSchedule.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Schedule not found', 'NOT_FOUND');

    if (validated.action === 'complete') {
      const now = new Date();

      // Update current schedule to COMPLETED
      const updated = await db.maintenanceSchedule.update({
        where: { id },
        data: { status: 'COMPLETED', lastCompleted: now },
        include: { item: { select: { name: true } } },
      });

      // If recurring, create the next schedule
      if (existing.recurringDays) {
        const nextDue = new Date(existing.dueDate);
        nextDue.setDate(nextDue.getDate() + existing.recurringDays);
        await db.maintenanceSchedule.create({
          data: {
            itemId: existing.itemId,
            title: existing.title,
            dueDate: nextDue,
            recurringDays: existing.recurringDays,
            notes: existing.notes,
            status: 'PENDING',
          },
        });
      }

      return NextResponse.json({ schedule: updated });
    }

    // General field update
    const data: Record<string, unknown> = {};
    if (validated.title !== undefined) data.title = validated.title;
    if (validated.dueDate !== undefined) data.dueDate = new Date(validated.dueDate);
    if (validated.recurringDays !== undefined) data.recurringDays = validated.recurringDays;
    if (validated.notes !== undefined) data.notes = validated.notes;
    if (validated.status !== undefined) data.status = validated.status;

    const updated = await db.maintenanceSchedule.update({
      where: { id },
      data,
      include: { item: { select: { name: true } } },
    });

    return NextResponse.json({ schedule: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const existing = await db.maintenanceSchedule.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Schedule not found', 'NOT_FOUND');

    await db.maintenanceSchedule.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
