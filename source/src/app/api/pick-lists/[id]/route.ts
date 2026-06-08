import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';

const itemUpdateSchema = z.object({
  id: z.string().min(1),
  pickedQty: z.number().min(0).optional(),
  status: z.string().optional(),
});

const patchSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(itemUpdateSchema).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const pickList = await db.pickList.findUnique({
      where: { id },
      include: {
        items: {
          include: { item: { select: { id: true, stock: true, unit: true } } },
        },
      },
    });

    if (!pickList) throw new ApiError(404, 'Pick list not found', 'NOT_FOUND');

    return NextResponse.json({ pickList });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const existing = await db.pickList.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Pick list not found', 'NOT_FOUND');

    const body = await request.json();
    const validated = patchSchema.parse(body);

    // Build top-level update data
    const updateData: { status?: string; notes?: string } = {};
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.notes !== undefined) updateData.notes = validated.notes;

    const pickList = await db.$transaction(async (trx) => {
      // Update individual item rows if provided
      if (validated.items && validated.items.length > 0) {
        for (const itemUpdate of validated.items) {
          const itemPatch: { pickedQty?: number; status?: string } = {};
          if (itemUpdate.pickedQty !== undefined) itemPatch.pickedQty = itemUpdate.pickedQty;
          if (itemUpdate.status !== undefined) itemPatch.status = itemUpdate.status;
          if (Object.keys(itemPatch).length > 0) {
            await trx.pickListItem.update({
              where: { id: itemUpdate.id },
              data: itemPatch,
            });
          }
        }
      }

      return trx.pickList.update({
        where: { id },
        data: updateData,
        include: { items: true },
      });
    });

    return NextResponse.json({ pickList });
  } catch (error) {
    return handleApiError(error);
  }
}
