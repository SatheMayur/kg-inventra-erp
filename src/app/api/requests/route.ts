import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { requestCreateSchema } from '@/lib/validation';
import { flattenRequest } from '@/lib/request-fulfillment';

const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'status'] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const sortBy = searchParams.get('sortBy') || 'createdAt_desc';

    const where: Prisma.RequestWhereInput = {};

    // Employees can only see their own requests
    if (auth.user?.role === 'employee') {
      where.userId = auth.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (status) where.status = status;

    const [rawField, rawDir] = sortBy.split('_');
    const safeField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(rawField)
      ? rawField
      : 'createdAt';
    const safeDir = rawDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [safeField]: safeDir } as Prisma.RequestOrderByWithRelationInput;

    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '500')));
    const requests = await db.request.findMany({
      where,
      orderBy,
      take: limit,
      include: { lines: true },
    });

    return NextResponse.json({ requests: requests.map(flattenRequest) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();

    // Back-compat: a legacy single { itemId, qty } body becomes one line.
    const normalized = {
      userId: body.userId,
      requiredDate: typeof body.requiredDate === 'string' ? body.requiredDate : undefined,
      machine: typeof body.machine === 'string' ? body.machine : undefined,
      concernPerson: typeof body.concernPerson === 'string' ? body.concernPerson : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
      priority: typeof body.priority === 'string' ? body.priority : 'MEDIUM',
      purpose: typeof body.purpose === 'string' ? body.purpose : undefined,
      remarks: typeof body.remarks === 'string' ? body.remarks : undefined,
      attachments: typeof body.attachments === 'string' ? body.attachments : undefined,
      lines: Array.isArray(body.lines)
        ? body.lines
        : body.itemId
          ? [{ itemId: body.itemId, qty: body.qty }]
          : [],
    };
    const { userId, requiredDate, machine, concernPerson, note, priority, purpose, remarks, attachments, lines } = requestCreateSchema.parse(normalized);

    // Employees can only create requests for themselves
    if (auth.user?.role === 'employee' && userId !== auth.user.id) {
      throw new ApiError(403, 'You can only create requests for yourself', 'FORBIDDEN');
    }

    // Aggregate requested qty per catalog item so duplicate lines don't over-reserve
    // stock. Custom (off-catalog) lines have no itemId yet and are materialized below.
    const qtyByItem = new Map<string, number>();
    for (const l of lines) {
      if (!l.itemId) continue;
      qtyByItem.set(l.itemId, (qtyByItem.get(l.itemId) ?? 0) + l.qty);
    }

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

      const lineData: {
        itemId: string;
        itemName: string;
        requestedQty: number;
        availableQtySnapshot: number;
        availableQty: number;
        pendingPurchaseQty: number;
        fulfillmentStatus: string;
        unit: string;
        status: string;
      }[] = [];

      let hasDeficit = false;

      for (const [itemId, totalQty] of qtyByItem) {
        const item = await tx.item.findUnique({ where: { id: itemId } });
        if (!item || item.deletedAt || item.active === false) {
          throw new ApiError(400, `Item is inactive, deleted, or unavailable: ${item?.name || itemId}`, 'BAD_REQUEST');
        }

        // available_qty = current_stock
        const available = Math.max(0, item.stock);
        let remainingStock = available;

        // Loop over each line for this item in the request to allocate stock sequentially
        for (const l of lines.filter((x) => x.itemId === itemId)) {
          const requested = l.qty;
          let statusStr = "Pending";
          let fulfillmentStatus = "PENDING_CHECK";
          let lineAvailableQty = 0;
          let linePendingPurchaseQty = 0;
          let reserveQty = 0;

          if (remainingStock <= 0) {
            // Case 2: available_qty = 0
            fulfillmentStatus = "PURCHASE_REQUIRED";
            lineAvailableQty = 0;
            linePendingPurchaseQty = requested;
            reserveQty = 0;
            statusStr = "Pending";
            hasDeficit = true;
          } else if (requested <= remainingStock) {
            // Case 1: requested_qty <= available_qty
            fulfillmentStatus = "READY_FOR_ISSUE";
            lineAvailableQty = requested;
            linePendingPurchaseQty = 0;
            reserveQty = requested;
            remainingStock -= requested;
            statusStr = body.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';
          } else {
            // Case 3: requested_qty > available_qty
            fulfillmentStatus = "PARTIALLY_AVAILABLE";
            lineAvailableQty = remainingStock;
            linePendingPurchaseQty = requested - remainingStock;
            reserveQty = remainingStock;
            remainingStock = 0;
            statusStr = body.status === 'DRAFT' ? 'DRAFT' : 'UNDER_REVIEW';
            hasDeficit = true;
          }

          if (reserveQty > 0 && body.status !== 'DRAFT') {
            await tx.item.update({
              where: { id: itemId },
              data: { reservedQty: { increment: reserveQty }, version: { increment: 1 } },
            });
          }

          lineData.push({
            itemId,
            itemName: item.name,
            requestedQty: requested,
            availableQtySnapshot: available,
            availableQty: lineAvailableQty,
            pendingPurchaseQty: linePendingPurchaseQty,
            fulfillmentStatus,
            unit: item.unit,
            status: body.status === 'DRAFT' ? 'DRAFT' : statusStr,
          });
        }
      }

      // Off-catalog (custom) lines: materialize a proposed Item (active:false, hidden
      // from catalog until an admin promotes it on approval) and add a PURCHASE_REQUIRED
      // line. Stock is 0, so nothing is reserved.
      for (const l of lines) {
        if (!l.customItemName) continue;
        const proposed = await tx.item.create({
          data: {
            name: l.customItemName,
            unit: l.unit || 'pcs',
            category: 'Custom Request',
            stock: 0,
            reservedQty: 0,
            reorderQty: 0,
            price: 0,
            active: false,
            sourceChannel: 'REQUISITION',
            createdBy: userId,
          },
        });
        hasDeficit = true;
        lineData.push({
          itemId: proposed.id,
          itemName: proposed.name,
          requestedQty: l.qty,
          availableQtySnapshot: 0,
          availableQty: 0,
          pendingPurchaseQty: l.qty,
          fulfillmentStatus: 'PURCHASE_REQUIRED',
          unit: proposed.unit,
          status: body.status === 'DRAFT' ? 'DRAFT' : 'Pending',
        });
      }

      const status = body.status === 'DRAFT' ? 'DRAFT' : (hasDeficit ? 'UNDER_REVIEW' : 'SUBMITTED');

      const req = await tx.request.create({
        data: {
          userId,
          employee: user.name,
          department: user.department,
          concernPerson: concernPerson?.trim() || null,
          requiredDate: requiredDate ? new Date(requiredDate) : null,
          machine: machine?.trim() || null,
          note: note?.trim() || null,
          priority,
          purpose: purpose?.trim() || null,
          remarks: remarks?.trim() || null,
          attachments: attachments?.trim() || null,
          status,
          lines: { create: lineData },
        },
        include: { lines: true },
      });

      return req;
    });

    return NextResponse.json({ request: flattenRequest(result) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
