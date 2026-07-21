import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { canManageDailyProcurement, canReadDailyProcurement } from '@/lib/daily-procurement'
import { DAILY_CONVERSATION_STATUS, PROCUREMENT_MESSAGE_TYPE } from '@/lib/daily-conversations'

const sendMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  messageType: z.enum([
    PROCUREMENT_MESSAGE_TYPE.USER_REPLY,
    PROCUREMENT_MESSAGE_TYPE.SUPPLY_CONFIRMATION,
    PROCUREMENT_MESSAGE_TYPE.SHORTAGE_MESSAGE,
    PROCUREMENT_MESSAGE_TYPE.ALTERNATE_VENDOR_REQUEST,
    PROCUREMENT_MESSAGE_TYPE.DELIVERY_UPDATE,
    PROCUREMENT_MESSAGE_TYPE.MANUAL_NOTE,
  ]).default(PROCUREMENT_MESSAGE_TYPE.USER_REPLY),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!canReadDailyProcurement(auth.user?.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const { id } = await params
    const conversation = await db.dailyProcurementConversation.findUnique({ where: { id }, select: { id: true } })
    if (!conversation) throw new ApiError(404, 'Vendor conversation not found', 'NOT_FOUND')
    const messages = await db.whatsAppMessage.findMany({
      where: { dailyConversationId: id },
      orderBy: [{ providerTimestamp: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ messages })
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
    if (!user || !canManageDailyProcurement(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const { id } = await params
    const payload = sendMessageSchema.parse(await request.json())

    const result = await db.$transaction(async (tx) => {
      const conversation = await tx.dailyProcurementConversation.findUnique({
        where: { id },
        include: { supplier: true, batch: true },
      })
      if (!conversation) throw new ApiError(404, 'Vendor conversation not found', 'NOT_FOUND')
      if ([DAILY_CONVERSATION_STATUS.CLOSED, DAILY_CONVERSATION_STATUS.CANCELLED].includes(conversation.status as any)) {
        throw new ApiError(400, `Cannot message a ${conversation.status.toLowerCase()} conversation`, 'BAD_REQUEST')
      }

      const manualNote = payload.messageType === PROCUREMENT_MESSAGE_TYPE.MANUAL_NOTE
      const message = await tx.whatsAppMessage.create({
        data: {
          phone: conversation.normalizedPhone,
          message: payload.message,
          rawMessage: payload.message,
          direction: manualNote ? 'NOTE' : 'OUTBOUND',
          status: manualNote ? 'PROCESSED' : 'PENDING',
          messageType: payload.messageType,
          senderName: manualNote ? `${user.name} (Note)` : `${conversation.supplier.name} (Supplier)`,
          supplierId: conversation.supplierId,
          dailyBatchId: conversation.batchId,
          dailyConversationId: conversation.id,
          verificationStatus: 'VERIFIED',
          linkedBy: user.id,
          linkedAt: new Date(),
        },
      })
      await tx.dailyProcurementConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          status: manualNote ? conversation.status : DAILY_CONVERSATION_STATUS.AWAITING_VENDOR_REPLY,
        },
      })
      return { message, batch: conversation.batch }
    })

    await createAuditLog({
      action: 'SEND_DAILY_RATE_ENQUIRY' as any,
      user,
      targetId: result.batch.id,
      targetName: result.batch.batchNumber,
      metadata: { conversationId: id, messageType: payload.messageType },
    })
    return NextResponse.json({ message: result.message }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
