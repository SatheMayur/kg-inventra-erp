import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { checkReorder } from '@/lib/reorder';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const { issuedBy, expectedVersion } = body;

    if (!issuedBy) {
      throw new ApiError(400, 'issuedBy is required', 'BAD_REQUEST');
    }

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');

      if (req.status !== 'Approved' && req.status !== 'ReadyForPickup') {
        throw new ApiError(400, 'Only approved or ready-for-pickup requests can be issued', 'BAD_REQUEST');
      }

      const item = await tx.item.findUnique({ where: { id: req.itemId } });
      if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

      // Optimistic concurrency check
      if (expectedVersion !== undefined && item.version !== expectedVersion) {
        throw new ApiError(409, 'Item has been modified since the request was made', 'CONFLICT');
      }

      if (item.stock < req.qty) {
        throw new ApiError(409, `Insufficient stock. Current stock: ${item.stock}`, 'CONFLICT');
      }

      // Decrement stock, release reservation, increment version
      const updatedItem = await tx.item.update({
        where: { 
          id: req.itemId,
          version: expectedVersion ?? item.version // Enforce version match if provided
        },
        data: {
          stock: { decrement: req.qty },
          reservedQty: { decrement: req.qty },
          version: { increment: 1 },
        },
      });

      // Create OUT transaction
      await tx.transaction.create({
        data: {
          type: 'OUT',
          itemId: req.itemId,
          itemName: item.name,
          qty: req.qty,
          reference: `Request ${req.id}`,
          userId: req.userId,
        },
      });

      // Auto-create a reorder PO if this issue dropped the item to its threshold
      await checkReorder(tx, req.itemId);

      const updatedRequest = await tx.request.update({
        where: { id },
        data: {
          status: 'Issued',
          issuedAt: new Date(),
          issuedBy,
        },
      });

      return { request: updatedRequest, item: updatedItem };
    });

    // Audit Log
    await createAuditLog({
      action: 'ISSUE_REQUEST',
      user: auth.user,
      targetId: id,
      targetName: result.request.itemName,
      metadata: { qty: result.request.qty, employee: result.request.employee }
    });

    await createNotification({
      userId: result.request.userId,
      title: 'Item Issued',
      message: `Your requested item "${result.request.itemName}" has been officially issued.`,
      type: 'info',
      link: 'requests',
    });

    // Notify all admins if stock dropped to or below minStock
    const available = result.item.stock - result.item.reservedQty;
    if (available <= result.item.minStock) {
      const admins = await db.user.findMany({
        where: { role: 'admin', active: true },
        select: { id: true },
      });
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.id,
            title: available === 0 ? 'Out of Stock' : 'Low Stock Alert',
            message: `"${result.item.name}" is ${available === 0 ? 'out of stock' : `low (${available} remaining)`}. Reorder recommended.`,
            type: available === 0 ? 'error' : 'warning',
            link: 'inventory',
          })
        )
      );
    }

    return NextResponse.json({ request: result.request, item: result.item });
  } catch (error) {
    return handleApiError(error);
  }
}
