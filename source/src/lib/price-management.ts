import { db } from '@/lib/db'

export type TrendType = 'Rising' | 'Slight Rise' | 'Stable' | 'Falling' | 'Dropping' | '—'

export interface TrendResult {
  trend: TrendType
  deltaPercentage: number | null
  deltaAmount: number | null
}

export function calculateSimpleAverageRate(rates: number[]): number {
  const validRates = rates.filter((r) => typeof r === 'number' && !isNaN(r) && r > 0)
  if (!validRates.length) return 0
  const sum = validRates.reduce((acc, curr) => acc + curr, 0)
  return Number((sum / validRates.length).toFixed(2))
}

export function calculateWeightedAverageRate(entries: { rate: number; quantity: number }[]): number {
  let totalQty = 0
  let totalSpend = 0
  for (const entry of entries) {
    const r = Number(entry.rate) || 0
    const q = Number(entry.quantity) || 0
    if (r > 0 && q > 0) {
      totalQty += q
      totalSpend += r * q
    }
  }
  if (!totalQty) return 0
  return Number((totalSpend / totalQty).toFixed(2))
}

export function calculateTrend(entries: { transactionDate: Date | string; rate: number }[]): TrendResult {
  const sorted = [...entries]
    .filter((e) => Number(e.rate) > 0)
    .sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime())

  if (sorted.length < 2) {
    return { trend: '—', deltaPercentage: null, deltaAmount: null }
  }

  const firstRate = Number(sorted[0].rate)
  const lastRate = Number(sorted[sorted.length - 1].rate)

  if (!firstRate || firstRate <= 0) {
    return { trend: '—', deltaPercentage: null, deltaAmount: null }
  }

  const deltaAmount = Number((lastRate - firstRate).toFixed(2))
  const deltaPercentage = Number((((lastRate - firstRate) / firstRate) * 100).toFixed(1))

  let trend: TrendType = 'Stable'
  if (deltaPercentage > 10) trend = 'Rising'
  else if (deltaPercentage >= 3) trend = 'Slight Rise'
  else if (deltaPercentage <= -10) trend = 'Dropping'
  else if (deltaPercentage <= -3) trend = 'Falling'
  else trend = 'Stable'

  return { trend, deltaPercentage, deltaAmount }
}

export async function fetchPriceTransactions(filters?: {
  itemId?: string
  categoryId?: string
  supplierId?: string
  startDate?: string
  endDate?: string
  limit?: number
}) {
  const where: Record<string, unknown> = {}

  if (filters?.itemId) where.itemId = filters.itemId
  if (filters?.categoryId) where.categoryId = filters.categoryId
  if (filters?.supplierId) where.supplierId = filters.supplierId

  if (filters?.startDate || filters?.endDate) {
    where.transactionDate = {
      ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
      ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
    }
  }

  return await db.priceTransaction.findMany({
    where,
    include: {
      item: { select: { id: true, name: true, category: true, unit: true } },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: { transactionDate: 'desc' },
    take: filters?.limit ?? 1000,
  })
}

export async function getItemPriceSummaries(monthStr?: string, categoryFilter?: string) {
  // Fetch all transactions
  const transactions = await db.priceTransaction.findMany({
    include: {
      item: { select: { id: true, name: true, category: true, unit: true, shortName: true } },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: { transactionDate: 'asc' },
  })

  // Filter by month if provided (e.g. "2026-03")
  const filtered = transactions.filter((t) => {
    if (categoryFilter && categoryFilter !== 'ALL' && t.categoryId !== categoryFilter && t.item?.category !== categoryFilter) {
      return false
    }
    if (monthStr) {
      const d = new Date(t.transactionDate)
      const yr = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      return `${yr}-${mo}` === monthStr
    }
    return true
  })

  // Group by item
  const itemMap = new Map<string, typeof filtered>()
  filtered.forEach((t) => {
    const key = t.itemId
    if (!itemMap.has(key)) itemMap.set(key, [])
    itemMap.get(key)!.push(t)
  })

  const summaries = []

  for (const [itemId, itemTxList] of itemMap.entries()) {
    const firstTx = itemTxList[0]
    const itemName = firstTx.item?.name || firstTx.originalItemText || 'Unknown Item'
    const category = firstTx.item?.category || firstTx.categoryId || 'General'
    const unit = firstTx.item?.unit || firstTx.unitId || 'pcs'

    const rates = itemTxList.map((t) => t.rate)
    const grossRates = itemTxList.map((t) => t.grossRate || t.rate)
    const simpleAvgRate = calculateSimpleAverageRate(rates)
    const simpleAvgGrossRate = calculateSimpleAverageRate(grossRates)
    const weightedAvgRate = calculateWeightedAverageRate(itemTxList.map((t) => ({ rate: t.rate, quantity: t.quantity })))
    const weightedAvgGrossRate = calculateWeightedAverageRate(itemTxList.map((t) => ({ rate: t.grossRate || t.rate, quantity: t.quantity })))

    const totalQty = Number(itemTxList.reduce((sum, t) => sum + t.quantity, 0).toFixed(2))
    const totalSpendBase = Number(itemTxList.reduce((sum, t) => sum + t.lineAmount, 0).toFixed(2))
    const totalSpendGross = Number(itemTxList.reduce((sum, t) => sum + t.grossAmount, 0).toFixed(2))

    const minRate = Math.min(...rates)
    const maxRate = Math.max(...rates)
    const minGrossRate = Math.min(...grossRates)
    const maxGrossRate = Math.max(...grossRates)

    const trendInfo = calculateTrend(itemTxList.map((t) => ({ transactionDate: t.transactionDate, rate: t.grossRate || t.rate })))

    const supplierSet = new Set(itemTxList.map((t) => t.supplierId).filter(Boolean))

    summaries.push({
      itemId,
      itemName,
      category,
      unit,
      firstRate: itemTxList[0].grossRate || itemTxList[0].rate,
      lastRate: itemTxList[itemTxList.length - 1].grossRate || itemTxList[itemTxList.length - 1].rate,
      minRate,
      maxRate,
      minGrossRate,
      maxGrossRate,
      simpleAvgRate,
      simpleAvgGrossRate,
      weightedAvgRate,
      weightedAvgGrossRate,
      totalQty,
      totalSpendBase,
      totalSpendGross,
      purchaseCount: itemTxList.length,
      supplierCount: supplierSet.size,
      trend: trendInfo.trend,
      deltaPercentage: trendInfo.deltaPercentage,
      deltaAmount: trendInfo.deltaAmount,
    })
  }

  return summaries.sort((a, b) => b.totalSpendGross - a.totalSpendGross)
}

export async function getCategorySpendingSummary(monthStr?: string) {
  const summaries = await getItemPriceSummaries(monthStr)

  const catMap = new Map<string, { totalSpend: number; totalQty: number; itemsCount: number; transactionCount: number; items: typeof summaries }>()

  let grandTotalSpend = 0

  for (const s of summaries) {
    grandTotalSpend += s.totalSpendGross
    if (!catMap.has(s.category)) {
      catMap.set(s.category, { totalSpend: 0, totalQty: 0, itemsCount: 0, transactionCount: 0, items: [] })
    }
    const cat = catMap.get(s.category)!
    cat.totalSpend += s.totalSpendGross
    cat.totalQty += s.totalQty
    cat.itemsCount += 1
    cat.transactionCount += s.purchaseCount
    cat.items.push(s)
  }

  const categoryReports = []
  for (const [categoryName, data] of catMap.entries()) {
    const percentOfBudget = grandTotalSpend > 0 ? Number(((data.totalSpend / grandTotalSpend) * 100).toFixed(1)) : 0
    const topItem = data.items.sort((a, b) => b.totalSpendGross - a.totalSpendGross)[0]

    categoryReports.push({
      category: categoryName,
      itemsCount: data.itemsCount,
      totalQty: Number(data.totalQty.toFixed(1)),
      totalSpend: Number(data.totalSpend.toFixed(2)),
      percentOfBudget,
      topItemName: topItem ? topItem.itemName : '—',
      topItemSpend: topItem ? topItem.totalSpendGross : 0,
      avgRate: data.itemsCount > 0 ? calculateSimpleAverageRate(data.items.map((i) => i.weightedAvgGrossRate)) : 0,
    })
  }

  return {
    grandTotalSpend: Number(grandTotalSpend.toFixed(2)),
    categoryReports: categoryReports.sort((a, b) => b.totalSpend - a.totalSpend),
    top10Items: summaries.slice(0, 10),
  }
}
