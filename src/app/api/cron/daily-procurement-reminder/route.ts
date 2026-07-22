import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/api-utils'
import { getKolkataDateBounds, getKolkataDateString } from '@/lib/date-utils'
import { DAILY_PROCUREMENT_STATUS } from '@/lib/daily-procurement'
import { authorizeCronRequest, getCronNotificationUsers } from '@/lib/cron-utils'
import { createNotificationOnce } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  try {
    const unauthorized = authorizeCronRequest(request)
    if (unauthorized) return unauthorized

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const deliveryDateString = getKolkataDateString(tomorrow)
    const deliveryBounds = getKolkataDateBounds(deliveryDateString)

    const [eligibleItems, openBatches] = await Promise.all([
      db.item.count({
        where: {
          deletedAt: null,
          active: true,
          dailyProcurementEligible: true,
          itemNature: { not: 'SERVICE' },
        },
      }),
      db.dailyProcurementBatch.count({
        where: {
          deliveryDate: {
            gte: deliveryBounds.start,
            lte: deliveryBounds.end,
          },
          status: {
            notIn: [DAILY_PROCUREMENT_STATUS.CLOSED, DAILY_PROCUREMENT_STATUS.CANCELLED],
          },
        },
      }),
    ])

    const needsReminder = eligibleItems > 0 && openBatches === 0
    let notified = 0

    if (needsReminder) {
      const users = await getCronNotificationUsers()
      const title = 'Daily Procurement Draft Pending'
      const message = `No Daily Procurement batch exists for ${deliveryDateString}. Review ${eligibleItems} eligible daily-procurement item(s) and prepare supplier enquiries.`
      const dedupeSince = deliveryBounds.start

      const results = await Promise.all(users.map((user) =>
        createNotificationOnce({
          userId: user.id,
          title,
          message,
          type: 'warning',
          link: 'purchase-order-process',
        }, { dedupeSince }),
      ))
      notified = results.filter((result) => result.created).length
    }

    return NextResponse.json({
      ok: true,
      deliveryDate: deliveryDateString,
      eligibleItems,
      openBatches,
      needsReminder,
      notified,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
