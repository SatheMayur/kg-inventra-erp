import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import {
  DAILY_ALLOCATION_STATUS,
  DAILY_MESSAGE_STATUS,
  DAILY_PROCUREMENT_STATUS,
  DAILY_SUPPLY_ORDER_STATUS,
  buildDailySupplyOrderMessage,
  canManageDailyProcurement,
  normalizeWhatsAppPhone,
} from '@/lib/daily-procurement'

const sendOrdersSchema = z.object({
  supplyOrderIds: z.array(z.string().min(1)).optional(),
})

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
    const payload = sendOrdersSchema.parse(await request.json().catch(() => ({})))
    const selectedOrderIds = payload.supplyOrderIds && payload.supplyOrderIds.length > 0
      ? new Set(payload.supplyOrderIds)
      : null

    const result = await db.$transaction(async (tx) => {
      const batch = await tx.dailyProcurementBatch.findFirst({
        where: { OR: [{ id }, { batchNumber: id }] },
        include: {
          supplyOrders: {
            include: { supplier: true, lines: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!batch) throw new ApiError(404, 'Daily Procurement Batch not found', 'NOT_FOUND')
      if (![DAILY_PROCUREMENT_STATUS.APPROVED, DAILY_PROCUREMENT_STATUS.SUPPLY_ORDERED].includes(batch.status as any)) {
        throw new ApiError(400, `Daily Supply Orders can be sent only after commercial approval. Current status: ${batch.status}`, 'BAD_REQUEST')
      }

      const orders = batch.supplyOrders.filter((order: any) => !selectedOrderIds || selectedOrderIds.has(order.id))
      if (orders.length === 0) {
        throw new ApiError(400, 'No Daily Supply Orders are available to send', 'BAD_REQUEST')
      }

      for (const order of orders) {
        if (order.whatsappMessageId) continue
        const phone = normalizeWhatsAppPhone(order.supplier.phone || order.supplier.contact)
        if (!phone) {
          throw new ApiError(400, `Supplier ${order.supplier.name} does not have a WhatsApp phone number`, 'BAD_REQUEST')
        }
      }

      const sentOrders: any[] = []
      for (const order of orders) {
        if (order.whatsappMessageId) {
          sentOrders.push(order)
          continue
        }

        const phone = normalizeWhatsAppPhone(order.supplier.phone || order.supplier.contact)!
        const message = buildDailySupplyOrderMessage({
          reference: order.whatsappReference,
          batchNumber: batch.batchNumber,
          orderNumber: order.orderNumber,
          deliveryDate: order.deliveryDate?.toISOString().slice(0, 10),
          deliveryLocation: order.deliveryLocation,
          deliveryTimeSlot: order.deliveryTimeSlot,
          lines: order.lines.map((line: any) => ({
            itemName: line.itemName,
            orderedQty: line.orderedQty,
            unit: line.unit,
            rate: line.rate,
          })),
        })
        const whatsappMessage = await tx.whatsAppMessage.create({
          data: {
            phone,
            message,
            direction: 'OUTBOUND',
            status: 'PENDING',
            senderName: `${order.supplier.name} (Supplier)`,
          },
        })
        const updatedOrder = await tx.dailySupplyOrder.update({
          where: { id: order.id },
          data: {
            whatsappMessageId: whatsappMessage.id,
            status: DAILY_SUPPLY_ORDER_STATUS.QUEUED,
            messageStatus: DAILY_MESSAGE_STATUS.QUEUED,
            sentAt: new Date(),
          },
          include: { supplier: true, lines: true },
        })
        await tx.dailyVendorAllocation.updateMany({
          where: { id: { in: order.lines.map((line: any) => line.allocationId) } },
          data: { status: DAILY_ALLOCATION_STATUS.ORDERED },
        })
        sentOrders.push(updatedOrder)
      }

      const updatedBatch = await tx.dailyProcurementBatch.update({
        where: { id: batch.id },
        data: { status: DAILY_PROCUREMENT_STATUS.SUPPLY_ORDERED, version: { increment: 1 } },
        include: {
          lines: { include: { allocations: { include: { supplier: true, quote: true } } } },
          allocations: { include: { supplier: true, quote: true } },
          enquiries: { include: { supplier: true, lines: { include: { quotes: true } } } },
          supplyOrders: { include: { supplier: true, lines: true } },
        },
      })

      return { batch: updatedBatch, sentOrders }
    })

    await createAuditLog({
      action: 'SEND_DAILY_SUPPLY_ORDER' as any,
      user,
      targetId: result.batch.id,
      targetName: result.batch.batchNumber,
      metadata: { orders: result.sentOrders.length },
    })

    return NextResponse.json({ batch: result.batch, supplyOrders: result.sentOrders })
  } catch (error) {
    return handleApiError(error)
  }
}
