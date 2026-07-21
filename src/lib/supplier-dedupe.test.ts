import { describe, expect, it } from 'vitest'
import {
  collectSupplierDuplicateMatches,
  isSupplierUsableForPo,
  normalizeGstin,
  normalizePhoneNumber,
  panFromGstin,
} from './supplier-dedupe'

describe('supplier dedupe helpers', () => {
  const existing = [
    {
      id: 's1',
      name: 'Ambika Traders',
      gstNumber: '24AAAAC1234A1Z1',
      phone: '919876543210',
      contact: null,
      email: 'Orders@Ambika.example',
    },
    {
      id: 's2',
      name: 'North Tools',
      gstNumber: '27BBBBB1234B1Z5',
      phone: null,
      contact: '080-1234-5678',
      email: null,
    },
  ]

  it('normalizes GSTIN, PAN and phone identities', () => {
    expect(normalizeGstin(' 24 aaaac1234a1z1 ')).toBe('24AAAAC1234A1Z1')
    expect(panFromGstin('24AAAAC1234A1Z1')).toBe('AAAAC1234A')
    expect(normalizePhoneNumber('+91 98765 43210')).toBe('9876543210')
  })

  it('detects duplicates by normalized name, GSTIN, phone, and email', () => {
    const matches = collectSupplierDuplicateMatches(
      {
        name: ' ambika   traders ',
        gstNumber: '24aaaac1234a1z1',
        phone: '+91 98765 43210',
        email: 'orders@ambika.example',
      },
      existing,
    )

    expect(matches.map((match) => match.field)).toEqual(
      expect.arrayContaining(['name', 'gstNumber', 'panFromGstin', 'phone', 'email']),
    )
  })

  it('detects phone numbers stored in the legacy contact field', () => {
    const matches = collectSupplierDuplicateMatches(
      { name: 'Different Supplier', contact: '08012345678' },
      existing,
    )

    expect(matches.some((match) => match.field === 'phone' && match.supplier.id === 's2')).toBe(true)
  })

  it('blocks inactive or blocked suppliers for PO use', () => {
    expect(isSupplierUsableForPo({ active: true, status: 'ACTIVE' })).toBe(true)
    expect(isSupplierUsableForPo({ active: false, status: 'ACTIVE' })).toBe(false)
    expect(isSupplierUsableForPo({ active: true, status: 'BLOCKED' })).toBe(false)
    expect(isSupplierUsableForPo({ active: true, status: 'INACTIVE' })).toBe(false)
  })
})
