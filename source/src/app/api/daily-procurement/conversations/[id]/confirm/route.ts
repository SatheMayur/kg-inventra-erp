import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { startApproval } from '@/lib/approvals/engine'
import { DAILY_PROCUREMENT_MODULE, DAILY_PROCUREMENT_STATUS, canManageDailyProcurement, roundMoney, roundQty } from '@/lib/daily-procurement'
import { DAILY_CONVERSATION_STATUS, deriveConversationStatus } from '@/lib/daily-conversations'
import { generateConversationSupplyOrders } from '@/lib/daily-confirmation'

const confirmationSchema = z.object({
  sourceMessageId: z.string().nullable().optional(),
  source: z.enum(['WHATSAPP', 'PHONE', 'MANUAL', 'SYSTEM']).default('WHATSAPP'),
  lines: z.array(z.object({
    conversationLineId: z.string().min(1),
    confirmedQty: z.number().nonnegative(),
    cancelledQty: z.number().nonnegative().default(0),
    confirmedDeliveryTime: z.string().nullable().optional(),
    vendorNote: z.string().max(500).nullable().optional(),
    vendorRate: z.number().nonnegative().nullable().optional(),
    rateVerified: z.boolean().default(false),
  })).min(1),
})

function parseOptionalDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new ApiError(400, 'Invalid confirmed delivery time', 'BAD_REQUEST')
  return parsed
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
    const payload = confirmationSchema.parse(await request.json())
    const result = await db.$transaction(async (tx) => {
      const conversation = await tx.dailyProcurementConversation.findUnique({
        where: { id },
        include: {
          batch: { include: { lines: true, conversations: { include: { lines: true } } } },
          lines: { include: { batchLine: true, item: true } },
          supplier: true,
        },
      })
      if (!conversation) throw new ApiError(404, 'Vendor conversation not found', 'NOT_FOUND')
      if ([DAILY_CONVERSATION_STATUS.CLOSED, DAILY_CONVERSATION_STATUS.CANCELLED].includes(conversation.status as any)) {
        throw new ApiError(400, `Cannot confirm a ${conversation.status.toLowerCase()} conversation`, 'BAD_REQUEST')
      }
      if ([DAILY_PROCUREMENT_STATUS.CLOSED, DAILY_PROCUREMENT_STATUS.CANCELLED].includes(conversation.batch.status as any)) {
        throw new ApiError(400, `Cannot confirm a ${conversation.batch.status.toLowerCase()} requirement`, 'BAD_REQUEST')
      }

      const conversationLineById = new Map(conversation.lines.map((line) => [line.id, line]))
      const submittedIds = new Set(payload.lines.map((line) => line.conversationLineId))
      if (submittedIds.size !== payload.lines.length) throw new ApiError(400, 'A confirmation line appears more than once', 'BAD_REQUEST')

      for (const confirmation of payload.lines) {
        const line = conversationLineById.get(confirmation.conversationLineId)
        if (!line) throw new ApiError(400, 'One or more confirmation lines do not belong to this conversation', 'BAD_REQUEST')
        if (confirmation.confirmedQty + confirmation.cancelledQty - line.requestedQty > 0.001) {
          throw new ApiError(400, `${line.item.name} confirmed and cancelled quantities exceed the quantity sent`, 'BAD_REQUEST')
        }

        const otherConfirmed = conversation.batch.conversations
          .filter((entry) => entry.id !== conversation.id && entry.status !== DAILY_CONVERSATION_STATUS.CANCELLED)
          .flatMap((entry) => entry.lines)
          .filter((entry) => entry.batchLineId === line.batchLineId)
          .reduce((sum, entry) => sum + entry.confirmedQty, 0)
        if (otherConfirmed + confirmation.confirmedQty - line.batchLine.finalPurchaseQty > 0.001) {
          throw new ApiError(
            400,
            `${line.item.name} would exceed the requirement across vendors. Remaining confirmable quantity: ${roundQty(line.batchLine.finalPurchaseQty - otherConfirmed)} ${line.batchLine.unit}`,
            'BAD_REQUEST',
          )
        }

        const shortQty = roundQty(Math.max(0, line.requestedQty - confirmation.confirmedQty - confirmation.cancelledQty))
        const status = confirmation.cancelledQty >= line.requestedQty
          ? 'CANCELLED'
          : confirmation.confirmedQty <= 0
            ? 'UNAVAILABLE'
            : shortQty > 0
              ? 'PARTIAL'
              : 'CONFIRMED'
        await tx.dailyConversationLine.update({
          where: { id: line.id },
          data: {
            confirmedQty: roundQty(confirmation.confirmedQty),
            cancelledQty: roundQty(confirmation.cancelledQty),
            shortQty,
            status,
            confirmedDeliveryTime: parseOptionalDate(confirmation.confirmedDeliveryTime),
            vendorNote: confirmation.vendorNote ?? null,
            vendorRate: confirmation.vendorRate ?? null,
            rateVerified: confirmation.rateVerified,
            lastConfirmationMessageId: payload.sourceMessageId ?? null,
          },
        })
      }

      const freshLines = await tx.dailyConversationLine.findMany({ where: { conversationId: conversation.id } })
      const conversationStatus = deriveConversationStatus(freshLines)
      await tx.dailyProcurementConversation.update({
        where: { id: conversation.id },
        data: { status: conversationStatus, unreadCount: 0 },
      })

      const totalAmount = roundMoney(conversation.batch.conversations.filter((entry) => entry.id !== conversation.id).reduce((sum, entry) => {
        return sum + entry.lines.reduce((inner, line) => inner + line.confirmedQty * (line.vendorRate ?? 0), 0)
      }, 0) + freshLines.reduce((sum, line) => sum + line.confirmedQty * (line.vendorRate ?? 0), 0))
      const flags = [
        ...(freshLines.some((line) => line.confirmedQty > 0 && line.vendorRate === null) ? ['RATE_MISSING'] : []),
        ...(freshLines.some((line) => line.shortQty > 0) ? ['SHORTAGE'] : []),
      ]

      const previousInstance = await tx.approvalInstance.findFirst({
        where: { moduleName: DAILY_PROCUREMENT_MODULE, documentId: conversation.batchId, status: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'desc' },
      })
      if (previousInstance) {
        await tx.approvalInstance.update({ where: { id: previousInstance.id }, data: { status: 'CANCELLED' } })
      }
      const approval = await startApproval(tx, {
        moduleName: DAILY_PROCUREMENT_MODULE,
        documentType: DAILY_PROCUREMENT_MODULE,
        documentId: conversation.batchId,
        createdById: conversation.batch.createdById ?? user.id,
        ctx: { amount: totalAmount, flags },
      })

      if (approval.status === 'PENDING_APPROVAL') {
        await tx.dailyProcurementBatch.update({
          where: { id: conversation.batchId },
          data: { status: DAILY_PROCUREMENT_STATUS.PENDING_APPROVAL, version: { increment: 1 } },
        })
        return { approvalRequired: true, orders: [] }
      }

      const orders = await generateConversationSupplyOrders(tx, conversation.batchId, { id: user.id, name: user.name })
      return { approvalRequired: false, orders }
    })

    await createAuditLog({
      action: 'APPROVE_DAILY_PROCUREMENT_BATCH' as any,
      user,
      targetId: id,
      targetName: 'Daily Supply Confirmation',
      metadata: { approvalRequired: result.approvalRequired, orders: result.orders.length, source: payload.source },
    })
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
