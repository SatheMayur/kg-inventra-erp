import { describe, it, expect } from 'vitest'
import { normalizeScanCode, resolveScan, type ScanDeps, type ScanItem } from './scan'

const item = (over: Partial<ScanItem> = {}): ScanItem => ({
  id: 'item1', name: 'Pen', category: 'Stationery', unit: 'pcs',
  stock: 10, reservedQty: 2, minStock: 5, price: 3, deletedAt: null, ...over,
})

const deps = (over: Partial<ScanDeps> = {}): ScanDeps => ({
  findItemById: async () => null,
  findItemByBarcode: async () => null,
  findVariantByBarcode: async () => null,
  ...over,
})

describe('normalizeScanCode', () => {
  it('strips storehub: prefix', () => {
    expect(normalizeScanCode('storehub:abc123')).toBe('abc123')
  })
  it('trims and passes raw codes through', () => {
    expect(normalizeScanCode('  8901234 ')).toBe('8901234')
  })
})

describe('resolveScan', () => {
  it('resolves storehub: QR code by item id', async () => {
    const d = deps({ findItemById: async (id) => (id === 'abc' ? item({ id: 'abc' }) : null) })
    const r = await resolveScan('storehub:abc', d)
    expect(r?.item.id).toBe('abc')
    expect(r?.available).toBe(8)
  })
  it('resolves raw item id (legacy CODE128 labels)', async () => {
    const d = deps({ findItemById: async () => item() })
    expect((await resolveScan('item1', d))?.item.id).toBe('item1')
  })
  it('resolves manufacturer barcode on Item', async () => {
    const d = deps({ findItemByBarcode: async (b) => (b === '890' ? item() : null) })
    expect((await resolveScan('890', d))?.item.id).toBe('item1')
  })
  it('resolves variant barcode and includes variant', async () => {
    const d = deps({
      findVariantByBarcode: async () => ({
        variant: { id: 'v1', name: 'Box of 10', packSize: '10', stock: 4 },
        item: item(),
      }),
    })
    const r = await resolveScan('vbar', d)
    expect(r?.variant?.id).toBe('v1')
    expect(r?.item.id).toBe('item1')
  })
  it('returns null on no match', async () => {
    expect(await resolveScan('nope', deps())).toBeNull()
  })
  it('treats deleted items as not found on every path', async () => {
    const dead = item({ deletedAt: new Date() })
    const d = deps({
      findItemById: async () => dead,
      findItemByBarcode: async () => dead,
      findVariantByBarcode: async () => ({ variant: { id: 'v1', name: 'x', packSize: '', stock: 0 }, item: dead }),
    })
    expect(await resolveScan('item1', d)).toBeNull()
  })
  it('returns null for empty code', async () => {
    expect(await resolveScan('  ', deps())).toBeNull()
  })
})
