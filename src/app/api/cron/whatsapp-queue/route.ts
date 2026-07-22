import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/api-utils'
import { authorizeCronRequest, getCronNotificationUsers } from '@/lib/cron-utils'
import { createNotificationOnce } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  try {
    const unauthorized = authorizeCronRequest(request)
    if (unauthorized) return unauthorized

    const now = new Date()
    const pendingOlderThan = new Date(now.getTime() - 5 * 60 * 1000)
    const processingOlderThan = new Date(now.getTime() - 10 * 60 * 1000)
    const failedSince = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [pendingBacklog, staleProcessing, recentFailures] = await Promise.all([
      db.whatsAppMessage.count({
        where: {
          direction: 'OUTBOUND',
          status: 'PENDING',
          createdAt: { lte: pendingOlderThan },
        },
      }),
      db.whatsAppMessage.count({
        where: {
          direction: 'OUTBOUND',
          status: 'PROCESSING',
          updatedAt: { lte: processingOlderThan },
        },
      }),
      db.whatsAppMessage.count({
        where: {
          direction: 'OUTBOUND',
          status: 'FAILED',
          updatedAt: { gte: failedSince },
        },
      }),
    ])

    const isHealthy = pendingBacklog === 0 && staleProcessing === 0 && recentFailures === 0
    let notified = 0

    if (!isHealthy) {
      const users = await getCronNotificationUsers()
      const title = 'WhatsApp Queue Needs Attention'
      const message = [
        pendingBacklog ? `${pendingBacklog} pending outbound message(s) older than 5 minutes` : null,
        staleProcessing ? `${staleProcessing} message(s) stuck in PROCESSING over 10 minutes` : null,
        recentFailures ? `${recentFailures} failed outbound message(s) in the last 24 hours` : null,
      ].filter(Boolean).join('; ')

      const dedupeSince = new Date(now.getTime() - 30 * 60 * 1000)
      const results = await Promise.all(users.map((user) =>
        createNotificationOnce({
          userId: user.id,
          title,
          message,
          type: 'warning',
          link: 'whatsapp-inbox',
        }, { dedupeSince }),
      ))
      notified = results.filter((result) => result.created).length
    }

    return NextResponse.json({
      ok: true,
      healthy: isHealthy,
      pendingBacklog,
      staleProcessing,
      recentFailures,
      notified,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
