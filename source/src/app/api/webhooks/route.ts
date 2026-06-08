import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { handleApiError, ApiError } from '@/lib/api-utils'
import { assertSafeUrl } from '@/lib/safe-url'
import { z } from 'zod'

const createWebhookSchema = z.object({
  name: z.string().min(1, 'Name required').max(200),
  url: z.string().url('Invalid URL'),
  events: z.array(z.string()).min(1, 'Select at least one event'),
  secret: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const webhooks = await db.webhook.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ webhooks })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const validated = createWebhookSchema.parse(body)

    // SSRF guard: reject URLs that resolve to private/internal/metadata addresses
    await assertSafeUrl(validated.url)

    const existing = await db.webhook.findFirst({ where: { url: validated.url } })
    if (existing) throw new ApiError(409, 'A webhook with this URL already exists', 'CONFLICT')

    const webhook = await db.webhook.create({
      data: {
        name: validated.name,
        url: validated.url,
        events: JSON.stringify(validated.events),
        secret: validated.secret || null,
      },
    })

    return NextResponse.json({ webhook }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
