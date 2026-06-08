import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { handleApiError, ApiError } from '@/lib/api-utils'
import { z } from 'zod'

const patchWebhookSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().url('Invalid URL').optional(),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
  secret: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const existing = await db.webhook.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Webhook not found', 'NOT_FOUND')

    const body = await request.json()
    const validated = patchWebhookSchema.parse(body)

    const webhook = await db.webhook.update({
      where: { id },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.url !== undefined && { url: validated.url }),
        ...(validated.events !== undefined && { events: JSON.stringify(validated.events) }),
        ...(validated.active !== undefined && { active: validated.active }),
        ...(validated.secret !== undefined && { secret: validated.secret }),
      },
    })

    return NextResponse.json({ webhook })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const existing = await db.webhook.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Webhook not found', 'NOT_FOUND')

    await db.webhook.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = await request.json()
    if (body?.action !== 'test') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

    const hook = await db.webhook.findUnique({ where: { id } })
    if (!hook) throw new ApiError(404, 'Webhook not found', 'NOT_FOUND')

    const testBody = JSON.stringify({
      event: 'TEST',
      payload: { message: 'Inventra webhook test' },
      timestamp: new Date().toISOString(),
    })

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (hook.secret) {
      const crypto = await import('crypto')
      headers['X-Inventra-Signature'] =
        'sha256=' + crypto.createHmac('sha256', hook.secret).update(testBody).digest('hex')
    }

    const res = await fetch(hook.url, {
      method: 'POST',
      headers,
      body: testBody,
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) throw new ApiError(502, `Webhook responded with ${res.status}`, 'WEBHOOK_ERROR')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
