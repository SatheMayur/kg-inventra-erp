import { NextRequest, NextResponse } from 'next/server'
import { runInventoryAlerts } from '@/lib/alert-runner'
import { handleApiError } from '@/lib/api-utils'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const actor = await db.user.findFirst({
      where: {
        active: true,
        role: 'admin',
        ...(process.env.CRON_ACTOR_EMPID ? { empId: process.env.CRON_ACTOR_EMPID } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, empId: true },
    })

    if (!actor) {
      return NextResponse.json({ error: 'No active admin user found for cron notifications' }, { status: 500 })
    }

    const result = await runInventoryAlerts({
      notificationUserId: actor.id,
      email: process.env.ALERT_EMAIL || undefined,
    })

    return NextResponse.json({
      ok: true,
      actorEmpId: actor.empId,
      ...result,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
