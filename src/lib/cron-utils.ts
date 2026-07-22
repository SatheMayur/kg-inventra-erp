import { NextRequest, NextResponse } from 'next/server'
import { db } from './db'

export function authorizeCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

export async function getCronNotificationUsers() {
  return db.user.findMany({
    where: {
      active: true,
      role: { in: ['admin', 'STORE_ADMIN', 'PURCHASE_USER', 'MANAGEMENT'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, empId: true, name: true, role: true },
  })
}

export async function getCronActor() {
  return db.user.findFirst({
    where: {
      active: true,
      role: { in: ['admin', 'STORE_ADMIN'] },
      ...(process.env.CRON_ACTOR_EMPID ? { empId: process.env.CRON_ACTOR_EMPID } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, empId: true, name: true, role: true },
  })
}
