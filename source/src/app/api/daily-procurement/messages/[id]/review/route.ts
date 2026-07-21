import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { canManageDailyProcurement, roundQty } from '@/lib/daily-procurement'
import { DAILY_CONVERSATION_STATUS, deriveConversationStatus } from '@/lib/daily-conversations'
import { createAuditLog } from '@/lib/audit'

const reviewSchema = z.object({
  action: z.enum(['LINK', 'ACCEPT', 'EDIT', 'IGNORE', 'NEEDS_REVIEW']),
  conversationId: z.string().optional(),
  parsedSuggestion: z.unknown().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.user
    if (!user || !canManageDailyProcurement(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const { id } = await params
    const payload = reviewSchema.parse(await request.json())

    const result = await db.$transaction(async (tx) => {
      const message = await tx.whatsAppMessage.findUnique({ where: { id } })
      if (!message) throw new ApiError(404, 'WhatsApp message not found', 'NOT_FOUND')

      let conversationId = payload.conversationId ?? message.dailyConversationId
      if (payload.action === 'LINK') {
        if (!conversationId) throw new ApiError(400, 'conversationId is required', 'BAD_REQUEST')
        const conversation = await tx.dailyProcurementConversation.findUnique({ where: { id: conversationId } })
        if (!conversation) throw new ApiError(404, 'Conversation not found', 'NOT_FOUND')
        await tx.whatsAppMessage.update({
          where: { id },
          data: {
            dailyConversationId: conversation.id,
            dailyBatchId: conversation.batchId,
            supplierId: conversation.supplierId,
            verificationStatus: 'PENDING',
            linkedBy: user.id,
            linkedAt: new Date(),
          },
        })
        return { conversationId, verificationStatus: 'PENDING' }
      }

      if (payload.action === 'IGNORE') {
        await tx.whatsAppMessage.update({ where: { id }, data: { verificationStatus: 'IGNORED', linkedBy: user.id, linkedAt: new Date() } })
        return { conversationId, verificationStatus: 'IGNORED' }
      }
      if (payload.action === 'NEEDS_REVIEW') {
        await tx.whatsAppMessage.update({ where: { id }, data: { verificationStatus: 'NEEDS_REVIEW' } })
        if (conversationId) await tx.dailyProcurementConversation.update({ where: { id: conversationId }, data: { status: DAILY_CONVERSATION_STATUS.NEEDS_REVIEW } })
        return { conversationId, verificationStatus: 'NEEDS_REVIEW' }
      }

      if (!conversationId) throw new ApiError(400, 'Link this message to a conversation first', 'BAD_REQUEST')
      const suggestion = (payload.action === 'EDIT' ? payload.parsedSuggestion : message.parsedSuggestion) as any
      if (!suggestion || !Array.isArray(suggestion.lines)) {
        throw new ApiError(400, 'No parsed item suggestions are available', 'BAD_REQUEST')
      }
      for (const line of suggestion.lines) {
        if (line.confirmedQty === null || line.confirmedQty === undefined) continue
        const current = await tx.dailyConversationLine.findFirst({
          where: { conversationId, batchLineId: line.batchLineId },
        })
        if (!current) continue
        const confirmedQty = roundQty(Math.max(0, Number(line.confirmedQty)))
        await tx.dailyConversationLine.update({
          where: { id: current.id },
          data: {
            confirmedQty,
            shortQty: roundQty(Math.max(0, current.requestedQty - confirmedQty)),
            vendorRate: line.vendorRate === null || line.vendorRate === undefined ? current.vendorRate : Number(line.vendorRate),
            status: confirmedQty <= 0 ? 'UNAVAILABLE' : confirmedQty + 0.001 < current.requestedQty ? 'PARTIAL' : 'CONFIRMED',
            lastConfirmationMessageId: id,
          },
        })
      }
      const lines = await tx.dailyConversationLine.findMany({ where: { conversationId } })
      const status = deriveConversationStatus(lines)
      await tx.dailyProcurementConversation.update({ where: { id: conversationId }, data: { status, unreadCount: 0 } })
      await tx.whatsAppMessage.update({
        where: { id },
        data: {
          parsedSuggestion: (payload.action === 'EDIT' ? payload.parsedSuggestion : undefined) as any,
          verificationStatus: 'VERIFIED',
          linkedBy: user.id,
          linkedAt: new Date(),
        },
      })
      return { conversationId, verificationStatus: 'VERIFIED', status }
    })

    await createAuditLog({ action: 'UPDATE_WHATSAPP_PARSING' as any, user, targetId: id, targetName: id, metadata: result })
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
