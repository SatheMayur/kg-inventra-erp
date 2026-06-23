import { describe, it, expect } from 'vitest'
import { requestLineInputSchema } from '@/lib/validation'

describe('requestLineInputSchema', () => {
  it('accepts a catalog line', () => {
    expect(requestLineInputSchema.safeParse({ itemId: 'i1', qty: 2 }).success).toBe(true)
  })
  it('accepts a custom line with unit', () => {
    expect(requestLineInputSchema.safeParse({ customItemName: 'Water Bottle', unit: 'pcs', qty: 1 }).success).toBe(true)
  })
  it('accepts a custom line without unit', () => {
    expect(requestLineInputSchema.safeParse({ customItemName: 'Water Bottle', qty: 1 }).success).toBe(true)
  })
  it('rejects a line with neither itemId nor customItemName', () => {
    expect(requestLineInputSchema.safeParse({ qty: 1 }).success).toBe(false)
  })
  it('rejects a line with both itemId and customItemName', () => {
    expect(requestLineInputSchema.safeParse({ itemId: 'i1', customItemName: 'x', qty: 1 }).success).toBe(false)
  })
  it('rejects a blank custom name', () => {
    expect(requestLineInputSchema.safeParse({ customItemName: '   ', qty: 1 }).success).toBe(false)
  })
  it('rejects qty < 1', () => {
    expect(requestLineInputSchema.safeParse({ itemId: 'i1', qty: 0 }).success).toBe(false)
  })
})
