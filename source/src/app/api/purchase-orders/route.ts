import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { getKolkataDateString } from '@/lib/date-utils';
import { PO_STATUS } from '@/lib/po-status';
import { isSupplierUsableForPo } from '@/lib/supplier-dedupe';
import { z } from 'zod';
import { startApproval, isApproved } from '@/lib/approvals/engine';

const poCreateSchema = z.object({
  linkedSrId: z.string().min(1, 'Purchase Order must be linked to a Store Requisition'),
  supplierId: z.string().min(1, 'Supplier is required'),
  notes: z.string().max(500).optional(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().max(200).optional(),
  tax: z.number().min(0).max(100).optional(),
  transportationCost: z.number().min(0).optional(),
  cgstRate: z.number().min(0).max(100).optional(),
  sgstRate: z.number().min(0).max(100).optional(),
  igstRate: z.number().min(0).max(100).optional(),
  items: z.array(z.object({
    itemId: z.string().min(1, 'Item ID is required'),
    qty: z.number().int().positive('Quantity must be > 0'),
    unitPrice: z.number().nonnegative('Unit price must be ≥ 0'),
    discount: z.number().min(0).max(100).optional(),
    taxRate: z.number().min(0).max(100).optional(),
  })).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin' && auth.user?.role !== 'STORE_ADMIN' && auth.user?.role !== 'PURCHASE_USER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

    const pos = await db.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: { include: { item: true } },
        linkedSr: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ pos });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin' && auth.user?.role !== 'STORE_ADMIN' && auth.user?.role !== 'PURCHASE_USER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const {
      linkedSrId,
      supplierId,
      notes,
      deliveryDate,
      paymentTerms,
      tax,
      transportationCost,
      cgstRate,
      sgstRate,
      igstRate,
      items: customItems,
    } = poCreateSchema.parse(await request.json());

    // Validate delivery date if provided
    if (deliveryDate) {
      const parsed = new Date(deliveryDate);
      if (isNaN(parsed.getTime())) {
        throw new ApiError(400, 'Invalid delivery date format', 'BAD_REQUEST');
      }
    }

    const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new ApiError(404, 'Supplier not found', 'NOT_FOUND');
    if (!isSupplierUsableForPo(supplier)) {
      throw new ApiError(400, 'Supplier is inactive or blocked and cannot be used for a Purchase Order', 'BAD_REQUEST');
    }

    const result = await db.$transaction(async (tx) => {
      const sr = await tx.request.findUnique({
        where: { id: linkedSrId },
        include: { lines: { include: { item: true } } }
      });
      if (!sr) throw new ApiError(404, 'Linked Store Requisition not found', 'NOT_FOUND');

      const srApproved = (sr.status === 'Approved') || (await isApproved('STORE_REQUISITION', linkedSrId));
      if (!srApproved) {
        throw new ApiError(400, 'Only approved Store Requisitions can be converted to Purchase Orders', 'BAD_REQUEST');
      }

      // Duplicate Prevention
      const existingPo = await tx.purchaseOrder.findFirst({
        where: { linkedSrId, status: { not: PO_STATUS.CANCELLED } }
      });
      if (existingPo) {
        throw new ApiError(400, `Purchase Order already exists for SR-${linkedSrId.slice(-6).toUpperCase()}`, 'BAD_REQUEST');
      }

      // Build PO items from requisition lines shortfall or custom items
      let poItems;
      if (customItems && customItems.length > 0) {
        const eligibleLines = sr.lines.filter((line) =>
          line.pendingPurchaseQty > 0 &&
          (line.fulfillmentStatus === 'PURCHASE_REQUIRED' || line.fulfillmentStatus === 'PARTIALLY_AVAILABLE') &&
          line.status !== 'Rejected' &&
          line.status !== 'Cancelled'
        );
        const pendingByItem = new Map<string, number>();
        for (const line of eligibleLines) {
          pendingByItem.set(line.itemId, (pendingByItem.get(line.itemId) ?? 0) + line.pendingPurchaseQty);
        }

        const submittedItemIds = new Set<string>();
        for (const item of customItems) {
          if (submittedItemIds.has(item.itemId)) {
            throw new ApiError(400, `Item ${item.itemId} appears more than once in the Purchase Order`, 'BAD_REQUEST');
          }
          submittedItemIds.add(item.itemId);

          const pendingQty = pendingByItem.get(item.itemId) ?? 0;
          if (pendingQty <= 0) {
            throw new ApiError(400, `Item ${item.itemId} has no approved purchase balance on the linked Store Requisition`, 'BAD_REQUEST');
          }
          if (item.qty > pendingQty) {
            throw new ApiError(
              400,
              `Purchase quantity (${item.qty}) exceeds the pending requisition quantity (${pendingQty}) for item ${item.itemId}`,
              'BAD_REQUEST',
            );
          }
        }

        // Validate all items exist in the Item table
        const itemIds = [...new Set(customItems.map(i => i.itemId))];
        const existingItems = await tx.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true }
        });
        const existingIds = new Set(existingItems.map(i => i.id));
        for (const item of customItems) {
          if (!existingIds.has(item.itemId)) {
            throw new ApiError(400, `Item ${item.itemId} does not exist`, 'NOT_FOUND');
          }
        }

        poItems = customItems.map(item => ({
          itemId: item.itemId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount ?? 0,
          taxRate: item.taxRate ?? 0
        }));
      } else {
        poItems = sr.lines
          .filter(line =>
            (line.fulfillmentStatus === 'PURCHASE_REQUIRED' || line.fulfillmentStatus === 'PARTIALLY_AVAILABLE') &&
            line.status !== 'Rejected' &&
            line.status !== 'Cancelled'
          )
          .map(line => {
            const orderedQty = line.pendingPurchaseQty || 0;
            return {
              itemId: line.itemId,
              qty: orderedQty,
              unitPrice: Math.max(0, Math.round(line.item.price || 0)),
              discount: 0,
              taxRate: 0
            };
          })
          .filter(item => item.qty > 0);
      }

      if (poItems.length === 0) {
        throw new ApiError(400, 'No shortfall items requiring purchase order in this requisition.', 'BAD_REQUEST');
      }

      // Generate PO Number: PO-YYYYMMDD-XXX
      const date = getKolkataDateString().replace(/-/g, '');
      const count = await tx.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${date}` } } });
      const poNumber = `PO-${date}-${(count + 1).toString().padStart(3, '0')}`;

      const transport = transportationCost ?? 0;
      const cgst = cgstRate ?? 0;
      const sgst = sgstRate ?? 0;
      const igst = igstRate ?? 0;
      const splitGstRate = cgst + sgst + igst;
      const headerTaxRate = splitGstRate > 0 ? splitGstRate : (tax ?? 0);

      // Calculate grand total: discounted lines + line tax + transport + header GST.
      const lineSubtotal = poItems.reduce((sum, i) => {
        const afterDiscount = i.qty * i.unitPrice * (1 - i.discount / 100);
        return sum + afterDiscount;
      }, 0);
      const lineTaxAmount = poItems.reduce((sum, i) => {
        const afterDiscount = i.qty * i.unitPrice * (1 - i.discount / 100);
        return sum + (afterDiscount * i.taxRate / 100);
      }, 0);
      const headerTaxableAmount = lineSubtotal + transport;
      const headerTaxAmount = headerTaxableAmount * (headerTaxRate / 100);
      const totalAmount = lineSubtotal + lineTaxAmount + transport + headerTaxAmount;

      // Create PO in DRAFT status
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          linkedSrId,
          notes: notes ?? null,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          paymentTerms: paymentTerms ?? supplier.paymentTerms ?? null,
          tax: headerTaxRate,
          transportationCost: transport,
          cgstRate: cgst,
          sgstRate: sgst,
          igstRate: igst,
          totalAmount,
          status: PO_STATUS.DRAFT as string,
          createdBy: auth.user!.name,
          items: {
            create: poItems.map((i) => ({
              itemId: i.itemId,
              qty: i.qty,
              unitPrice: i.unitPrice,
              discount: i.discount,
              taxRate: i.taxRate
            }))
          },
        },
        include: { supplier: true, items: { include: { item: true } } },
      });

      // Update SR status to CONVERTED_TO_PO
      await tx.request.update({
        where: { id: linkedSrId },
        data: { status: 'CONVERTED_TO_PO' }
      });

      // Log into approval logs as a draft creation
      await tx.approvalLog.create({
        data: {
          poId: po.id,
          userId: auth.user!.id,
          userName: auth.user!.name,
          role: auth.user!.role,
          action: 'SUBMIT',
          remarks: 'PO created from Store Requisition',
          amount: totalAmount,
        }
      });

      // Start PO approval workflow
      const approval = await startApproval(tx, {
        moduleName: 'PURCHASE_ORDER',
        documentType: 'PURCHASE_ORDER',
        documentId: po.id,
        createdById: auth.user!.id,
        ctx: { amount: totalAmount },
      });

      let finalPoStatus: string = PO_STATUS.DRAFT;
      if (approval.status === 'APPROVED') {
        finalPoStatus = PO_STATUS.APPROVED;
      } else {
        finalPoStatus = PO_STATUS.PENDING_APPROVAL;
      }

      if (finalPoStatus !== PO_STATUS.DRAFT) {
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: finalPoStatus },
        });
        po.status = finalPoStatus;
      }

      return po;
    });

    await createAuditLog({
      action: 'CREATE_PO' as AuditAction,
      user: auth.user,
      targetId: result.id,
      targetName: result.poNumber,
      metadata: { totalAmount: result.totalAmount, status: result.status },
    });

    return NextResponse.json({ po: result });
  } catch (error) {
    return handleApiError(error);
  }
}
