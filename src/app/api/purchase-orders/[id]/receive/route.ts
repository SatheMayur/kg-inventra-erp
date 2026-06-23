import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { mutateStock, reserveStock } from '@/lib/stock';
import { allocateReceiptToLines, deriveFulfillmentStatus, rollupRequestStatus } from '@/lib/request-fulfillment';
import { threeWayMatch } from '@/lib/three-way-match';
import { getKolkataDateString } from '@/lib/date-utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin' && auth.user?.role !== 'STORE_ADMIN' && auth.user?.role !== 'STORE_OPERATOR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id: poId } = await params;
    const body = await request.json().catch(() => ({}));
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : null;

    const result = await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: poId },
        include: { items: { include: { item: true } } },
      });
      if (!po) throw new ApiError(404, 'Purchase Order not found', 'NOT_FOUND');

      if (po.status === 'CLOSED') {
        throw new ApiError(409, 'Purchase Order is already closed', 'CONFLICT');
      }

      // Resolve items and quantities being received
      const receivedInput = Array.isArray(body.items) ? body.items as { itemId: string; qty: number; rejectedQty?: number; remarks?: string }[] : [];
      
      const receivedItems = receivedInput.length > 0 ? receivedInput : po.items.map(item => ({
        itemId: item.itemId,
        qty: item.qty - item.receivedQty,
        rejectedQty: 0,
        remarks: null
      }));

      if (receivedItems.length === 0) {
        throw new ApiError(400, 'No items specified to receive', 'BAD_REQUEST');
      }

      // Generate GRN Number: GRN-YYYYMMDD-XXX
      const date = getKolkataDateString().replace(/-/g, '');
      const grnCount = await tx.goodsReceipt.count({ where: { grnNumber: { startsWith: `GRN-${date}` } } });
      const grnNumber = `GRN-${date}-${(grnCount + 1).toString().padStart(3, '0')}`;

      // Create GoodsReceipt header
      const goodsReceipt = await tx.goodsReceipt.create({
        data: {
          grnNumber,
          purchaseOrderId: poId,
          supplierId: po.supplierId,
          receivedBy: auth.user!.name,
          remarks
        }
      });

      const grnLineItems: any[] = [];

      for (const item of receivedItems) {
        if (!item.itemId || typeof item.qty !== 'number' || item.qty <= 0) {
          throw new ApiError(400, `Each line needs itemId and qty > 0`, 'BAD_REQUEST');
        }

        const poItem = po.items.find(x => x.itemId === item.itemId);
        if (!poItem) {
          throw new ApiError(400, `Item ${item.itemId} does not belong to this Purchase Order`, 'BAD_REQUEST');
        }

        const remaining = poItem.qty - poItem.receivedQty;
        
        // Over-Receiving check
        if (item.qty > remaining) {
          throw new ApiError(400, `Received quantity (${item.qty}) cannot exceed remaining ordered quantity (${remaining}) for item ${poItem.item.name}`, 'BAD_REQUEST');
        }

        const rejectedQty = item.rejectedQty || 0;
        if (rejectedQty < 0 || rejectedQty > item.qty) {
          throw new ApiError(400, 'Rejected quantity must be between 0 and received quantity', 'BAD_REQUEST');
        }
        const acceptedQty = item.qty - rejectedQty;

        // Create GoodsReceiptItem
        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: goodsReceipt.id,
            itemId: item.itemId,
            orderedQty: poItem.qty,
            receivedQty: item.qty,
            rejectedQty,
            acceptedQty,
            remarks: item.remarks || null
          }
        });

        // Update physical stock IMMEDIATELY on GRN approval
        if (acceptedQty > 0) {
          await mutateStock(tx, {
            itemId: item.itemId,
            delta: acceptedQty,
            reference: `GRN ${grnNumber} for PO ${po.poNumber}`,
            userId: auth.user!.id,
            subType: 'PURCHASE'
          });

          // Update unit price on Item master
          if (poItem.unitPrice > 0) {
            await tx.item.update({
              where: { id: item.itemId },
              data: { price: poItem.unitPrice }
            });
          }
        }

        // Update POItem receivedQty
        await tx.pOItem.update({
          where: { id: poItem.id },
          data: { receivedQty: { increment: item.qty } }
        });

        // Close the loop: re-reserve accepted stock to the originating requisition lines.
        if (po.linkedSrId && acceptedQty > 0) {
          const srLines = await tx.requestLine.findMany({
            where: { requestId: po.linkedSrId, itemId: item.itemId, pendingPurchaseQty: { gt: 0 } },
            orderBy: { createdAt: 'asc' },
          });
          const allocations = allocateReceiptToLines(
            srLines.map((l) => ({ id: l.id, pendingPurchaseQty: l.pendingPurchaseQty })),
            acceptedQty,
          );
          for (const alloc of allocations) {
            const srLine = srLines.find((l) => l.id === alloc.lineId)!;
            const updated = {
              ...srLine,
              availableQty: srLine.availableQty + alloc.allocQty,
              pendingPurchaseQty: srLine.pendingPurchaseQty - alloc.allocQty,
            };
            await tx.requestLine.update({
              where: { id: srLine.id },
              data: {
                availableQty: updated.availableQty,
                pendingPurchaseQty: updated.pendingPurchaseQty,
                fulfillmentStatus: deriveFulfillmentStatus(updated, updated.pendingPurchaseQty > 0),
              },
            });
            await reserveStock(tx, item.itemId, alloc.allocQty);
          }
        }

        grnLineItems.push({
          itemId: item.itemId,
          itemName: poItem.item.name,
          qty: item.qty,
          acceptedQty,
          rejectedQty
        });
      }

      // Check if all items are fully received
      const updatedPoItems = await tx.pOItem.findMany({ where: { purchaseOrderId: poId } });
      const allFullyReceived = updatedPoItems.every(x => x.receivedQty >= x.qty);
      const someReceived = updatedPoItems.some(x => x.receivedQty > 0);

      // Check if there is an invoice recorded for this PO
      const invoice = await tx.purchaseInvoice.findFirst({
        where: { purchaseOrderId: poId, status: { not: 'CANCELLED' } },
      });

      let nextStatus = allFullyReceived ? 'FULLY_RECEIVED' : (someReceived ? 'PARTIALLY_RECEIVED' : 'DRAFT');
      let notes = po.notes;

      if (invoice) {
        // Enforce 3-way match
        const orderedQty = updatedPoItems.reduce((sum, item) => sum + item.qty, 0);
        const receivedQty = updatedPoItems.reduce((sum, item) => sum + item.receivedQty, 0);
        const orderedAmount = po.totalAmount;
        const invoicedAmount = invoice.amount;

        const match = threeWayMatch({
          orderedQty,
          receivedQty,
          orderedAmount,
          invoicedAmount,
        });

        if (!match.matched) {
          nextStatus = 'NEEDS_REVIEW';
          notes = `3-Way Match Mismatch: ${match.discrepancies.join(', ')}`;
        } else {
          nextStatus = 'CLOSED';
          notes = '3-Way Match Succeeded. PO Closed.';
        }
      } else {
        // Invoice is pending verification
        nextStatus = 'INVOICE_PENDING';
        notes = 'Received goods; pending vendor invoice upload for 3-way match verification.';
      }

      // Update PO status
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: nextStatus,
          notes,
          receivedAt: new Date(),
        },
      });

      // Received stock makes the requisition issuable again — re-roll its header.
      if (po.linkedSrId) {
        const srFresh = await tx.requestLine.findMany({ where: { requestId: po.linkedSrId } });
        await tx.request.update({
          where: { id: po.linkedSrId },
          data: { status: rollupRequestStatus(srFresh) },
        });
      }

      // Audit logs for receiving
      for (const line of grnLineItems) {
        await tx.auditLog.create({
          data: {
            action: 'GRN_RECEIVED',
            userId: auth.user?.id,
            userName: auth.user?.name,
            targetId: line.itemId,
            targetName: line.itemName,
            metadata: JSON.stringify({
              grnNumber,
              poNumber: po.poNumber,
              qty: line.qty,
              acceptedQty: line.acceptedQty,
              rejectedQty: line.rejectedQty,
              status: nextStatus,
            }),
            ip: request.headers.get('x-forwarded-for') || '127.0.0.1',
          },
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id: poId },
        include: { supplier: true, items: { include: { item: true } } },
      });
    });

    return NextResponse.json({ po: result });
  } catch (error) {
    return handleApiError(error);
  }
}
