import { randomBytes } from 'crypto'

export const DAILY_PROCUREMENT_MODULE = 'DAILY_PROCUREMENT'

export const DAILY_PROCUREMENT_STATUS = {
  DRAFT: 'DRAFT',
  REQUIREMENTS_READY: 'REQUIREMENTS_READY',
  ENQUIRY_SENT: 'ENQUIRY_SENT',
  QUOTES_RECEIVED: 'QUOTES_RECEIVED',
  ALLOCATION_READY: 'ALLOCATION_READY',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SUPPLY_ORDERED: 'SUPPLY_ORDERED',
  RECEIVING: 'RECEIVING',
  GRN_POSTED: 'GRN_POSTED',
  INVOICE_RECONCILED: 'INVOICE_RECONCILED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const

export const DAILY_LINE_STATUS = {
  OPEN: 'OPEN',
  ENQUIRY_SENT: 'ENQUIRY_SENT',
  QUOTED: 'QUOTED',
  ALLOCATED: 'ALLOCATED',
  ORDERED: 'ORDERED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const

export const DAILY_ENQUIRY_STATUS = {
  DRAFT: 'DRAFT',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const

export const DAILY_BUSINESS_RESPONSE_STATUS = {
  AWAITING_RESPONSE: 'AWAITING_RESPONSE',
  QUOTATION_RECEIVED: 'QUOTATION_RECEIVED',
  PARTIALLY_QUOTED: 'PARTIALLY_QUOTED',
  UNAVAILABLE: 'UNAVAILABLE',
  VENDOR_DECLINED: 'VENDOR_DECLINED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  VERIFIED: 'VERIFIED',
  EXPIRED: 'EXPIRED',
} as const

export const DAILY_MESSAGE_STATUS = {
  DRAFT: 'DRAFT',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
} as const

export const DAILY_QUOTE_STATUS = {
  UNPARSED: 'UNPARSED',
  PARSED: 'PARSED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const

export const DAILY_ALLOCATION_STATUS = {
  PROPOSED: 'PROPOSED',
  APPROVED: 'APPROVED',
  ORDERED: 'ORDERED',
  CANCELLED: 'CANCELLED',
} as const

export const DAILY_SUPPLY_ORDER_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  CONFIRMED: 'CONFIRMED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const

const READ_ROLES = new Set(['admin', 'STORE_ADMIN', 'STORE_OPERATOR', 'DEPT_USER', 'DEPT_HEAD', 'PURCHASE_USER', 'ACCOUNTS_USER', 'MANAGEMENT'])
const CREATE_ROLES = new Set(['admin', 'STORE_ADMIN', 'STORE_OPERATOR', 'DEPT_USER', 'DEPT_HEAD', 'PURCHASE_USER'])
const MANAGE_ROLES = new Set(['admin', 'STORE_ADMIN', 'PURCHASE_USER'])
const OVERRIDE_ROLES = new Set(['admin', 'STORE_ADMIN', 'PURCHASE_USER', 'MANAGEMENT'])

export function canReadDailyProcurement(role?: string | null) {
  return !!role && READ_ROLES.has(role)
}

export function canManageDailyProcurement(role?: string | null) {
  return !!role && MANAGE_ROLES.has(role)
}

export function canCreateDailyRequirement(role?: string | null) {
  return !!role && CREATE_ROLES.has(role)
}

export function canOverrideDailyProcurementQuantity(role?: string | null) {
  return !!role && OVERRIDE_ROLES.has(role)
}

export function roundQty(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateNetPurchaseQuantity(input: {
  operationalRequirement: number
  requiredClosingStock?: number
  usableStock?: number
  confirmedPendingSupply?: number
}) {
  const net =
    input.operationalRequirement +
    (input.requiredClosingStock ?? 0) -
    (input.usableStock ?? 0) -
    (input.confirmedPendingSupply ?? 0)

  return roundQty(Math.max(0, net))
}

export function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`)
  }
}

const UNIT_ALIASES: Record<string, string> = {
  kilogram: 'kg',
  kilograms: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kg: 'kg',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  gms: 'g',
  g: 'g',
  litre: 'l',
  liter: 'l',
  litres: 'l',
  liters: 'l',
  ltr: 'l',
  ltrs: 'l',
  l: 'l',
  millilitre: 'ml',
  milliliter: 'ml',
  ml: 'ml',
  piece: 'pcs',
  pieces: 'pcs',
  pc: 'pcs',
  pcs: 'pcs',
  nos: 'pcs',
  no: 'pcs',
  packet: 'packet',
  packets: 'packet',
  pkt: 'packet',
  box: 'box',
  boxes: 'box',
  crate: 'crate',
  crates: 'crate',
  tray: 'tray',
  trays: 'tray',
  bag: 'bag',
  bags: 'bag',
  dozen: 'dozen',
  doz: 'dozen',
  bundle: 'bundle',
  bundles: 'bundle',
}

export function canonicalUnit(unit: string) {
  const key = unit.trim().toLowerCase()
  return UNIT_ALIASES[key] ?? key
}

export function isSameUnit(a: string, b: string) {
  return canonicalUnit(a) === canonicalUnit(b)
}

export function normalizeQuotedRate(input: {
  quotedRate: number
  quotedUnit: string
  stockUnit: string
  conversionFactor?: number | null
}) {
  assertFiniteNonNegative(input.quotedRate, 'Quoted rate')
  const sameUnit = isSameUnit(input.quotedUnit, input.stockUnit)
  const factor = input.conversionFactor ?? (sameUnit ? 1 : null)

  if (!factor || !Number.isFinite(factor) || factor <= 0) {
    return {
      normalizedRate: null,
      conversionFactor: null,
      needsConversionReview: true,
    }
  }

  return {
    normalizedRate: roundMoney(input.quotedRate / factor),
    conversionFactor: factor,
    needsConversionReview: !sameUnit,
  }
}

export function calculateUnitLandedRate(input: {
  normalizedRate: number
  transportCharge?: number
  taxRate?: number
  quantityForTransport?: number
}) {
  assertFiniteNonNegative(input.normalizedRate, 'Normalized rate')
  const transportCharge = input.transportCharge ?? 0
  const taxRate = input.taxRate ?? 0
  const qty = input.quantityForTransport && input.quantityForTransport > 0 ? input.quantityForTransport : 1
  const transportPerUnit = transportCharge / qty
  const taxableUnitRate = input.normalizedRate + transportPerUnit
  return roundMoney(taxableUnitRate * (1 + taxRate / 100))
}

export type DailyQuoteCandidate = {
  quoteId: string
  supplierId: string
  supplierName: string
  requestedQuantity: number
  availableQuantity: number
  normalizedRate: number | null
  transportCharge?: number | null
  taxRate?: number | null
  qualityGrade?: string | null
  requiredQualityGrade?: string | null
  deliveryTime?: Date | string | null
  verificationStatus: string
  conversionApproximate?: boolean | null
}

export type DailyQuoteRecommendation = {
  quoteId: string
  supplierId: string
  supplierName: string
  score: number
  landedRate: number
  availableQuantity: number
  coverageRatio: number
  reasons: string[]
}

export function rankVendorQuotes(candidates: DailyQuoteCandidate[]): DailyQuoteRecommendation[] {
  const verified = candidates.filter((candidate) => candidate.verificationStatus === DAILY_QUOTE_STATUS.VERIFIED)
  const priced = verified.filter((candidate) => candidate.normalizedRate !== null && Number.isFinite(candidate.normalizedRate))

  if (priced.length === 0) return []

  const landed = priced.map((candidate) => {
    const landedRate = calculateUnitLandedRate({
      normalizedRate: candidate.normalizedRate!,
      transportCharge: candidate.transportCharge ?? 0,
      taxRate: candidate.taxRate ?? 0,
      quantityForTransport: candidate.availableQuantity,
    })
    return { candidate, landedRate }
  })

  const minRate = Math.min(...landed.map((entry) => entry.landedRate))
  const maxRate = Math.max(...landed.map((entry) => entry.landedRate))
  const rateSpan = Math.max(0.01, maxRate - minRate)

  return landed
    .map(({ candidate, landedRate }) => {
      const coverageRatio = candidate.requestedQuantity > 0
        ? Math.min(1, candidate.availableQuantity / candidate.requestedQuantity)
        : 0
      const lowerRateScore = 1 - ((landedRate - minRate) / rateSpan)
      const qualityMatches = candidate.requiredQualityGrade
        ? (candidate.qualityGrade ?? '').trim().toLowerCase() === candidate.requiredQualityGrade.trim().toLowerCase()
        : true
      const conversionPenalty = candidate.conversionApproximate ? 0.05 : 0
      const score = Math.round((
        lowerRateScore * 30 +
        coverageRatio * 35 +
        (qualityMatches ? 25 : 0) +
        10 -
        conversionPenalty * 100
      ) * 10) / 10

      const reasons: string[] = []
      if (landedRate === minRate) reasons.push('Lowest verified landed rate')
      if (coverageRatio >= 1) reasons.push('Can supply full required quantity')
      if (coverageRatio > 0 && coverageRatio < 1) reasons.push('Partial quantity available')
      if (qualityMatches && candidate.requiredQualityGrade) reasons.push('Matches required quality grade')
      if (!qualityMatches && candidate.requiredQualityGrade) reasons.push('Quality grade differs from requirement')
      if (candidate.conversionApproximate) reasons.push('Unit conversion is approximate and needs review')
      reasons.push('No historical supplier score configured yet')

      return {
        quoteId: candidate.quoteId,
        supplierId: candidate.supplierId,
        supplierName: candidate.supplierName,
        score,
        landedRate,
        availableQuantity: candidate.availableQuantity,
        coverageRatio: roundQty(coverageRatio),
        reasons,
      }
    })
    .sort((a, b) => b.score - a.score || a.landedRate - b.landedRate)
}

export function buildDocumentReference(prefix: string, documentNumber: string) {
  const suffix = randomBytes(3).toString('hex').toUpperCase()
  return `${prefix}-${documentNumber}-${suffix}`
}

export function normalizeWhatsAppPhone(phone?: string | null) {
  const clean = phone?.replace(/\D/g, '') ?? ''
  if (!clean) return null
  return `${clean}@s.whatsapp.net`
}

export function buildDailyRateEnquiryMessage(input: {
  reference: string
  batchNumber: string
  deliveryDate: string
  deliveryLocation?: string | null
  deliveryTimeSlot?: string | null
  lines: Array<{
    itemName: string
    requestedQty: number
    unit: string
    qualityGrade?: string | null
    itemSpec?: string | null
  }>
}) {
  const location = input.deliveryLocation ? `\nDelivery location: ${input.deliveryLocation}` : ''
  const slot = input.deliveryTimeSlot ? `\nDelivery slot: ${input.deliveryTimeSlot}` : ''
  const lines = input.lines
    .map((line) => {
      const grade = line.qualityGrade ? `, grade ${line.qualityGrade}` : ''
      const spec = line.itemSpec ? `, spec ${line.itemSpec}` : ''
      return `- ${line.itemName}: ${roundQty(line.requestedQty)} ${line.unit}${grade}${spec}`
    })
    .join('\n')

  return [
    `Daily Rate Enquiry ${input.reference}`,
    `Batch: ${input.batchNumber}`,
    `Delivery date: ${input.deliveryDate}${location}${slot}`,
    '',
    'Please reply with available quantity, rate, unit, quality/grade, delivery time, tax, transport charge, and remarks.',
    '',
    lines,
  ].join('\n')
}

export function buildDailySupplyOrderMessage(input: {
  reference: string
  batchNumber: string
  orderNumber: string
  deliveryDate?: string | null
  deliveryLocation?: string | null
  deliveryTimeSlot?: string | null
  lines: Array<{
    itemName: string
    orderedQty: number
    unit: string
    rate: number
  }>
}) {
  const date = input.deliveryDate ? `\nDelivery date: ${input.deliveryDate}` : ''
  const location = input.deliveryLocation ? `\nDelivery location: ${input.deliveryLocation}` : ''
  const slot = input.deliveryTimeSlot ? `\nDelivery slot: ${input.deliveryTimeSlot}` : ''
  const lines = input.lines
    .map((line) => `- ${line.itemName}: ${roundQty(line.orderedQty)} ${line.unit} @ Rs. ${roundMoney(line.rate).toFixed(2)}`)
    .join('\n')

  return [
    `Daily Supply Order ${input.reference}`,
    `Order: ${input.orderNumber}`,
    `Batch: ${input.batchNumber}${date}${location}${slot}`,
    '',
    'Please confirm availability, delivery time, and final accepted order.',
    '',
    lines,
  ].join('\n')
}
