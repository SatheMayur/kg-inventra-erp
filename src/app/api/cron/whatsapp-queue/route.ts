import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/api-utils'
import { authorizeCronRequest, getCronNotificationUsers } from '@/lib/cron-utils'
import { createNotificationOnce } from '@/lib/notifications'
import { emitWhatsAppMessageChanged } from '@/lib/realtime'

function getPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export async function GET(request: NextRequest) {
  try {
    const unauthorized = authorizeCronRequest(request)
    if (unauthorized) return unauthorized

    const now = new Date()
    const maxAttempts = getPositiveIntEnv('WHATSAPP_MAX_SEND_ATTEMPTS', 3)
    const processingTimeoutMinutes = getPositiveIntEnv('WHATSAPP_PROCESSING_TIMEOUT_MINUTES', 10)
    const pendingOlderThan = new Date(now.getTime() - 5 * 60 * 1000)
    const processingOlderThan = new Date(now.getTime() - processingTimeoutMinutes * 60 * 1000)
    const failedSince = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [staleProcessingMessages, exhaustedPendingMessages] = await Promise.all([
      db.whatsAppMessage.findMany({
        where: {
          direction: 'OUTBOUND',
          status: 'PROCESSING',
          updatedAt: { lte: processingOlderThan },
        },
        select: {
          id: true,
          phone: true,
          direction: true,
          status: true,
          sendAttempts: true,
          updatedAt: true,
        },
      }),
      db.whatsAppMessage.findMany({
        where: {
          direction: 'OUTBOUND',
          status: 'PENDING',
          sendAttempts: { gte: maxAttempts },
        },
        select: {
          id: true,
          phone: true,
          direction: true,
          status: true,
          sendAttempts: true,
          updatedAt: true,
        },
      }),
    ])

    const messagesToRequeue = staleProcessingMessages.filter((message) => message.sendAttempts < maxAttempts)
    const staleMessagesToFail = staleProcessingMessages.filter((message) => message.sendAttempts >= maxAttempts)
    const messagesToFail = [...staleMessagesToFail, ...exhaustedPendingMessages]

    await Promise.all([
      messagesToRequeue.length
        ? db.whatsAppMessage.updateMany({
          where: { id: { in: messagesToRequeue.map((message) => message.id) } },
          data: {
            status: 'PENDING',
            error: `Bridge processing timeout after ${processingTimeoutMinutes} minute(s); requeued for retry`,
          },
        })
        : Promise.resolve(),
      messagesToFail.length
        ? db.whatsAppMessage.updateMany({
          where: { id: { in: messagesToFail.map((message) => message.id) } },
          data: {
            status: 'FAILED',
            error: `Max WhatsApp send attempts reached (${maxAttempts}); bridge did not confirm delivery`,
          },
        })
        : Promise.resolve(),
    ])

    messagesToRequeue.forEach((message) => {
      emitWhatsAppMessageChanged({
        messageId: message.id,
        phone: message.phone,
        direction: message.direction,
        status: 'PENDING',
        reason: 'bridge-timeout-requeued',
        updatedAt: now.toISOString(),
      })
    })

    messagesToFail.forEach((message) => {
      emitWhatsAppMessageChanged({
        messageId: message.id,
        phone: message.phone,
        direction: message.direction,
        status: 'FAILED',
        reason: 'bridge-retries-exhausted',
        updatedAt: now.toISOString(),
      })
    })

    const [pendingBacklog, recentFailures] = await Promise.all([
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
          status: 'FAILED',
          updatedAt: { gte: failedSince },
        },
      }),
    ])

    const requeued = messagesToRequeue.length
    const failedAfterRetries = messagesToFail.length
    const staleProcessing = staleProcessingMessages.length
    const isHealthy = pendingBacklog === 0 && staleProcessing === 0 && recentFailures === 0
    let notified = 0

    if (!isHealthy) {
      const users = await getCronNotificationUsers()
      const title = 'WhatsApp Queue Needs Attention'
      const message = [
        pendingBacklog ? `${pendingBacklog} pending outbound message(s) older than 5 minutes` : null,
        requeued ? `${requeued} stuck message(s) requeued after bridge timeout` : null,
        failedAfterRetries ? `${failedAfterRetries} message(s) failed after ${maxAttempts} send attempt(s)` : null,
        staleProcessing && !requeued && !failedAfterRetries ? `${staleProcessing} message(s) stuck in PROCESSING over ${processingTimeoutMinutes} minutes` : null,
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
      requeued,
      failedAfterRetries,
      recentFailures,
      maxAttempts,
      processingTimeoutMinutes,
      notified,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
