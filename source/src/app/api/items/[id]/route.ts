import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const { name, category, unit, minStock } = body;

    const result = await db.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

      const updateData: Prisma.ItemUpdateInput = {};
      if (name !== undefined) updateData.name = name;
      if (category !== undefined) updateData.category = category;
      if (unit !== undefined) updateData.unit = unit;
      if (minStock !== undefined) updateData.minStock = minStock;

      // Duplicate check when name or category changes
      if (name !== undefined || category !== undefined) {
        const checkName = name ?? item.name;
        const checkCategory = category ?? item.category;
        const duplicate = await tx.item.findFirst({
          where: { name: checkName, category: checkCategory, deletedAt: null, id: { not: id } },
        });
        if (duplicate) {
          throw new ApiError(
            409,
            'Item with this name and category already exists',
            'CONFLICT'
          );
        }
      }

      updateData.version = item.version + 1;

      const updated = await tx.item.update({ where: { id }, data: updateData });

      // Propagate name changes to denormalised fields
      if (name !== undefined && name !== item.name) {
        await tx.request.updateMany({ where: { itemId: id }, data: { itemName: name } });
        await tx.transaction.updateMany({ where: { itemId: id }, data: { itemName: name } });
      }

      return updated;
    });

    await createAuditLog({
      action: 'UPDATE_ITEM',
      user: auth.user,
      targetId: id,
      targetName: result.name,
      metadata: { name, category, unit, minStock },
    });

    return NextResponse.json({ item: result });
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

    const result = await db.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

      const openRequests = await tx.request.findFirst({
        where: { itemId: id, status: { in: ['Pending', 'Approved'] } },
      });
      if (openRequests) {
        throw new ApiError(409, 'Cannot delete item with open requests', 'CONFLICT');
      }

      return tx.item.update({ where: { id }, data: { deletedAt: new Date() } });
    });

    await createAuditLog({
      action: 'DELETE_ITEM',
      user: auth.user,
      targetId: id,
      targetName: result.name,
    });

    return NextResponse.json({ item: result });
  } catch (error) {
    return handleApiError(error);
  }
}
