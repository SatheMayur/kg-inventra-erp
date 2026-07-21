import { roundQty } from '@/lib/daily-procurement'

export const DAILY_CONVERSATION_STATUS = {
  DRAFT: 'DRAFT',
  SENT_TO_VENDOR: 'SENT_TO_VENDOR',
  AWAITING_VENDOR_REPLY: 'AWAITING_VENDOR_REPLY',
  REPLY_RECEIVED: 'REPLY_RECEIVED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  PARTIALLY_CONFIRMED: 'PARTIALLY_CONFIRMED',
  CONFIRMED: 'CONFIRMED',
  SHORTAGE: 'SHORTAGE',
  ALTERNATE_VENDOR_REQUIRED: 'ALTERNATE_VENDOR_REQUIRED',
  READY_FOR_RECEIVING: 'READY_FOR_RECEIVING',
  RECEIVED: 'RECEIVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const

export const PROCUREMENT_MESSAGE_TYPE = {
  REQUIREMENT_SENT: 'REQUIREMENT_SENT',
  VENDOR_REPLY: 'VENDOR_REPLY',
  USER_REPLY: 'USER_REPLY',
  SUPPLY_CONFIRMATION: 'SUPPLY_CONFIRMATION',
  SHORTAGE_MESSAGE: 'SHORTAGE_MESSAGE',
  ALTERNATE_VENDOR_REQUEST: 'ALTERNATE_VENDOR_REQUEST',
  DELIVERY_UPDATE: 'DELIVERY_UPDATE',
  SYSTEM_EVENT: 'SYSTEM_EVENT',
  MANUAL_NOTE: 'MANUAL_NOTE',
} as const

export type RequirementMessageLine = {
  itemName: string
  requestedQty: number
  unit: string
  qualityGrade?: string | null
  notes?: string | null
}

export function buildRequirementMessage(input: {
  vendorName: string
  requirementReference: string
  deliveryDate: string
  deliveryTime?: string | null
  deliveryLocation?: string | null
  greeting?: string | null
  notes?: string | null
  lines: RequirementMessageLine[]
}) {
  const greeting = input.greeting?.trim() || `Namaste ${input.vendorName},`
  const itemLines = input.lines.map((line, index) => {
    const grade = line.qualityGrade ? `, ${line.qualityGrade}` : ''
    const note = line.notes ? ` — ${line.notes}` : ''
    return `${index + 1}. ${line.itemName}: ${roundQty(line.requestedQty)} ${line.unit}${grade}${note}`
  })

  return [
    greeting,
    '',
    `Please supply the following items for ${input.deliveryDate}:`,
    '',
    ...itemLines,
    '',
    input.deliveryTime ? `Delivery Time: ${input.deliveryTime}` : null,
    input.deliveryLocation ? `Delivery Location: ${input.deliveryLocation}` : null,
    input.notes?.trim() || null,
    '',
    'Please confirm availability and delivery time.',
    '',
    `Reference: ${input.requirementReference}`,
  ].filter((line): line is string => line !== null).join('\n')
}

export type VendorReplyLineSuggestion = {
  batchLineId: string
  itemName: string
  confirmedQty: number | null
  vendorRate: number | null
  status: 'CONFIRMED' | 'PARTIAL' | 'UNAVAILABLE' | 'NEEDS_REVIEW'
  confidence: number
}

const CONFIRM_WORDS = /\b(ok|okay|confirmed|confirm|available|done|yes|haan|ha)\b|હા|ઉપલબ્ધ|पक्का|उपलब्ध/i
const NEGATIVE_WORDS = /\b(no|not available|unavailable|cannot|can't|nai|nahi|short)\b|નથી|ઉપલબ્ધ નથી|नहीं|उपलब्ध नहीं/i

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function numberNearItem(message: string, itemName: string) {
  const escaped = escapeRegExp(itemName)
  const after = message.match(new RegExp(`${escaped}[^\\d]{0,20}(\\d+(?:\\.\\d+)?)`, 'i'))
  if (after) return Number(after[1])
  const before = message.match(new RegExp(`(\\d+(?:\\.\\d+)?)[^\\n]{0,20}${escaped}`, 'i'))
  return before ? Number(before[1]) : null
}

function rateNearItem(message: string, itemName: string) {
  const escaped = escapeRegExp(itemName)
  const match = message.match(new RegExp(`${escaped}[^\\n]{0,50}(?:rs\\.?|₹|rate|@)\\s*(\\d+(?:\\.\\d+)?)`, 'i'))
  return match ? Number(match[1]) : null
}

export function parseVendorSupplyReply(
  message: string,
  lines: Array<{ batchLineId: string; itemName: string; requestedQty: number }>,
) {
  const trimmed = message.trim()
  const fullPositive = CONFIRM_WORDS.test(trimmed) && !NEGATIVE_WORDS.test(trimmed)
  const hasNegative = NEGATIVE_WORDS.test(trimmed)

  const suggestions: VendorReplyLineSuggestion[] = lines.map((line) => {
    const itemMentioned = trimmed.toLowerCase().includes(line.itemName.toLowerCase())
    const quantity = itemMentioned ? numberNearItem(trimmed, line.itemName) : null
    const rate = itemMentioned ? rateNearItem(trimmed, line.itemName) : null

    if (itemMentioned && hasNegative && quantity === null) {
      return { ...line, confirmedQty: 0, vendorRate: rate, status: 'UNAVAILABLE' as const, confidence: 0.82 }
    }
    if (itemMentioned && quantity !== null) {
      const confirmedQty = Math.max(0, quantity)
      return {
        ...line,
        confirmedQty,
        vendorRate: rate,
        status: confirmedQty >= line.requestedQty ? 'CONFIRMED' as const : 'PARTIAL' as const,
        confidence: 0.78,
      }
    }
    if (fullPositive && lines.length === 1) {
      return { ...line, confirmedQty: line.requestedQty, vendorRate: rate, status: 'CONFIRMED' as const, confidence: 0.9 }
    }
    return { ...line, confirmedQty: null, vendorRate: rate, status: 'NEEDS_REVIEW' as const, confidence: fullPositive ? 0.45 : 0.25 }
  })

  const confidence = suggestions.length
    ? Math.min(...suggestions.map((line) => line.confidence))
    : 0

  return {
    availability: fullPositive ? 'AVAILABLE' : hasNegative ? 'SHORT_OR_UNAVAILABLE' : 'UNKNOWN',
    lines: suggestions,
    confidence,
    requiresHumanReview: suggestions.some((line) => line.status === 'NEEDS_REVIEW') || confidence < 0.75,
  }
}

export function deriveConversationStatus(lines: Array<{ requestedQty: number; confirmedQty: number; cancelledQty?: number }>) {
  const requested = lines.reduce((sum, line) => sum + line.requestedQty, 0)
  const confirmed = lines.reduce((sum, line) => sum + line.confirmedQty, 0)
  const cancelled = lines.reduce((sum, line) => sum + (line.cancelledQty ?? 0), 0)
  if (confirmed <= 0 && cancelled >= requested) return DAILY_CONVERSATION_STATUS.CANCELLED
  if (confirmed <= 0) return DAILY_CONVERSATION_STATUS.SHORTAGE
  if (confirmed + cancelled + 0.001 < requested) return DAILY_CONVERSATION_STATUS.PARTIALLY_CONFIRMED
  return DAILY_CONVERSATION_STATUS.CONFIRMED
}
