import { describe, it, expect } from 'vitest'
import { parseCommand } from './command'

describe('parseCommand', () => {
  it('detects low-stock intent', () => {
    expect(parseCommand('show low stock').type).toBe('lowStock')
    expect(parseCommand('what is running low?').type).toBe('lowStock')
  })

  it('detects pending requests', () => {
    expect(parseCommand('pending requests').type).toBe('pendingRequests')
    expect(parseCommand('show approvals pending').type).toBe('pendingRequests')
  })

  it('parses stock queries (en + hinglish)', () => {
    expect(parseCommand('how many keyboards')).toEqual({ type: 'stock', query: 'keyboards' })
    expect(parseCommand('stock of A4 paper')).toEqual({ type: 'stock', query: 'a4 paper' })
    expect(parseCommand('kitne monitor bache hai?')).toEqual({ type: 'stock', query: 'monitor' })
  })

  it('parses find queries', () => {
    expect(parseCommand('find stapler')).toEqual({ type: 'findItem', query: 'stapler' })
    expect(parseCommand('where is the projector')).toEqual({ type: 'findItem', query: 'the projector' })
  })

  it('treats a bare term as an item search', () => {
    expect(parseCommand('mouse')).toEqual({ type: 'findItem', query: 'mouse' })
  })

  it('returns unknown for empty input', () => {
    expect(parseCommand('   ').type).toBe('unknown')
  })
})
