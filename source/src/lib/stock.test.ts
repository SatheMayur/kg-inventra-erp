import { describe, it, expect } from 'vitest'
import { reserveStock } from '@/lib/stock'

function fakeTx() {
  const calls: any[] = []
  const tx = { item: { update: async (args: any) => { calls.push(args); return {} } } } as any
  return { tx, calls }
}

describe('reserveStock', () => {
  it('increments reservedQty by a positive qty', async () => {
    const { tx, calls } = fakeTx()
    await reserveStock(tx, 'item1', 5)
    expect(calls).toEqual([{ where: { id: 'item1' }, data: { reservedQty: { increment: 5 } } }])
  })

  it('is a no-op for zero, negative, or non-finite qty', async () => {
    const { tx, calls } = fakeTx()
    await reserveStock(tx, 'item1', 0)
    await reserveStock(tx, 'item1', -3)
    await reserveStock(tx, 'item1', NaN)
    expect(calls).toEqual([])
  })
})
