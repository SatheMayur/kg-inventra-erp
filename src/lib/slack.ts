export async function postToSlack(webhookUrl: string, text: string, blocks?: unknown[]) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blocks ? { text, blocks } : { text }),
  })
  if (!res.ok) throw new Error(`Slack webhook failed: ${res.status}`)
  return { ok: true }
}

export function buildSlackInventoryAlert(items: Array<{ name: string; stock: number; minStock: number }>) {
  return `*🚨 Low Stock Alert*\n${items.map(i => `• ${i.name}: ${i.stock}/${i.minStock}`).join('\n')}`
}
