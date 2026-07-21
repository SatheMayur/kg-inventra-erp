import { describe, it, expect } from 'vitest'
import { resolveSubType, MOVEMENT_SUBTYPES } from './movement-subtype'

describe('resolveSubType', () => {
  it('returns the explicit subtype when one is given', () => {
    expect(resolveSubType('PURCHASE')).toBe('PURCHASE')
    expect(resolveSubType('RETURN')).toBe('RETURN')
  })

  it('defaults to ADJUST when none is provided', () => {
    expect(resolveSubType(undefined)).toBe('ADJUST')
  })

  it('throws on an unknown subtype, guarding against typos from callers', () => {
    expect(() => resolveSubType('FOO' as never)).toThrow(/movement subtype/i)
  })

  it('enumerates exactly the seven ledger movement subtypes', () => {
    expect([...MOVEMENT_SUBTYPES]).toEqual([
      'OPENING',
      'PURCHASE',
      'TRANSFER_IN',
      'ISSUE',
      'TRANSFER_OUT',
      'RETURN',
      'ADJUST',
    ])
  })
})
