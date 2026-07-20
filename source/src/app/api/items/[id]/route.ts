import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import {
  ITEM_NATURE,
  ensureItemCategories,
  isPerishableNature,
  validateUnitConversion,
} from '@/lib/item-master';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin', 'STORE_ADMIN']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const {
      name,
      category,
      unit,
      minStock,
      itemCode,
      hsnCode,
      gstRate,
      maxStock,
      safetyStock,
      reorderQty,
      shortName,
      subCategory,
      description,
      warehouse,
      rack,
      shelf,
      bin,
      active,
      preferredSupplierId,
      procurementType,
      pricingMode,
      itemNature,
      baseUnit,
      purchaseUnit,
      consumptionUnit,
      unitConversion,
      shelfLife,
      storageCondition,
      qualityGradeEnabled,
      dailyProcurementEligible,
      requiresMasterReview,
    } = body;

    if (minStock !== undefined && (!Number.isInteger(minStock) || minStock < 0)) {
      throw new ApiError(400, 'minStock must be a non-negative integer', 'BAD_REQUEST');
    }
    const unitError = validateUnitConversion({ baseUnit, purchaseUnit, consumptionUnit, unitConversion });
    if (unitError) throw new ApiError(400, unitError, 'BAD_REQUEST');
    if (itemNature === ITEM_NATURE.SERVICE && dailyProcurementEligible === true) {
      throw new ApiError(400, 'Service items cannot be eligible for Daily Procurement', 'BAD_REQUEST');
    }

    const result = await db.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');
      const nextItemNature = itemNature ?? item.itemNature;
      const nextDailyEligible = dailyProcurementEligible ?? item.dailyProcurementEligible;
      if (nextItemNature === ITEM_NATURE.SERVICE && nextDailyEligible) {
        throw new ApiError(400, 'Service items cannot be eligible for Daily Procurement', 'BAD_REQUEST');
      }

      const updateData: Prisma.ItemUpdateInput = {};
      if (name !== undefined) updateData.name = name;
      if (category !== undefined) updateData.category = category;
      if (unit !== undefined) updateData.unit = unit;
      if (minStock !== undefined) updateData.minStock = minStock;
      if (itemCode !== undefined) updateData.itemCode = itemCode || null;
      if (hsnCode !== undefined) updateData.hsnCode = hsnCode || null;
      if (gstRate !== undefined) updateData.gstRate = gstRate;
      if (maxStock !== undefined) updateData.maxStock = maxStock;
      if (safetyStock !== undefined) updateData.safetyStock = safetyStock;
      if (reorderQty !== undefined) updateData.reorderQty = reorderQty;
      if (shortName !== undefined) updateData.shortName = shortName || null;
      if (subCategory !== undefined) updateData.subCategory = subCategory || null;
      if (description !== undefined) updateData.description = description || null;
      if (warehouse !== undefined) updateData.warehouse = warehouse || null;
      if (rack !== undefined) updateData.rack = rack || null;
      if (shelf !== undefined) updateData.shelf = shelf || null;
      if (bin !== undefined) updateData.bin = bin || null;
      if (active !== undefined) updateData.active = active;
      if (preferredSupplierId !== undefined) updateData.preferredSupplierId = preferredSupplierId || null;
      if (procurementType !== undefined) updateData.procurementType = procurementType;
      if (pricingMode !== undefined) updateData.pricingMode = pricingMode;
      if (itemNature !== undefined) updateData.itemNature = itemNature;
      // perishable is derived from itemNature (single source of truth, §7) — set it
      // on every update so any pre-existing drift is healed.
      updateData.perishable = isPerishableNature(nextItemNature);
      if (baseUnit !== undefined) updateData.baseUnit = baseUnit || null;
      if (purchaseUnit !== undefined) updateData.purchaseUnit = purchaseUnit || null;
      if (consumptionUnit !== undefined) updateData.consumptionUnit = consumptionUnit || null;
      if (unitConversion !== undefined) updateData.unitConversion = unitConversion;
      if (shelfLife !== undefined) updateData.shelfLife = shelfLife ?? null;
      if (storageCondition !== undefined) updateData.storageCondition = storageCondition || null;
      if (qualityGradeEnabled !== undefined) updateData.qualityGradeEnabled = qualityGradeEnabled;
      if (dailyProcurementEligible !== undefined) updateData.dailyProcurementEligible = dailyProcurementEligible;
      if (requiresMasterReview !== undefined) updateData.requiresMasterReview = requiresMasterReview;

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
      if (category !== undefined) {
        await ensureItemCategories(tx, [{ name: category, procurementType: procurementType ?? item.procurementType }]);
      }

      const updated = await tx.item.update({ where: { id }, data: updateData });

      // Propagate name changes to denormalised fields
      if (name !== undefined && name !== item.name) {
        await tx.requestLine.updateMany({ where: { itemId: id }, data: { itemName: name } });
        await tx.transaction.updateMany({ where: { itemId: id }, data: { itemName: name } });
      }

      return updated;
    });

    await createAuditLog({
      action: 'UPDATE_ITEM',
      user: auth.user,
      targetId: id,
      targetName: result.name,
      metadata: { name, category, unit, minStock, itemCode, hsnCode, gstRate, procurementType, itemNature, dailyProcurementEligible },
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
    const auth = await authorize(request, ['admin', 'STORE_ADMIN']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

      const openRequests = await tx.request.findFirst({
        where: {
          status: { in: ['Pending', 'Approved'] },
          lines: { some: { itemId: id } },
        },
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
