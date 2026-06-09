import { describe, it, expect } from 'vitest'
import { shouldReorder } from './reorder'

const base = { stock: 5, reservedQty: 0, minStock: 10, reorderQty: 20, preferredSupplierId: 's1' }

describe('shouldReorder', () => {
  it('reorders when available <= minStock and fully configured', () => {
    expect(shouldReorder(base, false)).toBe(true)
  })
  it('does not reorder when an open PO already exists', () => {
    expect(shouldReorder(base, true)).toBe(false)
  })
  it('does not reorder above threshold', () => {
    expect(shouldReorder({ ...base, stock: 50 }, false)).toBe(false)
  })
  it('does not reorder when reorderQty is 0', () => {
    expect(shouldReorder({ ...base, reorderQty: 0 }, false)).toBe(false)
  })
  it('does not reorder without a preferred supplier', () => {
    expect(shouldReorder({ ...base, preferredSupplierId: null }, false)).toBe(false)
  })
  it('uses available (stock - reserved), not raw stock', () => {
    // stock 15, reserved 8 -> available 7 <= minStock 10 => reorder
    expect(shouldReorder({ ...base, stock: 15, reservedQty: 8 }, false)).toBe(true)
  })
})
