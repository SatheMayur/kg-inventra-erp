import { describe, expect, it } from 'vitest'
import {
  calculateSimpleAverageRate,
  calculateTrend,
  calculateWeightedAverageRate,
} from './price-management'

describe('Price Management Calculation Engine', () => {
  it('calculates simple average rate correctly', () => {
    expect(calculateSimpleAverageRate([20, 30])).toBe(25.0)
    expect(calculateSimpleAverageRate([100, 200, 300])).toBe(200.0)
    expect(calculateSimpleAverageRate([0, 50, -10])).toBe(50.0)
    expect(calculateSimpleAverageRate([])).toBe(0)
  })

  it('calculates weighted average purchase rate correctly based on quantity', () => {
    // 10 KG at ₹20, 100 KG at ₹30 => (200 + 3000) / 110 = 3200 / 110 = 29.09
    const entries1 = [
      { rate: 20, quantity: 10 },
      { rate: 30, quantity: 100 },
    ]
    expect(calculateWeightedAverageRate(entries1)).toBe(29.09)

    // Equal quantities => simple avg = weighted avg
    const entries2 = [
      { rate: 20, quantity: 10 },
      { rate: 30, quantity: 10 },
    ]
    expect(calculateWeightedAverageRate(entries2)).toBe(25.0)

    expect(calculateWeightedAverageRate([])).toBe(0)
  })

  it('calculates trend and percentage change correctly', () => {
    const entries1 = [
      { transactionDate: '2026-03-01', rate: 20 },
      { transactionDate: '2026-03-29', rate: 25 },
    ]
    const trend1 = calculateTrend(entries1)
    expect(trend1.trend).toBe('Rising')
    expect(trend1.deltaPercentage).toBe(25.0)

    const entries2 = [
      { transactionDate: '2026-03-01', rate: 100 },
      { transactionDate: '2026-03-29', rate: 85 },
    ]
    const trend2 = calculateTrend(entries2)
    expect(trend2.trend).toBe('Dropping')
    expect(trend2.deltaPercentage).toBe(-15.0)

    const entries3 = [{ transactionDate: '2026-03-01', rate: 50 }]
    const trend3 = calculateTrend(entries3)
    expect(trend3.trend).toBe('—')
    expect(trend3.deltaPercentage).toBeNull()
  })
})
