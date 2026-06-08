import { db } from '@/lib/db'
import crypto from 'crypto'

export type WebhookEvent = 'LOW_STOCK' | 'CHECKOUT' | 'NEW_REQUEST' | 'STOCK_IN' | 'STOCK_OUT' | 'MAINTENANCE_DUE'

export async function dispatchWebhook(event: WebhookEvent, payload: unknown) {
  const hooks = await db.webhook.findMany({ where: { active: true } })
  const matching = hooks.filter(h => {
    const events: string[] = JSON.parse(h.events || '[]')
    return events.includes(event) || events.includes('*')
  })
  await Promise.allSettled(matching.map(async (hook) => {
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() })
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (hook.secret) {
      headers['X-Inventra-Signature'] = 'sha256=' + crypto.createHmac('sha256', hook.secret).update(body).digest('hex')
    }
    await fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) })
  }))
}
