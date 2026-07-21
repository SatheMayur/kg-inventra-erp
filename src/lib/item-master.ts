import { Prisma } from '@prisma/client'
import { normalize } from '@/lib/item-resolver/normalize'
import { tokenScore, trigramScore, phoneticScore } from '@/lib/item-resolver/similarity'

export const ITEM_PROCUREMENT_TYPE = {
  STANDARD: 'STANDARD',
  DAILY: 'DAILY',
  BOTH: 'BOTH',
} as const
export const ITEM_PROCUREMENT_TYPES = [
  ITEM_PROCUREMENT_TYPE.STANDARD,
  ITEM_PROCUREMENT_TYPE.DAILY,
  ITEM_PROCUREMENT_TYPE.BOTH,
] as const

export const ITEM_PRICING_MODE = {
  DAILY_MARKET_RATE: 'DAILY_MARKET_RATE',
  CONTRACT_RATE: 'CONTRACT_RATE',
  VENDOR_PRICE_LIST: 'VENDOR_PRICE_LIST',
  LAST_APPROVED_RATE: 'LAST_APPROVED_RATE',
  MANUAL_QUOTATION: 'MANUAL_QUOTATION',
  EMERGENCY_PROVISIONAL_RATE: 'EMERGENCY_PROVISIONAL_RATE',
} as const
export const ITEM_PRICING_MODES = [
  ITEM_PRICING_MODE.DAILY_MARKET_RATE,
  ITEM_PRICING_MODE.CONTRACT_RATE,
  ITEM_PRICING_MODE.VENDOR_PRICE_LIST,
  ITEM_PRICING_MODE.LAST_APPROVED_RATE,
  ITEM_PRICING_MODE.MANUAL_QUOTATION,
  ITEM_PRICING_MODE.EMERGENCY_PROVISIONAL_RATE,
] as const

export const ITEM_NATURE = {
  PERISHABLE: 'PERISHABLE',
  NON_PERISHABLE: 'NON_PERISHABLE',
  SERVICE: 'SERVICE',
} as const
export const ITEM_NATURES = [
  ITEM_NATURE.PERISHABLE,
  ITEM_NATURE.NON_PERISHABLE,
  ITEM_NATURE.SERVICE,
] as const

export const ITEM_SOURCE_CHANNEL = {
  ITEM_MASTER: 'ITEM_MASTER',
  IMPORT: 'IMPORT',
  DAILY_PROCUREMENT_INLINE: 'DAILY_PROCUREMENT_INLINE',
  DAILY_PROCUREMENT_QUICK_ADD: 'DAILY_PROCUREMENT_QUICK_ADD',
  DAILY_PROCUREMENT_IMPORT: 'DAILY_PROCUREMENT_IMPORT',
  REQUISITION: 'REQUISITION',
} as const

export const DAILY_PROCUREMENT_CATEGORY_NAMES = [
  'Vegetables',
  'Fruits',
  'Dairy',
  'Grocery',
  'Bakery',
  'Frozen Items',
  'Meat/Poultry',
  'Packaging',
  'Cleaning Consumables',
] as const

const FULL_ITEM_MASTER_ROLES = new Set(['admin', 'STORE_ADMIN'])
const DAILY_ITEM_CREATOR_ROLES = new Set(['admin', 'STORE_ADMIN', 'PURCHASE_USER'])
const DAILY_ITEM_READER_ROLES = new Set(['admin', 'STORE_ADMIN', 'STORE_OPERATOR', 'PURCHASE_USER', 'ACCOUNTS_USER', 'MANAGEMENT'])
const DAILY_ITEM_VIEW_ALL_ROLES = new Set(['admin', 'STORE_ADMIN', 'PURCHASE_USER'])

export function canCreateStandardItem(role?: string | null) {
  return !!role && FULL_ITEM_MASTER_ROLES.has(role)
}

export function canCreateDailyItem(role?: string | null) {
  return !!role && DAILY_ITEM_CREATOR_ROLES.has(role)
}

export function canQuickAddDailyItem(role?: string | null) {
  return !!role && DAILY_ITEM_CREATOR_ROLES.has(role)
}

export function canImportDailyItems(role?: string | null) {
  return !!role && DAILY_ITEM_CREATOR_ROLES.has(role)
}

export function canViewDailyProcurementItems(role?: string | null) {
  return !!role && DAILY_ITEM_READER_ROLES.has(role)
}

export function canViewAllItemTypes(role?: string | null) {
  return !!role && DAILY_ITEM_VIEW_ALL_ROLES.has(role)
}

export function canApproveMasterReviewItems(role?: string | null) {
  return !!role && FULL_ITEM_MASTER_ROLES.has(role)
}

export function canEditUnitConversions(role?: string | null) {
  return !!role && FULL_ITEM_MASTER_ROLES.has(role)
}

export function normalizeItemName(value: string) {
  return normalize(value)
}

export function canonicalCategoryName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeEnum(value?: string | null) {
  return (value ?? '').trim().toUpperCase()
}

// `perishable` is a derived flag — `itemNature` is the single source of truth (§7).
// Never persist the two independently or they can drift apart.
export function isPerishableNature(itemNature?: string | null) {
  return normalizeEnum(itemNature) === ITEM_NATURE.PERISHABLE
}

export function isDailyProcurementEligibleItem(item: {
  procurementType?: string | null
  dailyProcurementEligible?: boolean | null
  itemNature?: string | null
  active?: boolean | null
  deletedAt?: Date | string | null
}) {
  const procurementType = normalizeEnum(item.procurementType || ITEM_PROCUREMENT_TYPE.STANDARD)
  const itemNature = normalizeEnum(item.itemNature || ITEM_NATURE.NON_PERISHABLE)
  return (
    item.active !== false &&
    !item.deletedAt &&
    item.dailyProcurementEligible === true &&
    (procurementType === ITEM_PROCUREMENT_TYPE.DAILY || procurementType === ITEM_PROCUREMENT_TYPE.BOTH) &&
    itemNature !== ITEM_NATURE.SERVICE
  )
}

export function validateUnitConversion(input: {
  baseUnit?: string | null
  purchaseUnit?: string | null
  consumptionUnit?: string | null
  unitConversion?: number | null
}) {
  if (input.unitConversion !== undefined && input.unitConversion !== null) {
    if (!Number.isFinite(input.unitConversion) || input.unitConversion <= 0) {
      return 'Unit conversion must be greater than zero'
    }
  }
  const units = [input.baseUnit, input.purchaseUnit, input.consumptionUnit].filter((unit) => unit !== undefined && unit !== null)
  if (units.some((unit) => !String(unit).trim())) {
    return 'Units cannot be blank'
  }
  return null
}

export type ItemDuplicateMatch = {
  itemId: string
  name: string
  category: string
  unit: string
  active: boolean
  matchType: 'EXACT_NAME' | 'EXACT_ALIAS' | 'INACTIVE_DUPLICATE' | 'SIMILAR_NAME'
  confidence: number
}

export async function findItemDuplicateMatches(
  tx: Prisma.TransactionClient,
  input: {
    name: string
    category?: string | null
    excludeItemId?: string | null
  },
) {
  const normalizedName = normalizeItemName(input.name)
  const normalizedCategory = normalizeItemName(input.category ?? '')
  const items = await tx.item.findMany({
    where: {
      deletedAt: null,
      ...(input.excludeItemId ? { id: { not: input.excludeItemId } } : {}),
    },
    select: {
      id: true,
      name: true,
      category: true,
      unit: true,
      active: true,
      aliases: { select: { aliasText: true } },
    },
    take: 3000,
  })

  const matches: ItemDuplicateMatch[] = []
  for (const item of items) {
    const itemName = normalizeItemName(item.name)
    const itemCategory = normalizeItemName(item.category)
    const sameCategory = !normalizedCategory || itemCategory === normalizedCategory

    if (itemName === normalizedName && sameCategory) {
      matches.push({
        itemId: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        active: item.active,
        matchType: item.active ? 'EXACT_NAME' : 'INACTIVE_DUPLICATE',
        confidence: 1,
      })
      continue
    }

    const aliasHit = item.aliases.some((alias) => normalizeItemName(alias.aliasText) === normalizedName)
    if (aliasHit) {
      matches.push({
        itemId: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        active: item.active,
        matchType: 'EXACT_ALIAS',
        confidence: 0.96,
      })
      continue
    }

    // Compare against the item name AND all its aliases, across every category,
    // so a misspelling of a local/vendor/multilingual alias (e.g. "Tateta" for a
    // Potato aliased "Batata"/"Aloo") filed under a different category is still
    // surfaced as a soft suggestion instead of becoming a silent duplicate.
    const candidateNames = [itemName, ...item.aliases.map((alias) => normalizeItemName(alias.aliasText))]
    const similarity = candidateNames.reduce((best, candidate) => {
      const score =
        0.55 * tokenScore(normalizedName, candidate) +
        0.3 * trigramScore(normalizedName, candidate) +
        0.15 * phoneticScore(normalizedName, candidate)
      return score > best ? score : best
    }, 0)

    if (similarity >= 0.72) {
      matches.push({
        itemId: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        active: item.active,
        matchType: 'SIMILAR_NAME',
        confidence: Number(similarity.toFixed(2)),
      })
    }
  }

  return matches
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
    .slice(0, 5)
}

export async function ensureItemCategories(
  tx: Prisma.TransactionClient,
  categories: Array<{ name: string; procurementType?: string | null }>,
) {
  const unique = new Map<string, { name: string; procurementType: string }>()
  for (const category of categories) {
    const name = canonicalCategoryName(category.name)
    if (!name) continue
    const procurementType = normalizeEnum(category.procurementType || ITEM_PROCUREMENT_TYPE.STANDARD)
    unique.set(normalizeItemName(name), { name, procurementType })
  }

  for (const category of unique.values()) {
    await tx.itemCategory.upsert({
      where: { name: category.name },
      create: { name: category.name, procurementType: category.procurementType, active: true },
      update: { active: true },
    })
  }
}

export async function ensureDefaultDailyCategories(tx: Prisma.TransactionClient) {
  await ensureItemCategories(
    tx,
    DAILY_PROCUREMENT_CATEGORY_NAMES.map((name) => ({
      name,
      procurementType: ITEM_PROCUREMENT_TYPE.DAILY,
    })),
  )
}
