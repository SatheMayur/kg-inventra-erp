import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { canManageDailyProcurement } from '@/lib/daily-procurement'
import { createAuditLog } from '@/lib/audit'

const actionSchema = z.object({
  action: z.enum(['CLOSE', 'REOPEN']).default('CLOSE'),
  reason: z.string().trim().max(500).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.user
    if (!user || !canManageDailyProcurement(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const { id } = await params
    const payload = actionSchema.parse(await request.json().catch(() => ({})))
    if (payload.action === 'REOPEN' && !payload.reason) {
      throw new ApiError(400, 'A reason is required to reopen a requirement', 'BAD_REQUEST')
    }

    const batch = await db.$transaction(async (tx) => {
      const current = await tx.dailyProcurementBatch.findFirst({
        where: { OR: [{ id }, { batchNumber: id }] },
        include: { supplyOrders: true, conversations: { include: { lines: true } } },
      })
      if (!current) throw new ApiError(404, 'Daily Procurement Requirement not found', 'NOT_FOUND')

      if (payload.action === 'REOPEN') {
        if (current.status !== 'CLOSED') throw new ApiError(400, 'Only a closed requirement can be reopened', 'BAD_REQUEST')
        await tx.dailyProcurementConversation.updateMany({
          where: { batchId: current.id, status: 'CLOSED' },
          data: { status: 'RECEIVED', closedAt: null },
        })
        return tx.dailyProcurementBatch.update({
          where: { id: current.id },
          data: {
            status: 'RECEIVED',
            completedAt: null,
            closedAt: null,
            closedById: null,
            reopenedAt: new Date(),
            reopenedById: user.id,
            reopenReason: payload.reason,
            version: { increment: 1 },
          },
        })
      }

      const pendingOrders = current.supplyOrders.filter((order) => !['RECEIVED', 'CANCELLED'].includes(order.status))
      const unresolvedShortages = current.conversations.flatMap((conversation) => conversation.lines)
        .filter((line) => line.shortQty > 0.001)
      if (pendingOrders.length || unresolvedShortages.length) {
        throw new ApiError(400, 'Receive all confirmed supply and accept or cancel every shortage before closing', 'BAD_REQUEST')
      }
      await tx.dailyProcurementConversation.updateMany({
        where: { batchId: current.id, status: { not: 'CANCELLED' } },
        data: { status: 'CLOSED', closedAt: new Date() },
      })
      return tx.dailyProcurementBatch.update({
        where: { id: current.id },
        data: {
          status: 'CLOSED',
          completedAt: new Date(),
          closedAt: new Date(),
          closedById: user.id,
          version: { increment: 1 },
        },
      })
    })

    await createAuditLog({
      action: payload.action === 'REOPEN' ? 'REOPEN_DAILY_PROCUREMENT' as any : 'CLOSE_DAILY_PROCUREMENT' as any,
      user,
      targetId: batch.id,
      targetName: batch.batchNumber,
      metadata: { reason: payload.reason ?? null },
    })
    return NextResponse.json({ batch })
  } catch (error) {
    return handleApiError(error)
  }
}
