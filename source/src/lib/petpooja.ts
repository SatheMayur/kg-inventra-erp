const BASE_URL = process.env.PETPOOJA_API_URL ?? ''
const API_KEY = process.env.PETPOOJA_API_KEY ?? ''
const RESTAURANT_ID = process.env.PETPOOJA_RESTAURANT_ID ?? ''

export interface PetpoojaPO {
  poId: string
  poNo: string
  poDate: string
  vendorName: string
  totalAmount: number
  status: string
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'api-key': API_KEY,
    'restaurant-id': RESTAURANT_ID,
  }
}

export function isConfigured() {
  return Boolean(BASE_URL && API_KEY && RESTAURANT_ID)
}

export async function ping(): Promise<{ ok: boolean; restaurantName?: string; error?: string }> {
  if (!isConfigured()) return { ok: false, error: 'Petpooja credentials not configured in environment' }
  const res = await fetch(`${BASE_URL}/v1/restaurant`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json()
  return { ok: true, restaurantName: data.restaurantName ?? data.name }
}

export async function getPurchaseOrders(from?: string, to?: string): Promise<PetpoojaPO[]> {
  if (!isConfigured()) throw new Error('Petpooja credentials not configured in .env')
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const res = await fetch(`${BASE_URL}/v1/purchase-orders?${params}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Petpooja API error: HTTP ${res.status}`)
  const data = await res.json()
  return (data.purchaseOrders ?? data.data ?? []) as PetpoojaPO[]
}
