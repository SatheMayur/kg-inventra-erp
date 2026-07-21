import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { itemSchema } from '@/lib/validation';
import { createAuditLog } from '@/lib/audit';
import {
  ITEM_NATURE,
  ITEM_PRICING_MODE,
  ITEM_PROCUREMENT_TYPE,
  ITEM_SOURCE_CHANNEL,
  canCreateDailyItem,
  canCreateStandardItem,
  canViewAllItemTypes,
  canViewDailyProcurementItems,
  ensureItemCategories,
  findItemDuplicateMatches,
  isDailyProcurementEligibleItem,
  isPerishableNature,
} from '@/lib/item-master';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const procurementContext = searchParams.get('procurementContext') || searchParams.get('context');
    const includeAll = searchParams.get('includeAll') === 'true' || searchParams.get('showAll') === 'true';
    const dailyContext = procurementContext === 'daily';

    if (dailyContext && !canViewDailyProcurementItems(auth.user?.role)) {
      return NextResponse.json({ error: 'You do not have permission to view Daily Procurement items' }, { status: 403 });
    }
    if (dailyContext && includeAll && !canViewAllItemTypes(auth.user?.role)) {
      return NextResponse.json({ error: 'You do not have permission to view all item types' }, { status: 403 });
    }
    
    // Pagination params — cap pageSize to prevent unbounded queries
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '10')));
    const skip = (page - 1) * pageSize;

    const where: Prisma.ItemWhereInput = {
      deletedAt: null,
      active: true,
    };

    if (dailyContext && !includeAll) {
      where.procurementType = { in: [ITEM_PROCUREMENT_TYPE.DAILY, ITEM_PROCUREMENT_TYPE.BOTH] };
      where.dailyProcurementEligible = true;
      where.itemNature = { not: ITEM_NATURE.SERVICE };
    }

    if (category && category !== 'All') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { itemCode: { contains: search } },
        { shortName: { contains: search } },
        { category: { contains: search } },
        { aliases: { some: { aliasText: { contains: search } } } },
      ];
    }

    const [totalCount, items] = await Promise.all([
      db.item.count({ where }),
      db.item.findMany({
        where,
        include: { aliases: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      })
    ]);

    // Calculate rolling 30-day velocity (average daily consumption) for each item in the page
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const itemIds = items.map((item) => item.id);

    const [consumptionGroups, openPoItems] = await Promise.all([
      db.transaction.groupBy({
        by: ['itemId'],
        where: {
          itemId: { in: itemIds },
          type: 'OUT',
          date: { gte: thirtyDaysAgo },
        },
        _sum: { qty: true },
      }),
      db.pOItem.findMany({
        where: {
          itemId: { in: itemIds },
          purchaseOrder: {
            status: { in: ['DRAFT', 'PENDING_APPROVAL', 'SENT'] }
          }
        },
        select: {
          itemId: true,
          qty: true,
          receivedQty: true
        }
      })
    ]);

    const consumptionMap: Record<string, number> = {};
    for (const g of consumptionGroups) {
      consumptionMap[g.itemId] = g._sum.qty ?? 0;
    }

    const onOrderMap: Record<string, number> = {};
    for (const poItem of openPoItems) {
      const remaining = poItem.qty - poItem.receivedQty;
      if (remaining > 0) {
        onOrderMap[poItem.itemId] = (onOrderMap[poItem.itemId] || 0) + remaining;
      }
    }

    const itemsWithVelocity = items.map((item) => {
      const totalConsumed = consumptionMap[item.id] || 0;
      const avgDailyConsumption = totalConsumed / 30;
      const avgDaily = avgDailyConsumption;
      const leadDays = 7;
      const variabilityPct = 20;
      const safetyStock = avgDaily * leadDays * (variabilityPct / 100) * 1.65;
      const rop = Math.ceil(avgDaily * leadDays + safetyStock);
      const onOrderQty = onOrderMap[item.id] || 0;

      return {
        ...item,
        avgDailyConsumption: Math.round(avgDailyConsumption * 100) / 100,
        rop: rop > 0 ? rop : item.minStock,
        onOrderQty,
      };
    });

    return NextResponse.json(
      { items: itemsWithVelocity, pagination: { totalCount, page, pageSize, totalPages: Math.ceil(totalCount / pageSize) } },
      { headers: { 'Cache-Control': dailyContext ? 'private, no-store' : 'private, max-age=15' } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const sourceChannel = typeof body.sourceChannel === 'string' ? body.sourceChannel : undefined;
    const quickAdd = sourceChannel === ITEM_SOURCE_CHANNEL.DAILY_PROCUREMENT_QUICK_ADD;
    const isDailySource = !!sourceChannel?.startsWith('DAILY_PROCUREMENT');
    const validated = itemSchema.parse({
      ...body,
      stock: body.stock ?? 0,
      minStock: body.minStock ?? 0,
      unit: body.unit || body.baseUnit,
      baseUnit: body.baseUnit || body.unit,
      purchaseUnit: body.purchaseUnit || body.unit,
      consumptionUnit: body.consumptionUnit || body.unit,
      procurementType: quickAdd ? ITEM_PROCUREMENT_TYPE.DAILY : body.procurementType,
      pricingMode: quickAdd ? ITEM_PRICING_MODE.DAILY_MARKET_RATE : body.pricingMode,
      dailyProcurementEligible: quickAdd ? true : body.dailyProcurementEligible,
      requiresMasterReview: quickAdd ? true : body.requiresMasterReview,
      sourceChannel: sourceChannel || ITEM_SOURCE_CHANNEL.ITEM_MASTER,
    });
    const dailyItemRequested =
      isDailySource ||
      validated.dailyProcurementEligible ||
      validated.procurementType === ITEM_PROCUREMENT_TYPE.DAILY ||
      validated.procurementType === ITEM_PROCUREMENT_TYPE.BOTH;

    if (dailyItemRequested) {
      if (!canCreateDailyItem(auth.user?.role)) {
        return NextResponse.json({ error: 'You do not have permission to create Daily Procurement items' }, { status: 403 });
      }
    } else if (!canCreateStandardItem(auth.user?.role)) {
      return NextResponse.json({ error: 'You do not have permission to create items' }, { status: 403 });
    }

    const createData: Prisma.ItemCreateInput = {
      name: validated.name.trim(),
      itemCode: validated.itemCode || null,
      category: validated.category.trim(),
      unit: validated.unit.trim(),
      stock: validated.stock,
      minStock: validated.minStock,
      maxStock: validated.maxStock,
      safetyStock: validated.safetyStock,
      reorderQty: validated.reorderQty,
      shortName: validated.shortName || null,
      subCategory: validated.subCategory || null,
      description: validated.description || null,
      hsnCode: validated.hsnCode || null,
      gstRate: validated.gstRate,
      warehouse: validated.warehouse || null,
      rack: validated.rack || null,
      shelf: validated.shelf || null,
      bin: validated.bin || null,
      preferredSupplierId: validated.preferredSupplierId || null,
      procurementType: validated.procurementType,
      pricingMode: validated.pricingMode,
      itemNature: validated.itemNature,
      baseUnit: validated.baseUnit || validated.unit,
      purchaseUnit: validated.purchaseUnit || validated.unit,
      consumptionUnit: validated.consumptionUnit || validated.unit,
      unitConversion: validated.unitConversion,
      perishable: isPerishableNature(validated.itemNature),
      shelfLife: validated.shelfLife ?? null,
      storageCondition: validated.storageCondition || null,
      qualityGradeEnabled: validated.qualityGradeEnabled,
      dailyProcurementEligible: validated.dailyProcurementEligible,
      requiresMasterReview: validated.requiresMasterReview,
      active: validated.active,
      reservedQty: 0,
      version: 1,
      sourceChannel: validated.sourceChannel || ITEM_SOURCE_CHANNEL.ITEM_MASTER,
    };

    if (dailyItemRequested && !canCreateStandardItem(auth.user?.role)) {
      createData.procurementType = ITEM_PROCUREMENT_TYPE.DAILY;
      createData.dailyProcurementEligible = true;
      createData.requiresMasterReview = true;
      createData.sourceChannel = isDailySource ? createData.sourceChannel : ITEM_SOURCE_CHANNEL.DAILY_PROCUREMENT_QUICK_ADD;
    }

    if (dailyItemRequested && !isDailyProcurementEligibleItem(createData)) {
      throw new ApiError(400, 'Daily Procurement items must be active, non-service items with DAILY or BOTH procurement type', 'BAD_REQUEST');
    }

    const result = await db.$transaction(async (tx) => {
      if (createData.itemCode) {
        const existingCode = await tx.item.findUnique({ where: { itemCode: createData.itemCode } });
        if (existingCode) {
          throw new ApiError(409, `Item code "${createData.itemCode}" is already used by "${existingCode.name}"`, 'CONFLICT');
        }
      }
      const duplicateMatches = await findItemDuplicateMatches(tx, {
        name: createData.name,
        category: createData.category,
      });
      const exactActiveDuplicate = duplicateMatches.find((match) => match.matchType === 'EXACT_NAME' && match.active);
      const confirmedDuplicate = body.confirmDuplicate === true;

      if (exactActiveDuplicate || (duplicateMatches.length > 0 && !confirmedDuplicate)) {
        return {
          duplicateMatches,
          item: null,
          exactBlocked: !!exactActiveDuplicate,
        };
      }

      await ensureItemCategories(tx, [{ name: createData.category, procurementType: createData.procurementType }]);

      const item = await tx.item.create({ data: createData });
      return { duplicateMatches: [], item, exactBlocked: false };
    });

    if (!result.item) {
      const message = result.exactBlocked
        ? `An active item named "${validated.name}" already exists in category "${validated.category}"`
        : 'A matching or similar item already exists. Select the existing item or confirm creation if authorized.';
      return NextResponse.json(
        {
          error: message,
          code: 'ITEM_DUPLICATE',
          matches: result.duplicateMatches,
          confirmable: !result.exactBlocked,
        },
        { status: 409 },
      );
    }

    // Audit Log
    await createAuditLog({
      action: 'CREATE_ITEM',
      user: auth.user,
      targetId: result.item.id,
      targetName: result.item.name,
      metadata: {
        category: result.item.category,
        stock: result.item.stock,
        procurementType: result.item.procurementType,
        sourceChannel: result.item.sourceChannel,
      }
    });

    return NextResponse.json({ item: result.item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
