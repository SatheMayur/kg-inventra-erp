import { describe, expect, it } from 'vitest'
import {
  CONVERSION_TYPE,
  CONVERSION_TYPES,
  canonicalUnit,
  isConversionApproximate,
  resolveConversion,
} from '@/lib/units'

describe('Unit Master canonicalisation', () => {
  it('re-exports canonicalUnit so free-text units collapse to a single code', () => {
    expect(canonicalUnit('Kilogram')).toBe('kg')
    expect(canonicalUnit('KG')).toBe('kg')
    expect(canonicalUnit('  kilos ')).toBe('kg')
  })
})

describe('CONVERSION_TYPES', () => {
  it('covers the four conversion rules from the spec', () => {
    expect(CONVERSION_TYPES).toEqual(['NONE', 'FIXED', 'PACK', 'VARIABLE_WEIGHT'])
  })
})

describe('isConversionApproximate', () => {
  it('is true only for variable-weight conversions', () => {
    expect(isConversionApproximate(CONVERSION_TYPE.VARIABLE_WEIGHT)).toBe(true)
    expect(isConversionApproximate(CONVERSION_TYPE.FIXED)).toBe(false)
    expect(isConversionApproximate(CONVERSION_TYPE.PACK)).toBe(false)
    expect(isConversionApproximate(CONVERSION_TYPE.NONE)).toBe(false)
    expect(isConversionApproximate(null)).toBe(false)
  })
})

describe('resolveConversion', () => {
  it('infers NONE and forces factor 1 when purchase unit matches base unit', () => {
    const result = resolveConversion({ baseUnit: 'Kilogram', purchaseUnit: 'kg' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.conversionType).toBe(CONVERSION_TYPE.NONE)
    expect(result.baseUnit).toBe('kg')
    expect(result.purchaseUnit).toBe('kg')
    expect(result.unitConversion).toBe(1)
    expect(result.conversionApproximate).toBe(false)
  })

  it('canonicalises all three unit fields in the result', () => {
    const result = resolveConversion({
      baseUnit: 'KG',
      purchaseUnit: 'Bag',
      consumptionUnit: 'Grams',
      unitConversion: 25,
      conversionType: CONVERSION_TYPE.FIXED,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.baseUnit).toBe('kg')
    expect(result.purchaseUnit).toBe('bag')
    expect(result.consumptionUnit).toBe('g')
  })

  it('infers FIXED when the units differ and no type is given', () => {
    const result = resolveConversion({ baseUnit: 'kg', purchaseUnit: 'bag', unitConversion: 25 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.conversionType).toBe(CONVERSION_TYPE.FIXED)
    expect(result.unitConversion).toBe(25)
  })

  it('keeps a PACK factor and reports it as exact', () => {
    const result = resolveConversion({
      baseUnit: 'pcs',
      purchaseUnit: 'box',
      unitConversion: 12,
      conversionType: CONVERSION_TYPE.PACK,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.conversionType).toBe(CONVERSION_TYPE.PACK)
    expect(result.unitConversion).toBe(12)
    expect(result.conversionApproximate).toBe(false)
  })

  it('flags VARIABLE_WEIGHT conversions as approximate', () => {
    const result = resolveConversion({
      baseUnit: 'kg',
      purchaseUnit: 'crate',
      unitConversion: 8,
      conversionType: CONVERSION_TYPE.VARIABLE_WEIGHT,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.conversionType).toBe(CONVERSION_TYPE.VARIABLE_WEIGHT)
    expect(result.unitConversion).toBe(8)
    expect(result.conversionApproximate).toBe(true)
  })

  it('rejects NONE when the purchase unit does not match the base unit', () => {
    const result = resolveConversion({
      baseUnit: 'kg',
      purchaseUnit: 'bag',
      unitConversion: 25,
      conversionType: CONVERSION_TYPE.NONE,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/NONE/)
  })

  it('rejects a non-positive conversion factor', () => {
    expect(resolveConversion({ baseUnit: 'kg', purchaseUnit: 'bag', unitConversion: 0 }).ok).toBe(false)
    expect(resolveConversion({ baseUnit: 'kg', purchaseUnit: 'bag', unitConversion: -5 }).ok).toBe(false)
  })

  it('rejects a blank base unit', () => {
    const result = resolveConversion({ baseUnit: '   ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/base unit/i)
  })

  it('rejects an unknown conversion type', () => {
    const result = resolveConversion({ baseUnit: 'kg', conversionType: 'MAGIC' })
    expect(result.ok).toBe(false)
  })
})
