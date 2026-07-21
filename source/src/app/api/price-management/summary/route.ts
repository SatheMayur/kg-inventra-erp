import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/auth'
import { getCategorySpendingSummary, getItemPriceSummaries } from '@/lib/price-management'

export async function GET(request: NextRequest) {
  const auth = await authorize(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const user = auth.user!

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || undefined // e.g. "2026-03"
  const category = searchParams.get('category') || undefined

  try {
    const itemSummaries = await getItemPriceSummaries(month, category)
    const categorySpending = await getCategorySpendingSummary(month)

    return NextResponse.json({
      month: month || 'All Time',
      itemSummaries,
      categorySpending,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch price summaries' },
      { status: 500 }
    )
  }
}
