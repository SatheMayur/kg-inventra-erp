import type { Prisma } from '@prisma/client';
import { ApiError } from './api-utils';
import { resolveSubType, type MovementSubType } from './movement-subtype';

type Tx = Prisma.TransactionClient;

/**
 * Single source of truth for stock movement. Use inside a db.$transaction so the
 * read-check-write is atomic. Increments/decrements Item.stock, bumps the
 * optimistic-concurrency `version`, and writes the matching IN/OUT Transaction
 * ledger row. Previously this logic was copy-pasted across restock, issue,
 * transfer-confirm and (missing in) checkout — divergence caused integrity bugs.
 *
 * @param delta positive = stock IN, negative = stock OUT
 */
export async function mutateStock(
  tx: Tx,
  opts: {
    itemId: string;
    delta: number;
    reference: string;
    userId?: string | null;
    /** Optional optimistic-concurrency guard. */
    expectedVersion?: number;
    /** Override the ledger type; defaults from the sign of delta. */
    type?: 'IN' | 'OUT';
    /** Ledger movement classification; defaults to ADJUST. */
    subType?: MovementSubType;
    /** Optional reference classification for reporting. */
    referenceType?: string;
    remarks?: string;
  }
) {
  if (!Number.isFinite(opts.delta) || opts.delta === 0) {
    throw new ApiError(400, 'Stock change must be a non-zero number', 'BAD_REQUEST');
  }

  const item = await tx.item.findUnique({ where: { id: opts.itemId } });
  if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

  if (opts.expectedVersion !== undefined && item.version !== opts.expectedVersion) {
    throw new ApiError(409, 'Item has been modified since it was last read', 'CONFLICT');
  }

  if (opts.delta < 0 && item.stock + opts.delta < 0) {
    throw new ApiError(409, `Insufficient stock. Current stock: ${item.stock}`, 'CONFLICT');
  }

  // version in the where clause makes the update fail (P2025) if another
  // writer changed the row between our read and write — optimistic lock.
  const after = await tx.item.update({
    where: { id: opts.itemId, version: opts.expectedVersion ?? item.version },
    data: { stock: { increment: opts.delta }, version: { increment: 1 } },
  });

  await tx.transaction.create({
    data: {
      type: opts.type ?? (opts.delta > 0 ? 'IN' : 'OUT'),
      subType: resolveSubType(opts.subType),
      itemId: opts.itemId,
      itemName: item.name,
      qty: Math.abs(opts.delta),
      balanceAfter: after.stock,
      referenceType: opts.referenceType ?? null,
      reference: opts.reference,
      userId: opts.userId ?? null,
      remarks: opts.remarks ?? null,
    },
  });

  // Low stock check: if stock drops below minStock and delta was negative
  if (opts.delta < 0 && after.stock <= item.minStock) {
    try {
      const admins = await tx.user.findMany({
        where: { role: 'admin', active: true, phone: { not: null } }
      });
      for (const admin of admins) {
        const adminPhone = admin.phone!.replace(/\D/g, '');
        if (adminPhone) {
          await tx.whatsAppMessage.create({
            data: {
              phone: `${adminPhone}@s.whatsapp.net`,
              message: `⚠️ Low Stock Alert: "${item.name}" has dropped below its reorder point of ${item.minStock} ${item.unit}. Current physical stock: ${after.stock} ${item.unit}.`,
              direction: 'OUTBOUND',
              status: 'PENDING'
            }
          });
        }
      }
    } catch (alertErr) {
      console.error('⚠️ Failed to queue low stock alert:', alertErr);
    }
  }

  return { before: item, after };
}

/**
 * Atomically release a reservation hold on an item. Used when a pending request
 * is rejected or cancelled. Atomic decrement is race-safe inside a transaction
 * and replaces the previous read-then-Math.max write that could lose updates.
 */
export async function releaseReservation(tx: Tx, itemId: string, qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) return;
  await tx.item.update({
    where: { id: itemId },
    data: { reservedQty: { decrement: qty } },
  });
}

/**
 * Atomically place a reservation hold on an item. Symmetric to releaseReservation.
 * Used when GRN-received stock is re-earmarked to the originating requisition line.
 */
export async function reserveStock(tx: Tx, itemId: string, qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) return;
  await tx.item.update({
    where: { id: itemId },
    data: { reservedQty: { increment: qty } },
  });
}

type Numbered =
  | 'purchaseOrder'
  | 'stockTransfer'
  | 'gatePass'
  | 'deliveryChallan'
  | 'purchaseInvoice';

/**
 * Generate the next sequential document number (e.g. PO-001). Centralises the
 * count+padStart pattern that was copy-pasted across PO, transfer, gate-pass,
 * challan and invoice creation. The underlying number columns are @unique, so a
 * rare concurrent collision surfaces as a P2002 the caller can retry/translate.
 */
export async function nextSequentialNumber(
  tx: Tx,
  model: Numbered,
  prefix: string
): Promise<string> {
  const count: number = await (tx as any)[model].count();
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}
