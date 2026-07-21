import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { getKolkataDateString } from '@/lib/date-utils'
import { approveStep, startApproval } from '@/lib/approvals/engine'
import { generateConversationSupplyOrders } from '@/lib/daily-confirmation'
import {
  DAILY_ALLOCATION_STATUS,
  DAILY_PROCUREMENT_MODULE,
  DAILY_PROCUREMENT_STATUS,
  DAILY_SUPPLY_ORDER_STATUS,
  buildDocumentReference,
  canManageDailyProcurement,
  roundMoney,
} from '@/lib/daily-procurement'

function includeBatch() {
  return {
    lines: { include: { allocations: { include: { supplier: true, quote: true } } } },
    allocations: { include: { supplier: true, quote: true, batchLine: true } },
    enquiries: { include: { supplier: true, lines: { include: { quotes: true } } } },
    supplyOrders: { include: { supplier: true, lines: true } },
    conversations: { include: { supplier: true, lines: true } },
  } as const
}

async function nextSupplyOrderNumber(tx: any, sequence: number) {
  const date = getKolkataDateString().replace(/-/g, '')
  const prefix = `DSO-${date}`
  const count = await tx.dailySupplyOrder.count({ where: { orderNumber: { startsWith: prefix } } })
  return `${prefix}-${String(count + sequence).padStart(3, '0')}`
}

function validateBatchAllocation(batch: any) {
  if (![DAILY_PROCUREMENT_STATUS.ALLOCATION_READY, DAILY_PROCUREMENT_STATUS.PENDING_APPROVAL].includes(batch.status)) {
    throw new ApiError(400, `Daily Procurement Batch cannot be approved from status ${batch.status}`, 'BAD_REQUEST')
  }
  if (!batch.allocations.length) {
    throw new ApiError(400, 'Daily Procurement Batch requires at least one vendor allocation before approval', 'BAD_REQUEST')
  }

  for (const line of batch.lines) {
    if (line.finalPurchaseQty <= 0) continue
    const allocatedQty = line.allocations
      .filter((allocation: any) => allocation.status !== DAILY_ALLOCATION_STATUS.CANCELLED)
      .reduce((sum: number, allocation: any) => sum + allocation.allocatedQty, 0)
    if (Math.abs(allocatedQty - line.finalPurchaseQty) > 0.001) {
      throw new ApiError(
        400,
        `Daily Procurement line ${line.itemName} must be fully allocated before approval. Required ${line.finalPurchaseQty}, allocated ${allocatedQty}.`,
        'BAD_REQUEST',
      )
    }
  }
}

async function generateSupplyOrders(tx: any, batch: any, userName: string) {
  const existing = await tx.dailySupplyOrder.findMany({ where: { batchId: batch.id }, include: { lines: true, supplier: true } })
  if (existing.length > 0) return existing

  const groups = new Map<string, any[]>()
  for (const allocation of batch.allocations) {
    if (allocation.status === DAILY_ALLOCATION_STATUS.CANCELLED) continue
    const group = groups.get(allocation.supplierId) ?? []
    group.push(allocation)
    groups.set(allocation.supplierId, group)
  }

  const orders: any[] = []
  let sequence = 1
  for (const [supplierId, allocations] of groups) {
    const orderNumber = await nextSupplyOrderNumber(tx, sequence)
    sequence += 1
    const reference = buildDocumentReference('DSO', batch.batchNumber)

    const order = await tx.dailySupplyOrder.create({
      data: {
        orderNumber,
        batchId: batch.id,
        supplierId,
        status: DAILY_SUPPLY_ORDER_STATUS.APPROVED,
        whatsappReference: reference,
        messageStatus: 'DRAFT',
        businessConfirmationStatus: 'AWAITING_CONFIRMATION',
        deliveryLocation: batch.deliveryLocation,
        deliveryDate: batch.deliveryDate,
        deliveryTimeSlot: batch.deliveryTimeSlot,
        createdBy: userName,
        approvedBy: userName,
        approvedAt: new Date(),
        lines: {
          create: allocations.map((allocation: any) => ({
            allocationId: allocation.id,
            itemId: allocation.itemId,
            itemName: allocation.batchLine.itemName,
            orderedQty: allocation.allocatedQty,
            unit: allocation.unit,
            rate: allocation.normalizedRate,
            taxRate: allocation.taxRate,
            transportCharge: allocation.transportCharge,
          })),
        },
      },
      include: { supplier: true, lines: true },
    })
    orders.push(order)
  }

  return orders
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.user
    if (!user || !canManageDailyProcurement(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const remarks = typeof body.remarks === 'string' && body.remarks.trim() ? body.remarks.trim() : 'Approved'

    const result = await db.$transaction(async (tx) => {
      const batch = await tx.dailyProcurementBatch.findFirst({
        where: { OR: [{ id }, { batchNumber: id }] },
        include: includeBatch(),
      })
      if (!batch) throw new ApiError(404, 'Daily Procurement Batch not found', 'NOT_FOUND')

      if (batch.status === DAILY_PROCUREMENT_STATUS.APPROVED || batch.status === DAILY_PROCUREMENT_STATUS.SUPPLY_ORDERED) {
        return { batch, changed: false, amount: batch.allocations.reduce((sum: number, allocation: any) => sum + allocation.allocatedQty * allocation.landedRate, 0) }
      }

      const conversationMode = batch.conversations.some((conversation: any) =>
        conversation.lines.some((line: any) => line.confirmedQty > 0 || line.cancelledQty > 0),
      )
      if (!conversationMode) validateBatchAllocation(batch)
      if (conversationMode && batch.status !== DAILY_PROCUREMENT_STATUS.PENDING_APPROVAL) {
        throw new ApiError(400, `Daily Procurement Batch cannot be approved from status ${batch.status}`, 'BAD_REQUEST')
      }

      const amount = roundMoney(conversationMode
        ? batch.conversations.reduce((sum: number, conversation: any) => sum + conversation.lines.reduce(
            (lineSum: number, line: any) => lineSum + line.confirmedQty * (line.vendorRate ?? 0),
            0,
          ), 0)
        : batch.allocations.reduce((sum: number, allocation: any) => sum + allocation.allocatedQty * allocation.landedRate, 0))

      let instance = await tx.approvalInstance.findFirst({
        where: { moduleName: DAILY_PROCUREMENT_MODULE, documentId: batch.id },
        orderBy: { createdAt: 'desc' },
        include: { steps: true },
      })

      if (!instance) {
        instance = await startApproval(tx, {
          moduleName: DAILY_PROCUREMENT_MODULE,
          documentType: DAILY_PROCUREMENT_MODULE,
          documentId: batch.id,
          createdById: batch.createdById ?? user.id,
          ctx: { amount },
        })
      }

      let approved = instance.status === 'APPROVED'
      if (!approved) {
        if (instance.status !== 'PENDING_APPROVAL') {
          throw new ApiError(400, 'This Daily Procurement Batch is no longer pending approval', 'BAD_REQUEST')
        }
        const { instance: updatedInstance } = await approveStep(tx, {
          instanceId: instance.id,
          user: {
            id: user.id,
            role: user.role,
            isDeptHead: user.isDeptHead,
          },
          remarks,
        })
        approved = updatedInstance.status === 'APPROVED'
      }

      await tx.approvalLog.create({
        data: {
          userId: user.id,
          userName: user.name,
          role: user.role,
          action: 'APPROVE',
          remarks,
          amount,
        },
      })

      if (!approved) {
        const pendingBatch = await tx.dailyProcurementBatch.update({
          where: { id: batch.id },
          data: { status: DAILY_PROCUREMENT_STATUS.PENDING_APPROVAL, version: { increment: 1 } },
          include: includeBatch(),
        })
        return { batch: pendingBatch, changed: true, amount }
      }

      if (!conversationMode) {
        await tx.dailyVendorAllocation.updateMany({
          where: { batchId: batch.id, status: DAILY_ALLOCATION_STATUS.PROPOSED },
          data: { status: DAILY_ALLOCATION_STATUS.APPROVED, approvedBy: user.name, approvedAt: new Date() },
        })
      }
      const approvedBatch = await tx.dailyProcurementBatch.update({
        where: { id: batch.id },
        data: {
          status: DAILY_PROCUREMENT_STATUS.APPROVED,
          approvedBy: user.name,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
        include: includeBatch(),
      })

      if (conversationMode) {
        await generateConversationSupplyOrders(tx, approvedBatch.id, { id: user.id, name: user.name })
      } else {
        await generateSupplyOrders(tx, approvedBatch, user.name)
      }

      const freshBatch = await tx.dailyProcurementBatch.findUnique({
        where: { id: batch.id },
        include: includeBatch(),
      })
      if (!freshBatch) throw new ApiError(404, 'Daily Procurement Batch not found after approval', 'NOT_FOUND')

      return { batch: freshBatch, changed: true, amount }
    })

    if (result.changed) {
      await createAuditLog({
        action: 'APPROVE_DAILY_PROCUREMENT_BATCH' as any,
        user,
        targetId: result.batch.id,
        targetName: result.batch.batchNumber,
        metadata: { amount: result.amount, status: result.batch.status },
      })
    }

    return NextResponse.json({ batch: result.batch })
  } catch (error) {
    return handleApiError(error)
  }
}
