import { canonicalUnit, isSameUnit } from '@/lib/daily-procurement'
import { normalizeEnum } from '@/lib/item-master'

// Reuse the single unit-alias table that already lives in daily-procurement.ts so
// there is exactly one canonicalisation source across the app (no second system).
export { canonicalUnit, isSameUnit }

// Conversion rules (§5). String union + const array to match the codebase's
// "enum" convention (no Prisma enums).
export const CONVERSION_TYPE = {
  NONE: 'NONE', // purchase = base = consumption; no factor
  FIXED: 'FIXED', // deterministic factor, e.g. 1 bag = 25 kg
  PACK: 'PACK', // fixed count per pack, e.g. 1 box = 12 pcs
  VARIABLE_WEIGHT: 'VARIABLE_WEIGHT', // nominal factor; real weight varies per receipt → approximate
} as const
export const CONVERSION_TYPES = [
  CONVERSION_TYPE.NONE,
  CONVERSION_TYPE.FIXED,
  CONVERSION_TYPE.PACK,
  CONVERSION_TYPE.VARIABLE_WEIGHT,
] as const
export type ConversionType = (typeof CONVERSION_TYPES)[number]

// Unit kinds for the Unit Master lookup.
export const UNIT_KIND = {
  WEIGHT: 'WEIGHT',
  VOLUME: 'VOLUME',
  COUNT: 'COUNT',
  PACK: 'PACK',
} as const

// Canonical seed for the Unit Master — codes match canonicalUnit() output.
export const DEFAULT_UNITS: Array<{ code: string; name: string; kind: string }> = [
  { code: 'kg', name: 'Kilogram', kind: UNIT_KIND.WEIGHT },
  { code: 'g', name: 'Gram', kind: UNIT_KIND.WEIGHT },
  { code: 'l', name: 'Litre', kind: UNIT_KIND.VOLUME },
  { code: 'ml', name: 'Millilitre', kind: UNIT_KIND.VOLUME },
  { code: 'pcs', name: 'Pieces', kind: UNIT_KIND.COUNT },
  { code: 'dozen', name: 'Dozen', kind: UNIT_KIND.COUNT },
  { code: 'packet', name: 'Packet', kind: UNIT_KIND.PACK },
  { code: 'box', name: 'Box', kind: UNIT_KIND.PACK },
  { code: 'crate', name: 'Crate', kind: UNIT_KIND.PACK },
  { code: 'tray', name: 'Tray', kind: UNIT_KIND.PACK },
  { code: 'bag', name: 'Bag', kind: UNIT_KIND.PACK },
  { code: 'bundle', name: 'Bundle', kind: UNIT_KIND.PACK },
]

export function isConversionApproximate(conversionType?: string | null) {
  return normalizeEnum(conversionType) === CONVERSION_TYPE.VARIABLE_WEIGHT
}

export type ResolvedConversion = {
  baseUnit: string
  purchaseUnit: string
  consumptionUnit: string
  conversionType: ConversionType
  unitConversion: number
  conversionApproximate: boolean
}

export type ConversionResolution =
  | ({ ok: true } & ResolvedConversion)
  | { ok: false; error: string }

// Single authority for validating + normalising an item's units and conversion
// rule. Canonicalises the three unit fields, infers the conversion type when the
// caller omits it, and enforces the per-type factor rules (§4, §5).
export function resolveConversion(input: {
  baseUnit?: string | null
  purchaseUnit?: string | null
  consumptionUnit?: string | null
  unitConversion?: number | null
  conversionType?: string | null
}): ConversionResolution {
  const baseUnit = canonicalUnit(input.baseUnit ?? '')
  if (!baseUnit) return { ok: false, error: 'Base unit is required' }

  // Purchase / consumption units default to the base unit when blank.
  const purchaseUnit = canonicalUnit((input.purchaseUnit ?? '').trim() || baseUnit)
  const consumptionUnit = canonicalUnit((input.consumptionUnit ?? '').trim() || baseUnit)

  if (input.unitConversion !== undefined && input.unitConversion !== null) {
    if (!Number.isFinite(input.unitConversion) || input.unitConversion <= 0) {
      return { ok: false, error: 'Unit conversion must be greater than zero' }
    }
  }
  const factor = input.unitConversion ?? 1

  const sameUnit = isSameUnit(baseUnit, purchaseUnit)
  let conversionType = normalizeEnum(input.conversionType)
  if (!conversionType) {
    conversionType = sameUnit ? CONVERSION_TYPE.NONE : CONVERSION_TYPE.FIXED
  } else if (!CONVERSION_TYPES.includes(conversionType as ConversionType)) {
    return { ok: false, error: `Unknown conversion type "${input.conversionType}"` }
  }

  if (conversionType === CONVERSION_TYPE.NONE) {
    if (!sameUnit) {
      return {
        ok: false,
        error: 'Conversion type NONE requires the purchase unit to match the base unit',
      }
    }
    return {
      ok: true,
      baseUnit,
      purchaseUnit,
      consumptionUnit,
      conversionType: CONVERSION_TYPE.NONE,
      unitConversion: 1,
      conversionApproximate: false,
    }
  }

  return {
    ok: true,
    baseUnit,
    purchaseUnit,
    consumptionUnit,
    conversionType: conversionType as ConversionType,
    unitConversion: factor,
    conversionApproximate: conversionType === CONVERSION_TYPE.VARIABLE_WEIGHT,
  }
}
