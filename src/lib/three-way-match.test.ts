import { describe, it, expect } from 'vitest'
import { threeWayMatch } from './three-way-match'

describe('threeWayMatch', () => {
  it('matches when qty covered and amount within tolerance', () => {
    const r = threeWayMatch({ orderedQty: 100, receivedQty: 100, orderedAmount: 5000, invoicedAmount: 5000 })
    expect(r.matched).toBe(true)
    expect(r.discrepancies).toHaveLength(0)
  })

  it('flags short delivery', () => {
    const r = threeWayMatch({ orderedQty: 100, receivedQty: 80, orderedAmount: 5000, invoicedAmount: 5000 })
    expect(r.matched).toBe(false)
    expect(r.discrepancies[0]).toMatch(/short delivery/i)
  })

  it('flags over delivery', () => {
    const r = threeWayMatch({ orderedQty: 100, receivedQty: 120, orderedAmount: 5000, invoicedAmount: 5000 })
    expect(r.matched).toBe(false)
    expect(r.discrepancies[0]).toMatch(/over delivery/i)
  })

  it('flags invoice amount mismatch beyond tolerance', () => {
    const r = threeWayMatch({ orderedQty: 100, receivedQty: 100, orderedAmount: 5000, invoicedAmount: 6000 })
    expect(r.matched).toBe(false)
    expect(r.discrepancies.some((d) => /invoice amount/i.test(d))).toBe(true)
  })

  it('allows tiny amount variance within 1% tolerance', () => {
    const r = threeWayMatch({ orderedQty: 100, receivedQty: 100, orderedAmount: 5000, invoicedAmount: 5040 })
    expect(r.matched).toBe(true)
  })
})
