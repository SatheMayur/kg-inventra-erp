export type DocumentType = 'INVOICE' | 'ERP_DASHBOARD' | 'RECEIPT' | 'OTHER'

export interface DocumentClassificationResult {
  image_type: DocumentType
  confidence: number
  reasons: string[]
}

type ScoreBucket = {
  score: number
  reasons: string[]
}

const ERP_STRONG_PHRASES = [
  'store item master',
  'store requisition master',
  'store purchase invoice detail',
  'procurement ops',
  'purchase & supply',
  'record vendor invoice',
  'raise purchase order',
  'add supplier',
  'inventory erp',
  'internal access only',
  'sign in to continue',
]

const ERP_HINTS = [
  'workspace',
  'inventory',
  'procurement',
  'analytics',
  'dashboard',
  'internal tool',
  'purchase order',
  'linked po',
  'item master',
  'requisition',
  'current stock',
  'minimum value',
  'maximum value',
  'consume stock',
  'auto ack',
  'transfer items',
  'store requisition',
  'store item',
  'view invoice',
  'view po data',
  'bar code print',
  'barcode print',
  'save edit delete',
  'search refresh close',
]

const INVOICE_STRONG_PHRASES = [
  'tax invoice',
  'gstin',
  'invoice no',
  'invoice number',
  'grand total',
  'total amount after tax',
  'place of supply',
  'description of goods',
  'hsn',
  'sac',
]

const INVOICE_HINTS = [
  'bill to',
  'ship to',
  'invoice date',
  'bill no',
  'challan',
  'subtotal',
  'subtotal',
  'amount',
  'quantity',
  'qty',
  'rate',
  'cgst',
  'sgst',
  'igst',
  'tax',
  'supplier',
  'buyer',
  'party',
  'reverse charge',
]

const RECEIPT_HINTS = [
  'receipt',
  'cash memo',
  'thank you',
  'paid',
  'cash',
  'card',
  'change',
  'item',
  'total',
  'subtotal',
]

function normalizeText(rawText: string) {
  return rawText
    .toLowerCase()
    .replace(/[|¦]/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countPhraseHits(text: string, phrases: string[]): ScoreBucket {
  const reasons: string[] = []
  let score = 0

  for (const phrase of phrases) {
    const pattern = new RegExp(`(^|\\W)${escapeRegExp(phrase)}(\\W|$)`, 'i')
    if (pattern.test(text)) {
      score += phrase.length >= 14 ? 2 : 1
      reasons.push(phrase)
    }
  }

  return { score, reasons }
}

function countRegexHits(text: string, regexes: Array<{ re: RegExp; label: string; weight?: number }>): ScoreBucket {
  const reasons: string[] = []
  let score = 0

  for (const entry of regexes) {
    if (entry.re.test(text)) {
      score += entry.weight ?? 1
      reasons.push(entry.label)
    }
  }

  return { score, reasons }
}

function clampConfidence(value: number) {
  return Math.max(0.05, Math.min(0.99, Number.isFinite(value) ? value : 0.05))
}

function buildConfidence(winner: ScoreBucket, runnerUp: ScoreBucket, multiplier = 0.08) {
  const winnerStrength = winner.score
  const margin = Math.max(0, winner.score - runnerUp.score)
  return clampConfidence(0.42 + winnerStrength * 0.07 + margin * multiplier)
}

export function classifyDocumentText(rawText: string): DocumentClassificationResult {
  const cleanedText = normalizeText(rawText)
  const lineCount = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length

  if (!cleanedText) {
    return {
      image_type: 'OTHER',
      confidence: 0.1,
      reasons: ['empty_text'],
    }
  }

  const erpStrong = countPhraseHits(cleanedText, ERP_STRONG_PHRASES)
  const erpHints = countPhraseHits(cleanedText, ERP_HINTS)
  const invoiceStrong = countPhraseHits(cleanedText, INVOICE_STRONG_PHRASES)
  const invoiceHints = countPhraseHits(cleanedText, INVOICE_HINTS)
  const receiptHints = countPhraseHits(cleanedText, RECEIPT_HINTS)

  const hasTableShape =
    /\b(description|particulars|qty|quantity|rate|amount|hsn|sac)\b/.test(cleanedText) &&
    /\b(invoice|bill|gstin|grand total|tax invoice)\b/.test(cleanedText)

  const erpScore =
    erpStrong.score * 3 +
    erpHints.score +
    (/\b(store|procurement|inventory|dashboard|workspace)\b/.test(cleanedText) ? 1 : 0) +
    (/\b(master|requisition|purchase order|linked po|current stock)\b/.test(cleanedText) ? 1 : 0)

  const invoiceScore =
    invoiceStrong.score * 2 +
    invoiceHints.score +
    (hasTableShape ? 2 : 0) +
    (/\b(gstin|hsn|gst|cgst|sgst|igst)\b/.test(cleanedText) ? 1 : 0)

  const receiptScore =
    receiptHints.score +
    (/\b(store|bill|cash|receipt)\b/.test(cleanedText) ? 1 : 0) +
    (lineCount <= 12 ? 1 : 0)
  const effectiveReceiptScore = receiptScore >= 2 ? receiptScore : 0

  const candidates: Array<{ image_type: DocumentType; bucket: ScoreBucket }> = [
    { image_type: 'ERP_DASHBOARD', bucket: { score: erpScore, reasons: [...erpStrong.reasons, ...erpHints.reasons] } },
    { image_type: 'INVOICE', bucket: { score: invoiceScore, reasons: [...invoiceStrong.reasons, ...invoiceHints.reasons] } },
    { image_type: 'RECEIPT', bucket: { score: effectiveReceiptScore, reasons: [...receiptHints.reasons] } },
  ]

  candidates.sort((a, b) => b.bucket.score - a.bucket.score)
  const winner = candidates[0]
  const runnerUp = candidates[1] ?? { bucket: { score: 0, reasons: [] } }

  if (!winner || winner.bucket.score <= 0) {
    return {
      image_type: 'OTHER',
      confidence: clampConfidence(0.18 + Math.min(0.15, lineCount * 0.01)),
      reasons: ['no_strong_signals'],
    }
  }

  if (winner.image_type === 'ERP_DASHBOARD') {
    const confidence = buildConfidence(winner.bucket, runnerUp.bucket, 0.12)
    return {
      image_type: 'ERP_DASHBOARD',
      confidence,
      reasons: winner.bucket.reasons.length > 0 ? winner.bucket.reasons.slice(0, 6) : ['erp_signals'],
    }
  }

  if (winner.image_type === 'INVOICE') {
    const confidence = buildConfidence(winner.bucket, runnerUp.bucket, 0.1)
    return {
      image_type: 'INVOICE',
      confidence,
      reasons: winner.bucket.reasons.length > 0 ? winner.bucket.reasons.slice(0, 6) : ['invoice_signals'],
    }
  }

  if (winner.image_type === 'RECEIPT') {
    const confidence = buildConfidence(winner.bucket, runnerUp.bucket, 0.08)
    return {
      image_type: 'RECEIPT',
      confidence,
      reasons: winner.bucket.reasons.length > 0 ? winner.bucket.reasons.slice(0, 6) : ['receipt_signals'],
    }
  }

  return {
    image_type: 'OTHER',
    confidence: 0.2,
    reasons: ['unclassified'],
  }
}

export function formatDocumentTypeLabel(documentType: DocumentType) {
  switch (documentType) {
    case 'INVOICE':
      return 'Invoice'
    case 'ERP_DASHBOARD':
      return 'ERP screen'
    case 'RECEIPT':
      return 'Receipt'
    default:
      return 'Other'
  }
}
