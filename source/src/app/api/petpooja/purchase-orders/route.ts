import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { getPurchaseOrders } from '@/lib/petpooja'

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') ?? undefined
    const to = searchParams.get('to') ?? undefined
    const purchaseOrders = await getPurchaseOrders(from, to)
    return NextResponse.json({ purchaseOrders })
  } catch (error) {
    return handleApiError(error)
  }
}
