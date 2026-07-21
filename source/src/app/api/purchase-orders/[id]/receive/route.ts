import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { mutateStock, reserveStock, nextSequentialNumber } from '@/lib/stock';
import { allocateReceiptToLines, deriveFulfillmentStatus, rollupRequestStatus } from '@/lib/request-fulfillment';
import { threeWayMatch } from '@/lib/three-way-match';
import { getKolkataDateString } from '@/lib/date-utils';
import { PO_STATUS, RECEIVABLE_STATUSES, type PoStatus } from '@/lib/po-status';
import { z } from 'zod';

const receiveSchema = z.object({
  remarks: z.string().max(500).optional(),
  deliveryTime: z.string().optional(),
  challanNumber: z.string().max(100).optional(),
  invoiceNumber: z.string().max(100).optional(),
  attachments: z.array(z.record(z.string(), z.unknown())).optional(),
  allowExcess: z.boolean().default(false),
  items: z.array(z.object({
    itemId: z.string().min(1),
    qty: z.number().positive().optional(),
    grossWeight: z.number().nonnegative().optional(),
    containerWeight: z.number().nonnegative().optional(),
    rejectedQty: z.number().nonnegative().optional(),
    qualityResult: z.enum(['ACCEPTED', 'PARTIAL', 'REJECTED']).optional(),
    rejectionReason: z.string().max(500).optional(),
    remarks: z.string().max(500).optional(),
  }).refine((line) => line.qty !== undefined || line.grossWeight !== undefined, {
    message: 'Enter delivered quantity or gross weight',
  })).min(1).optional(),
});

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
    const body = receiveSchema.parse(await request.json().catch(() => ({})));
    const remarks = body.remarks?.trim() || null;

    const result = await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: poId },
        include: {
          items: { include: { item: true } },
          dailySupplyOrder: { include: { lines: true, conversation: true } },
        },
      });
      if (!po) throw new ApiError(404, 'Purchase Order not found', 'NOT_FOUND');

      if (po.status === PO_STATUS.CLOSED) {
        throw new ApiError(409, 'Purchase Order is already closed', 'CONFLICT');
      }

      if (!RECEIVABLE_STATUSES.includes(po.status as any)) {
        throw new ApiError(400, `PO must be approved before receiving goods (current status: ${po.status})`, 'BAD_REQUEST');
      }

      // Resolve items and quantities being received
      const receivedInput = body.items ?? [];
      
      const receivedItems: any[] = receivedInput.length > 0 ? receivedInput : po.items.map(item => ({
        itemId: item.itemId,
        qty: item.qty - item.receivedQty,
        rejectedQty: 0,
        remarks: null
      })).filter((item) => item.qty > 0);

      if (receivedItems.length === 0) {
        throw new ApiError(400, 'No items specified to receive', 'BAD_REQUEST');
      }

      const receivedItemIds = new Set<string>();
      for (const item of receivedItems) {
        if (receivedItemIds.has(item.itemId)) {
          throw new ApiError(400, `Item ${item.itemId} appears more than once in the receipt`, 'BAD_REQUEST');
        }
        receivedItemIds.add(item.itemId);
      }

      // Generate GRN Number: GRN-YYYYMMDD-XXX
      const date = getKolkataDateString().replace(/-/g, '');
      const grnNumber = await nextSequentialNumber(tx, 'goodsReceipt', `GRN-${date}`);

      // Create GoodsReceipt header
      const goodsReceipt = await tx.goodsReceipt.create({
        data: {
          grnNumber,
          purchaseOrderId: poId,
          supplierId: po.supplierId,
          receivedBy: auth.user!.name,
          remarks,
          deliveryTime: body.deliveryTime ? new Date(body.deliveryTime) : null,
          challanNumber: body.challanNumber?.trim() || null,
          invoiceNumber: body.invoiceNumber?.trim() || null,
          attachmentMetadata: (body.attachments as any) ?? undefined,
        }
      });

      const grnLineItems: any[] = [];
      let allocatedToLinkedSrQty = 0;

      for (const item of receivedItems) {
        const grossWeight = item.grossWeight ?? null;
        const containerWeight = item.containerWeight ?? 0;
        if (grossWeight !== null && containerWeight > grossWeight) {
          throw new ApiError(400, 'Container weight cannot exceed gross weight', 'BAD_REQUEST');
        }
        const deliveredQty = grossWeight !== null ? grossWeight - containerWeight : item.qty!;
        if (!item.itemId || typeof deliveredQty !== 'number' || deliveredQty <= 0) {
          throw new ApiError(400, `Each line needs itemId and qty > 0`, 'BAD_REQUEST');
        }

        const poItem = po.items.find(x => x.itemId === item.itemId);
        if (!poItem) {
          throw new ApiError(400, `Item ${item.itemId} does not belong to this Purchase Order`, 'BAD_REQUEST');
        }

        const remaining = poItem.qty - poItem.receivedQty;
        
        // Over-Receiving check
        const canOverrideExcess = auth.user?.role === 'admin' || auth.user?.role === 'STORE_ADMIN';
        if (deliveredQty > remaining && (!body.allowExcess || !canOverrideExcess)) {
          throw new ApiError(400, `Delivered quantity (${deliveredQty}) exceeds the remaining confirmed quantity (${remaining}) for ${poItem.item.name}. An authorized excess override is required.`, 'BAD_REQUEST');
        }

        const rejectedQty = item.rejectedQty || 0;
        if (rejectedQty < 0 || rejectedQty > deliveredQty) {
          throw new ApiError(400, 'Rejected quantity must be between 0 and received quantity', 'BAD_REQUEST');
        }
        const acceptedQty = deliveredQty - rejectedQty;
        const shortQty = Math.max(0, remaining - deliveredQty);
        const excessQty = Math.max(0, deliveredQty - remaining);

        // Create GoodsReceiptItem
        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: goodsReceipt.id,
            itemId: item.itemId,
            orderedQty: poItem.qty,
            receivedQty: deliveredQty,
            rejectedQty,
            acceptedQty,
            grossWeight,
            containerWeight: grossWeight !== null ? containerWeight : null,
            netReceivedQty: deliveredQty,
            shortQty,
            excessQty,
            qualityResult: item.qualityResult ?? (rejectedQty === 0 ? 'ACCEPTED' : acceptedQty > 0 ? 'PARTIAL' : 'REJECTED'),
            rejectionReason: item.rejectionReason?.trim() || null,
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
        const updateResult = await tx.pOItem.updateMany({
          where: { id: poItem.id, receivedQty: poItem.receivedQty },
          data: { receivedQty: { increment: deliveredQty } }
        });
        if (updateResult.count !== 1) {
          throw new ApiError(409, `Receipt changed concurrently for item ${poItem.item.name}`, 'CONFLICT');
        }

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
            allocatedToLinkedSrQty += alloc.allocQty;
          }
        }

        grnLineItems.push({
          itemId: item.itemId,
          itemName: poItem.item.name,
          qty: deliveredQty,
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

      let nextStatus: PoStatus = allFullyReceived ? PO_STATUS.FULLY_RECEIVED : (someReceived ? PO_STATUS.PARTIALLY_RECEIVED : PO_STATUS.DRAFT);
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
          nextStatus = PO_STATUS.NEEDS_REVIEW;
          notes = `3-Way Match Mismatch: ${match.discrepancies.join(', ')}`;
        } else if (allFullyReceived) {
          nextStatus = PO_STATUS.CLOSED;
          notes = '3-Way Match Succeeded. PO Closed.';
        }
      } else if (allFullyReceived) {
        // All goods received but no invoice yet — await vendor invoice
        nextStatus = PO_STATUS.INVOICE_PENDING;
        notes = 'Fully received; pending vendor invoice upload for 3-way match verification.';
      }
      // else: partial receive — keep PARTIALLY_RECEIVED status as-is

      // Update PO status
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: nextStatus,
          notes,
          receivedAt: new Date(),
        },
      });

      if (po.dailySupplyOrder) {
        for (const line of grnLineItems) {
          await tx.dailySupplyOrderLine.updateMany({
            where: { supplyOrderId: po.dailySupplyOrder.id, itemId: line.itemId },
            data: {
              acceptedQty: { increment: line.acceptedQty },
              rejectedQty: { increment: line.rejectedQty },
            },
          });
        }
        const snapshotLines = await tx.dailySupplyOrderLine.findMany({
          where: { supplyOrderId: po.dailySupplyOrder.id },
        });
        const received = snapshotLines.every((line) => line.acceptedQty >= line.orderedQty);
        await tx.dailySupplyOrder.update({
          where: { id: po.dailySupplyOrder.id },
          data: { status: received ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
        });
        if (po.dailySupplyOrder.conversationId) {
          for (const line of snapshotLines) {
            await tx.dailyConversationLine.updateMany({
              where: { conversationId: po.dailySupplyOrder.conversationId, itemId: line.itemId },
              data: { status: line.acceptedQty >= line.orderedQty ? 'RECEIVED' : 'READY_FOR_RECEIVING' },
            });
          }
          await tx.dailyProcurementConversation.update({
            where: { id: po.dailySupplyOrder.conversationId },
            data: { status: received ? 'RECEIVED' : 'READY_FOR_RECEIVING', lastMessageAt: new Date() },
          });
        }
        const batchOrders = await tx.dailySupplyOrder.findMany({ where: { batchId: po.dailySupplyOrder.batchId } });
        const allReceived = batchOrders.every((order) =>
          order.id === po.dailySupplyOrder!.id ? received : order.status === 'RECEIVED',
        );
        await tx.dailyProcurementBatch.update({
          where: { id: po.dailySupplyOrder.batchId },
          data: { status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED', version: { increment: 1 } },
        });
      }

      // Received stock makes the requisition issuable again — re-roll its header.
      if (po.linkedSrId) {
        const srFresh = await tx.requestLine.findMany({ where: { requestId: po.linkedSrId } });
        const srStatus = rollupRequestStatus(srFresh);
        await tx.request.update({
          where: { id: po.linkedSrId },
          data: { status: srStatus },
        });

        if (allocatedToLinkedSrQty > 0) {
          const linkedSr = await tx.request.findUnique({
            where: { id: po.linkedSrId },
            select: { id: true, requestNumber: true, userId: true },
          });

          if (linkedSr) {
            const readyQty = srFresh.reduce((sum, line) => sum + Math.max(0, line.availableQty - line.issuedQty), 0);
            const pendingQty = srFresh.reduce((sum, line) => sum + Math.max(0, line.pendingPurchaseQty), 0);
            const requestRef = linkedSr.requestNumber || linkedSr.id.slice(0, 8).toUpperCase();
            const storeUsers = await tx.user.findMany({
              where: { active: true, role: { in: ['admin', 'STORE_ADMIN', 'STORE_OPERATOR'] } },
              select: { id: true },
            });
            const notificationUserIds = new Set<string>([linkedSr.userId, ...storeUsers.map((u) => u.id)]);
            const title = pendingQty > 0 ? 'Partial Stock Ready to Issue' : 'Request Ready to Issue';
            const message = pendingQty > 0
              ? `PO ${po.poNumber} receipt reserved ${allocatedToLinkedSrQty} item(s) for request ${requestRef}. ${readyQty} item(s) are ready now; ${pendingQty} item(s) are still pending purchase.`
              : `PO ${po.poNumber} receipt completed request ${requestRef}. ${readyQty} item(s) are reserved and ready to issue.`;

            for (const userId of notificationUserIds) {
              await tx.notification.create({
                data: {
                  userId,
                  title,
                  message,
                  type: pendingQty > 0 ? 'warning' : 'success',
                  link: 'requests',
                },
              });
            }
          }
        }
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
