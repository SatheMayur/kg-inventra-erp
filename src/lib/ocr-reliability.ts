export type OcrDocumentType = 'gst_invoice' | 'cash_memo' | 'estimate_bill' | 'handwritten_receipt' | 'unknown'

export interface OcrExtractionAnalysis {
  documentType: OcrDocumentType
  confidence: number
  supplierName: string | null
  supplierConfidence: number
  warnings: string[]
  reasons: string[]
}

const SUPPLIER_REJECTION_RE = /\b(transporter|supplier\/transporter|duplicate|original|triplicate|recipient|transport mode|delivery|gstin|invoice no|bill no)\b/i
const SUPPLIER_NOISE_RE = /\b(gstin|gstin\/uin|invoice no|bill no|date|transport mode|delivery|original|duplicate|triplicate|recipient|dispatch|vehicle|consignee|terms|conditions|tax invoice|estimate|quotation|challan|receipt)\b/i

function normalizeText(rawText: string) {
  return rawText
    .replace(/[|¦]/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

function cleanText(rawText: string) {
  return normalizeText(rawText).toLowerCase().trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countMatches(text: string, phrases: string[]) {
  let score = 0
  const reasons: string[] = []

  for (const phrase of phrases) {
    const pattern = new RegExp(`(^|\\W)${escapeRegExp(phrase)}(\\W|$)`, 'i')
    if (pattern.test(text)) {
      score += phrase.length >= 12 ? 2 : 1
      reasons.push(phrase)
    }
  }

  return { score, reasons }
}

function clampConfidence(value: number) {
  return Math.max(0.05, Math.min(0.99, Number.isFinite(value) ? value : 0.05))
}

function pickBestCandidate(candidates: Array<{ type: OcrDocumentType; score: number; reasons: string[] }>) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const winner = sorted[0] ?? { type: 'unknown' as OcrDocumentType, score: 0, reasons: [] }
  const runnerUp = sorted[1] ?? { score: 0 }
  return { winner, runnerUp }
}

function scoreInvoice(text: string) {
  const strong = countMatches(text, [
    'tax invoice',
    'gst invoice',
    'gstin',
    'invoice no',
    'invoice number',
    'grand total',
    'place of supply',
    'description of goods',
    'hsn',
    'sac',
  ])
  const hints = countMatches(text, [
    'bill to',
    'ship to',
    'invoice date',
    'bill no',
    'subtotal',
    'quantity',
    'qty',
    'rate',
    'amount',
    'cgst',
    'sgst',
    'igst',
    'supplier',
    'buyer',
    'party',
  ])

  const hasTableShape = /\b(description|particulars|qty|quantity|rate|amount|hsn|sac)\b/.test(text) && /\b(invoice|bill|gstin|grand total|tax invoice)\b/.test(text)

  return {
    score: strong.score * 2 + hints.score + (hasTableShape ? 2 : 0),
    reasons: [...strong.reasons, ...hints.reasons],
  }
}

function scoreCashMemo(text: string) {
  const strong = countMatches(text, [
    'cash memo',
    'memo',
    'receipt',
    'from',
    'paid',
    'thank you',
  ])
  const hints = countMatches(text, [
    'cash',
    'change',
    'balance',
    'total',
    'subtotal',
  ])
  const hasMoneySignal = /\b\d+(?:\.\d{1,2})?\b/.test(text) || /\b(total|subtotal|paid|cash|balance)\b/.test(text)

  if (strong.score === 0 || !hasMoneySignal) {
    return {
      score: 0,
      reasons: [],
    }
  }

  return {
    score: strong.score * 2 + hints.score,
    reasons: [...strong.reasons, ...hints.reasons],
  }
}

function scoreEstimateBill(text: string) {
  const strong = countMatches(text, [
    'estimate',
    'estimate bill',
    'quotation',
    'quotation no',
    'proforma',
    'quotation amount',
  ])
  const hints = countMatches(text, [
    'approx',
    'valid for',
    'goods',
    'amount',
    'rate',
    'gst',
    'bill',
  ])
  const hasMoneySignal = /\b\d+(?:\.\d{1,2})?\b/.test(text) || /\b(amount|rate|gst|total|subtotal)\b/.test(text)

  if (strong.score === 0 || !hasMoneySignal) {
    return {
      score: 0,
      reasons: [],
    }
  }

  return {
    score: strong.score * 2 + hints.score,
    reasons: [...strong.reasons, ...hints.reasons],
  }
}

function scoreHandwrittenReceipt(text: string) {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean)
  const receiptTerms = countMatches(text, ['receipt', 'cash', 'paid', 'total', 'amount', 'from'])
  const lowStructure = lines.length <= 10 ? 2 : lines.length <= 14 ? 1 : 0
  const noGst = /\b(gstin|gst|cgst|sgst|igst|invoice|bill no|invoice no)\b/.test(text) ? 0 : 2
  const hasMoneySignal = /\b\d+(?:\.\d{1,2})?\b/.test(text) || /\b(total|amount|paid|cash)\b/.test(text)

  if (receiptTerms.score === 0 && !hasMoneySignal) {
    return {
      score: 0,
      reasons: [],
    }
  }

  return {
    score: receiptTerms.score + lowStructure + noGst,
    reasons: [...receiptTerms.reasons],
  }
}

function isRejectedSupplierValue(value: string) {
  return SUPPLIER_REJECTION_RE.test(value)
}

function isLikelySupplierLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length < 3) return false
  if (SUPPLIER_NOISE_RE.test(trimmed)) return false
  if (trimmed.split(/\s+/).length > 8) return false
  if (/\d{4,}/.test(trimmed)) return false
  return /[A-Za-z]/.test(trimmed)
}

function chooseSupplierFromHeader(lines: string[]) {
  for (const line of lines.slice(0, 8)) {
    if (isLikelySupplierLine(line)) {
      return line.trim()
    }
  }
  return null
}

function chooseSupplierAfterFrom(lines: string[]) {
  for (let index = 0; index < Math.min(lines.length, 14); index += 1) {
    const line = lines[index].trim()
    const fromMatch = line.match(/\bfrom\b\s*[:\-]?\s*(.+)/i)
    if (fromMatch?.[1]) {
      const candidate = fromMatch[1].trim()
      if (isLikelySupplierLine(candidate)) return candidate
    }

    if (/^\bfrom\b[:\-]?\s*$/i.test(line)) {
      const nextLine = lines[index + 1]?.trim()
      if (nextLine && isLikelySupplierLine(nextLine)) return nextLine
    }
  }
  return null
}

function classifyDocumentType(text: string): { documentType: OcrDocumentType; confidence: number; reasons: string[] } {
  const normalized = cleanText(text)
  const lines = normalized.split(/\n/).map((line) => line.trim()).filter(Boolean)
  const lineCount = lines.length

  const invoice = scoreInvoice(normalized)
  const cashMemo = scoreCashMemo(normalized)
  const estimate = scoreEstimateBill(normalized)
  const handwritten = scoreHandwrittenReceipt(normalized)

  const candidates = [
    { type: 'gst_invoice' as const, score: invoice.score, reasons: invoice.reasons },
    { type: 'cash_memo' as const, score: cashMemo.score, reasons: cashMemo.reasons },
    { type: 'estimate_bill' as const, score: estimate.score, reasons: estimate.reasons },
    { type: 'handwritten_receipt' as const, score: handwritten.score, reasons: handwritten.reasons },
  ]

  const { winner, runnerUp } = pickBestCandidate(candidates)

  if (winner.score <= 0) {
    return {
      documentType: 'unknown',
      confidence: clampConfidence(0.2 + Math.min(0.18, lineCount * 0.01)),
      reasons: ['no_strong_doc_type_signals'],
    }
  }

  const margin = Math.max(0, winner.score - runnerUp.score)
  const confidence = clampConfidence(0.42 + winner.score * 0.08 + margin * 0.06)

  return {
    documentType: winner.type,
    confidence,
    reasons: winner.reasons.slice(0, 6),
  }
}

function validateSupplierCandidate(candidate: string | null, warnings: string[]) {
  if (!candidate) return null
  const trimmed = candidate.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  if (isRejectedSupplierValue(trimmed)) {
    warnings.push(`Supplier candidate rejected: ${trimmed}`)
    return null
  }
  return trimmed
}

function extractSupplierByDocumentType(documentType: OcrDocumentType, lines: string[], warnings: string[]) {
  if (documentType === 'unknown') {
    return { supplierName: null, supplierConfidence: 0, warnings }
  }

  if (documentType === 'gst_invoice') {
    const candidate = chooseSupplierFromHeader(lines)
    const supplierName = validateSupplierCandidate(candidate, warnings)
    if (!supplierName) {
      warnings.push('Could not confidently derive GST invoice supplier from header')
      return { supplierName: null, supplierConfidence: 0, warnings }
    }
    return { supplierName, supplierConfidence: 0.84, warnings }
  }

  if (documentType === 'cash_memo') {
    const candidate = chooseSupplierAfterFrom(lines) ?? chooseSupplierFromHeader(lines)
    const supplierName = validateSupplierCandidate(candidate, warnings)
    if (!supplierName) {
      warnings.push('Could not confidently derive cash memo supplier')
      return { supplierName: null, supplierConfidence: 0, warnings }
    }
    return { supplierName, supplierConfidence: 0.72, warnings }
  }

  if (documentType === 'estimate_bill') {
    const candidate = chooseSupplierFromHeader(lines)
    const supplierName = validateSupplierCandidate(candidate, warnings)
    if (!supplierName) {
      warnings.push('Could not confidently derive estimate bill supplier')
      return { supplierName: null, supplierConfidence: 0, warnings }
    }
    return { supplierName, supplierConfidence: 0.76, warnings }
  }

  const candidate = chooseSupplierFromHeader(lines) ?? chooseSupplierAfterFrom(lines)
  const supplierName = validateSupplierCandidate(candidate, warnings)
  if (!supplierName) {
    warnings.push('Low confidence handwritten supplier guess unavailable')
    return { supplierName: null, supplierConfidence: 0, warnings }
  }

  warnings.push('Handwritten receipt supplier derived with low confidence')
  return { supplierName, supplierConfidence: 0.38, warnings }
}

export function preprocessCanvasForOcr(sourceCanvas: HTMLCanvasElement, upscale = 2) {
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = Math.max(1, Math.round(sourceCanvas.width * upscale))
  outputCanvas.height = Math.max(1, Math.round(sourceCanvas.height * upscale))

  const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true })
  if (!outputContext) {
    return sourceCanvas
  }

  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'
  outputContext.drawImage(sourceCanvas, 0, 0, outputCanvas.width, outputCanvas.height)

  const width = outputCanvas.width
  const height = outputCanvas.height
  const imageData = outputContext.getImageData(0, 0, width, height)
  const data = imageData.data
  const contrast = 1.28
  const brightness = 6

  const grayscale = new Uint8ClampedArray(data.length)
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0
    const green = data[index + 1] ?? 0
    const blue = data[index + 2] ?? 0
    const alpha = data[index + 3] ?? 255
    const gray = Math.max(0, Math.min(255, Math.round(0.299 * red + 0.587 * green + 0.114 * blue)))
    const contrasted = Math.max(0, Math.min(255, Math.round((gray - 128) * contrast + 128 + brightness)))
    grayscale[index] = contrasted
    grayscale[index + 1] = contrasted
    grayscale[index + 2] = contrasted
    grayscale[index + 3] = alpha
  }

  const sharpened = new Uint8ClampedArray(grayscale)
  const sample = (x: number, y: number, channelOffset: number) => {
    const safeX = Math.max(0, Math.min(width - 1, x))
    const safeY = Math.max(0, Math.min(height - 1, y))
    return grayscale[(safeY * width + safeX) * 4 + channelOffset] ?? 0
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const baseIndex = (y * width + x) * 4
      const center = sample(x, y, 0)
      const left = sample(x - 1, y, 0)
      const right = sample(x + 1, y, 0)
      const up = sample(x, y - 1, 0)
      const down = sample(x, y + 1, 0)
      const sharpenedGray = Math.max(0, Math.min(255, Math.round(center * 1.2 - (left + right + up + down) * 0.05)))
      sharpened[baseIndex] = sharpenedGray
      sharpened[baseIndex + 1] = sharpenedGray
      sharpened[baseIndex + 2] = sharpenedGray
      sharpened[baseIndex + 3] = grayscale[baseIndex + 3] ?? 255
    }
  }

  outputContext.putImageData(new ImageData(sharpened, width, height), 0, 0)
  return outputCanvas
}

export async function loadFileAsCanvas(file: File, upscale = 2) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error(`Failed to load image ${file.name}`))
      element.src = objectUrl
    })

    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = Math.max(1, image.naturalWidth)
    sourceCanvas.height = Math.max(1, image.naturalHeight)
    const context = sourceCanvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      throw new Error('Unable to prepare OCR canvas')
    }

    context.drawImage(image, 0, 0)
    return preprocessCanvasForOcr(sourceCanvas, upscale)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function analyzeOcrExtraction(rawText: string): OcrExtractionAnalysis {
  const lines = normalizeText(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const warnings: string[] = []
  const classification = classifyDocumentType(rawText)
  const supplierResult = extractSupplierByDocumentType(classification.documentType, lines, warnings)
  let supplierName = supplierResult.supplierName
  let supplierConfidence = supplierResult.supplierConfidence

  if (classification.documentType === 'unknown') {
    warnings.push('Document type could not be determined confidently')
  }

  if (supplierName && isRejectedSupplierValue(supplierName)) {
    warnings.push(`Supplier candidate rejected: ${supplierName}`)
    supplierName = null
    supplierConfidence = 0
  }

  return {
    documentType: classification.documentType,
    confidence: classification.confidence,
    supplierName,
    supplierConfidence,
    warnings,
    reasons: classification.reasons,
  }
}

export function formatOcrDocumentTypeLabel(documentType: OcrDocumentType) {
  switch (documentType) {
    case 'gst_invoice':
      return 'GST Invoice'
    case 'cash_memo':
      return 'Cash Memo'
    case 'estimate_bill':
      return 'Estimate Bill'
    case 'handwritten_receipt':
      return 'Handwritten Receipt'
    default:
      return 'Unknown'
  }
}
