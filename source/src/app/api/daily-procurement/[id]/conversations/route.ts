import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import {
  DAILY_LINE_STATUS,
  DAILY_PROCUREMENT_STATUS,
  canManageDailyProcurement,
  canReadDailyProcurement,
  normalizeWhatsAppPhone,
  roundQty,
} from '@/lib/daily-procurement'
import {
  DAILY_CONVERSATION_STATUS,
  PROCUREMENT_MESSAGE_TYPE,
  buildRequirementMessage,
} from '@/lib/daily-conversations'
import { isSupplierUsableForPo } from '@/lib/supplier-dedupe'

const lineSchema = z.object({
  batchLineId: z.string().min(1),
  requestedQty: z.number().positive(),
})

const startConversationSchema = z.object({
  supplierId: z.string().min(1),
  lines: z.array(lineSchema).min(1),
  greeting: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  previewOnly: z.boolean().default(false),
})

const conversationInclude = {
  supplier: true,
  lines: {
    include: { item: true, batchLine: true },
    orderBy: { createdAt: 'asc' as const },
  },
  messages: { orderBy: { createdAt: 'asc' as const } },
  supplyOrders: { include: { lines: true }, orderBy: { createdAt: 'desc' as const } },
} as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!canReadDailyProcurement(auth.user?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const batch = await db.dailyProcurementBatch.findFirst({
      where: { OR: [{ id }, { batchNumber: id }] },
      select: { id: true },
    })
    if (!batch) throw new ApiError(404, 'Daily Procurement Requirement not found', 'NOT_FOUND')

    const conversations = await db.dailyProcurementConversation.findMany({
      where: { batchId: batch.id },
      include: conversationInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ conversations })
  } catch (error) {
    return handleApiError(error)
  }
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
    const payload = startConversationSchema.parse(await request.json())
    const batch = await db.dailyProcurementBatch.findFirst({
      where: { OR: [{ id }, { batchNumber: id }] },
      include: {
        lines: true,
        conversations: { include: { lines: true, messages: true } },
      },
    })
    if (!batch) throw new ApiError(404, 'Daily Procurement Requirement not found', 'NOT_FOUND')
    if ([DAILY_PROCUREMENT_STATUS.CLOSED, DAILY_PROCUREMENT_STATUS.CANCELLED].includes(batch.status as any)) {
      throw new ApiError(400, `Cannot start a conversation for a ${batch.status.toLowerCase()} requirement`, 'BAD_REQUEST')
    }

    const supplier = await db.supplier.findUnique({ where: { id: payload.supplierId } })
    if (!supplier) throw new ApiError(404, 'Supplier not found', 'NOT_FOUND')
    if (!isSupplierUsableForPo(supplier)) {
      throw new ApiError(400, `${supplier.name} is inactive or blocked`, 'BAD_REQUEST')
    }
    const phone = normalizeWhatsAppPhone(supplier.phone || supplier.contact)
    if (!phone) throw new ApiError(400, `${supplier.name} does not have a valid WhatsApp number`, 'BAD_REQUEST')

    const batchLineById = new Map(batch.lines.map((line) => [line.id, line]))
    const requestedByLine = new Map<string, number>()
    for (const requested of payload.lines) {
      const line = batchLineById.get(requested.batchLineId)
      if (!line) throw new ApiError(400, 'One or more selected items do not belong to this requirement', 'BAD_REQUEST')
      requestedByLine.set(requested.batchLineId, roundQty((requestedByLine.get(requested.batchLineId) ?? 0) + requested.requestedQty))
    }

    for (const [batchLineId, requestedQty] of requestedByLine) {
      const line = batchLineById.get(batchLineId)!
      const alreadyAssigned = batch.conversations
        .filter((conversation) => conversation.supplierId !== supplier.id && conversation.status !== DAILY_CONVERSATION_STATUS.CANCELLED)
        .flatMap((conversation) => conversation.lines)
        .filter((conversationLine) => conversationLine.batchLineId === batchLineId)
        .reduce((sum, conversationLine) => sum + conversationLine.requestedQty, 0)
      if (alreadyAssigned + requestedQty - line.finalPurchaseQty > 0.001) {
        throw new ApiError(
          400,
          `${line.itemName} assignment exceeds the remaining requirement. Remaining: ${roundQty(line.finalPurchaseQty - alreadyAssigned)} ${line.unit}`,
          'BAD_REQUEST',
        )
      }
    }

    const messageLines = [...requestedByLine].map(([batchLineId, requestedQty]) => {
      const line = batchLineById.get(batchLineId)!
      return {
        itemName: line.itemName,
        requestedQty,
        unit: line.unit,
        qualityGrade: line.qualityGrade,
        notes: line.notes || line.itemSpec,
      }
    })
    const message = buildRequirementMessage({
      vendorName: supplier.name,
      requirementReference: batch.batchNumber,
      deliveryDate: batch.deliveryDate.toISOString().slice(0, 10),
      deliveryTime: batch.deliveryTimeSlot,
      deliveryLocation: batch.deliveryLocation,
      greeting: payload.greeting,
      notes: payload.notes,
      lines: messageLines,
    })

    if (payload.previewOnly) {
      return NextResponse.json({ preview: message, protectedLines: messageLines })
    }

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.dailyProcurementConversation.findUnique({
        where: { batchId_supplierId: { batchId: batch.id, supplierId: supplier.id } },
        include: conversationInclude,
      })
      const existingRequirementMessage = existing?.messages.find((entry) =>
        entry.messageType === PROCUREMENT_MESSAGE_TYPE.REQUIREMENT_SENT && entry.status !== 'FAILED',
      )
      if (existingRequirementMessage) {
        return { conversation: existing, duplicate: true }
      }

      const conversation = existing
        ? await tx.dailyProcurementConversation.update({
            where: { id: existing.id },
            data: {
              normalizedPhone: phone,
              status: DAILY_CONVERSATION_STATUS.AWAITING_VENDOR_REPLY,
              sentAt: new Date(),
              lastMessageAt: new Date(),
              notes: payload.notes ?? existing.notes,
              revision: { increment: 1 },
              lines: {
                deleteMany: {},
                create: [...requestedByLine].map(([batchLineId, requestedQty]) => ({
                  batchLineId,
                  itemId: batchLineById.get(batchLineId)!.itemId,
                  requestedQty,
                })),
              },
            },
            include: conversationInclude,
          })
        : await tx.dailyProcurementConversation.create({
            data: {
              batchId: batch.id,
              supplierId: supplier.id,
              normalizedPhone: phone,
              status: DAILY_CONVERSATION_STATUS.AWAITING_VENDOR_REPLY,
              sentAt: new Date(),
              lastMessageAt: new Date(),
              createdById: user.id,
              createdBy: user.name,
              notes: payload.notes ?? null,
              lines: {
                create: [...requestedByLine].map(([batchLineId, requestedQty]) => ({
                  batchLineId,
                  itemId: batchLineById.get(batchLineId)!.itemId,
                  requestedQty,
                })),
              },
            },
            include: conversationInclude,
          })

      await tx.whatsAppMessage.create({
        data: {
          phone,
          message,
          rawMessage: message,
          direction: 'OUTBOUND',
          status: 'PENDING',
          messageType: PROCUREMENT_MESSAGE_TYPE.REQUIREMENT_SENT,
          senderName: `${supplier.name} (Supplier)`,
          supplierId: supplier.id,
          dailyBatchId: batch.id,
          dailyConversationId: conversation.id,
          verificationStatus: 'VERIFIED',
        },
      })
      await tx.dailyProcurementLine.updateMany({
        where: { id: { in: [...requestedByLine.keys()] } },
        data: { status: DAILY_LINE_STATUS.ENQUIRY_SENT },
      })
      await tx.dailyProcurementBatch.update({
        where: { id: batch.id },
        data: { status: DAILY_PROCUREMENT_STATUS.ENQUIRY_SENT, version: { increment: 1 } },
      })

      const fresh = await tx.dailyProcurementConversation.findUnique({
        where: { id: conversation.id },
        include: conversationInclude,
      })
      return { conversation: fresh, duplicate: false }
    })

    if (!result.duplicate) {
      await createAuditLog({
        action: 'SEND_DAILY_RATE_ENQUIRY' as any,
        user,
        targetId: batch.id,
        targetName: batch.batchNumber,
        metadata: { conversationId: result.conversation?.id, supplierId: supplier.id, messageType: PROCUREMENT_MESSAGE_TYPE.REQUIREMENT_SENT },
      })
    }

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
