export type InvoiceCategory = 'STATIONERY' | 'DIAMOND_TOOLS' | 'LIQUIDS' | 'GENERAL'
export type InvoiceLineStatus = 'VALID' | 'WARNING' | 'ERROR'
export type GlobalInvoiceStatus = 'READY_FOR_STOCK' | 'WARNING_RETAINED' | 'REJECTED_MATH_ERROR'

export interface InvoiceValidationLineItem {
  rawDescription: string
  category: InvoiceCategory
  originalQty: number
  normalizedStockQty: number
  inventoryUnit: 'pcs' | 'Liters'
  verifiedUnitPrice: number
  calculatedLineTotal: number
  lineStatus: InvoiceLineStatus
  systemNote: string
}

export interface InvoiceValidationResult {
  isValid: boolean
  globalInvoiceStatus: GlobalInvoiceStatus
  calculatedSubtotal: number
  mismatchLog: string[]
  lineItems: InvoiceValidationLineItem[]
}

const SUMMARY_LINE_RE = /^(subtotal|grand\s*total|total|tax|gst|cgst|sgst|igst|round\s*off|balance|invoice\s*no|invoice\s*number|bill\s*to|ship\s*to|thank\s*you)\b/i
const TABLE_HEADER_RE = /\b(description|particulars|goods\s+and\s+services|description\s+of\s+goods|qty|quantity|rate|amount|hsn|s\.?n\.?|sr\.?)\b/i
const TABLE_TERMINATION_RE = /\b(grand\s*total|sub\s*total|total\s*amount|total\s*after\s*tax|tax\s*amount|sgst|cgst|igst|bank|account|a\/c|ifsc|pan|terms\s*&\s*conditions|subject\s+to|thank\s+you|reverse\s+charge|receiver'?s?\s+sign|authori[sz]ed|payment\s+to\s+be\s+made|goods\s+once\s+sold|continued\s+to\s+page)\b/i
const NOISE_LINE_RE = /\b(gstin|gstin\/uin|mobile|mob\.?|email|e-mail|phone|address|state\s+name|state\s+code|delivery\s+note|mode\/terms|invoice\s+no|bill\s+no|date\s+of\s+supply|place\s+of\s+supply|buyer|consignee|dispatch|transport\s+mode|vehicle\s+no|original\s+copy|duplicate|triplicate|m\/s\.?|m\/s|for,\s*|mohalla|road|city|district)\b/i
const TABLE_FOOTER_NOISE_RE = /\b(bank|account|a\/c|ifsc|pan|terms\s*&\s*conditions|reverse\s+charge|receiver'?s?\s*sign|authori[sz]ed|grand\s*total|tax\s*amount|add:\s*sgst|add:\s*cgst|add:\s*igst|gst\s*payable|subject\s+to|payment\s+to\s+be\s+made|goods\s+once\s+sold|delivery\s+transport\s+mode|vehicle\s+no|place\s+of\s+supply|date\s+of\s+supply)\b/i
const TABLE_START_HINT_RE = /\b(description|goods|particulars|item\s+description|qty|quantity|pcs|rate|amount|hsn|sac|basic|disc|txbl|gst\s*paid|n\.?\s*rate)\b/i
const STATIONERY_PACK_RE = /\b(?:box|pack)\s+of\s+(\d{1,3})\b/i
const DIAMOND_TOOL_RE = /\b(blade|grit|wheel|cup|core\s*drill)\b/i
const DIMENSION_RE = /\b\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|in|")\b/i
const GRIT_RE = /(?:#\s*\d+|\b\d+\s*\/\s*\d+\s*grit\b|\b\d+\s*grit\b)/i
const LIQUID_RE = /\b(?:ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|gallon(?:s)?|gal)\b/i
const VOLUME_EXPRESSION_RE = /(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|gallon(?:s)?|gal)\b/i
const TRAILING_SHORT_VOLUME_RE = /(\d+(?:\.\d+)?)(ml|l)\b/i
const UNIT_TOKEN_RE = /^(?:nos?|no|pcs?|pc|pce|kg|kgs?|gm|gms?|g|ltr|ltrs?|litre?s?|l|ml)$/i
const COMBINED_QTY_UNIT_RE = /^(\d+(?:\.\d+)?)(?:\s*)(nos?|no|pcs?|pc|pce|kg|kgs?|gm|gms?|g|ltr|ltrs?|litre?s?|l|ml)\.?$/i
function isTableHeaderLine(line: string) {
  return TABLE_HEADER_RE.test(line) && !TABLE_TERMINATION_RE.test(line)
}

function isTableTerminationLine(line: string) {
  return TABLE_TERMINATION_RE.test(line) || TABLE_FOOTER_NOISE_RE.test(line)
}

function isNoiseLine(line: string) {
  return NOISE_LINE_RE.test(line)
}

function isLikelyItemLine(line: string, numericTokens: NumericToken[]) {
  if (isNoiseLine(line) || isTableTerminationLine(line) || SUMMARY_LINE_RE.test(line)) return false
  if (numericTokens.length >= 3) return true
  if (numericTokens.length >= 2 && /\b(?:nos?|pcs?|pc|kg|kgs?|ltr|ltrs?|l|ml|pack|box)\b/i.test(line)) return true
  return false
}

function isStrictTableRowCandidate(line: string, numericTokens: NumericToken[]) {
  if (isNoiseLine(line) || isTableTerminationLine(line) || SUMMARY_LINE_RE.test(line)) return false
  if (numericTokens.length < 3) return false
  const tokens = normalizeLineForParsing(line).split(/\s+/)
  const alphaBeforeFirstNumber = tokens.slice(0, numericTokens[0]?.index ?? 0).filter((token) => /[A-Za-z]/.test(token))
  return alphaBeforeFirstNumber.length > 0 || TABLE_START_HINT_RE.test(line)
}

function isLikelyCodeToken(token: NumericToken) {
  const cleaned = token.token.replace(/[.,]/g, '')
  return token.token.indexOf('.') === -1 && cleaned.length >= 4 && token.value >= 1000
}

function scoreQuantityCandidate(index: number, token: NumericToken, numericTokens: NumericToken[]) {
  if (token.value <= 0 || !Number.isFinite(token.value)) return Number.POSITIVE_INFINITY

  let score = 0
  if (token.token.includes('%')) score += 20
  if (index === 0 && numericTokens.length >= 5) score += 4
  if (index >= Math.max(0, numericTokens.length - 2)) score += 1.5
  if (index === numericTokens.length - 1) score += 3
  if (isLikelyCodeToken(token)) score += 3
  if (token.value > 1000) score += 1.5
  if (token.value > 10000) score += 2
  if (token.token.includes('.')) score += 0.5
  if (token.value < 0.01) score += 5

  return score
}

function pickStructuredNumbers(line: string, numericTokens: NumericToken[]) {
  if (numericTokens.length < 3) return null

  const amountToken = numericTokens[numericTokens.length - 1]
  if (!amountToken) return null

  const candidateQtys = numericTokens
    .slice(0, -1)
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.value > 0 && !token.token.includes('%'))
    .sort((a, b) => scoreQuantityCandidate(a.index, a.token, numericTokens) - scoreQuantityCandidate(b.index, b.token, numericTokens))

  if (candidateQtys.length === 0) return null

  let best: { qty: NumericToken; unitPrice: number; lineTotal: number; score: number } | null = null

  for (const { token: qtyToken, index: qtyIndex } of candidateQtys.slice(0, 6)) {
    const qty = qtyToken.value
    if (!Number.isFinite(qty) || qty <= 0) continue

    const derivedUnitPrice = amountToken.value / qty
    if (!Number.isFinite(derivedUnitPrice) || derivedUnitPrice <= 0) continue

    const score = scoreQuantityCandidate(qtyIndex, qtyToken, numericTokens) + (qtyToken.token.includes('.') ? 0.15 : 0)
    if (!best || score < best.score) {
      best = {
        qty: qtyToken,
        unitPrice: derivedUnitPrice,
        lineTotal: amountToken.value,
        score,
      }
    }
  }

  return best
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// Validation tolerances. Use relative tolerance for larger amounts and absolute for small cents.
const LINE_TOTAL_ABS_TOL = 0.02
const LINE_TOTAL_REL_TOL = 0.005 // 0.5%
const GRAND_TOTAL_ABS_TOL = 0.05
const GRAND_TOTAL_REL_TOL = 0.005 // 0.5%

function closeEnough(a: number, b: number, absTol: number, relTol: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const absDiff = Math.abs(a - b)
  const rel = Math.max(Math.abs(a), Math.abs(b), 1) * relTol
  return absDiff <= Math.max(absTol, rel)
}

type NumericToken = {
  index: number
  token: string
  value: number
}

function normalizeLineForParsing(line: string) {
  return line
    .replace(/[|¦]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeNumericToken(token: string): number | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  if (!/^[0-9OolI.,+\-\/%()[\]{}:;]+$/.test(trimmed)) return null

  const cleaned = trimmed
    .replace(/,/g, '')
    .replace(/[()%\[\]{}:;]+/g, '')
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[^0-9.+\-\/]/g, '')

  if (!cleaned) return null
  if (!/[0-9]/.test(cleaned)) return null

  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function isUnitToken(token: string) {
  return UNIT_TOKEN_RE.test(token.trim().replace(/[.:,]+$/g, ''))
}

function extractNumericTokens(line: string): NumericToken[] {
  const tokens = normalizeLineForParsing(line).split(/\s+/)
  const values: NumericToken[] = []

  tokens.forEach((token, index) => {
    if (!/[0-9OolI]/.test(token)) return
    const value = sanitizeNumericToken(token)
    if (value !== null) values.push({ index, token, value })
  })

  return values
}

function findExplicitQuantity(tokens: string[], numericTokens: NumericToken[]) {
  for (let i = 0; i < tokens.length; i += 1) {
    const rawToken = tokens[i].replace(/[,:;()\[\]{}]+$/g, '')
    const combined = rawToken.match(COMBINED_QTY_UNIT_RE)
    if (combined) {
      const qty = Number.parseFloat(combined[1])
      if (Number.isFinite(qty) && qty > 0) {
        const matchedNumeric = numericTokens.find((entry) => entry.index === i)
        return { qty, qtyIndex: i, matchedNumeric }
      }
    }

    const tokenValue = sanitizeNumericToken(rawToken)
    if (tokenValue === null || tokenValue <= 0) continue

    const nextToken = tokens[i + 1]?.replace(/[,:;()\[\]{}]+$/g, '')
    const prevToken = tokens[i - 1]?.replace(/[,:;()\[\]{}]+$/g, '')

    if (nextToken && isUnitToken(nextToken)) {
      return { qty: tokenValue, qtyIndex: i, matchedNumeric: numericTokens.find((entry) => entry.index === i) }
    }

    if (prevToken && isUnitToken(rawToken)) {
      const prevValue = sanitizeNumericToken(prevToken)
      if (prevValue !== null && prevValue > 0) {
        const matchedNumeric = numericTokens.find((entry) => entry.index === i - 1)
        return { qty: prevValue, qtyIndex: i - 1, matchedNumeric }
      }
    }
  }

  return null
}

function inferQuantityAndPrice(numericTokens: NumericToken[]) {
  if (numericTokens.length === 0) {
    return null
  }

  const quantityCandidates = numericTokens.filter((entry) => {
    const token = entry.token.trim()
    if (token.includes('%')) return false
    if (entry.value <= 0) return false
    if (!token.includes('.') && entry.value > 1000) return false
    return entry.value <= 10000
  })

  let best: { qty: NumericToken; unit: NumericToken; total: NumericToken; score: number } | null = null

  for (const qty of quantityCandidates) {
    for (const unit of numericTokens) {
      if (unit.index <= qty.index) continue

      for (const total of numericTokens) {
        if (total.index <= unit.index) continue

        const predicted = qty.value * unit.value
        const delta = Math.abs(predicted - total.value)
        const suffixBonus = (numericTokens.length - total.index) * 0.0001
        const explicitQtyBonus = qty.token.match(COMBINED_QTY_UNIT_RE) ? -0.05 : 0
        const score = delta - suffixBonus + explicitQtyBonus

        if (!best || score < best.score) {
          best = { qty, unit, total, score }
        }
      }
    }
  }

  return best
}

function normalizeVolumeToLiters(quantity: number, line: string): { normalizedQty: number; note: string } | null {
  const match = line.match(VOLUME_EXPRESSION_RE) || line.match(TRAILING_SHORT_VOLUME_RE)
  if (!match) return null

  const amount = Number.parseFloat(match[1])
  const unit = match[2].toLowerCase()

  if (!Number.isFinite(amount)) return null

  let litersPerUnit = 1
  if (unit === 'ml' || unit.startsWith('millil')) litersPerUnit = 0.001
  else if (unit === 'l' || unit.startsWith('lit')) litersPerUnit = 1
  else if (unit.startsWith('gallon') || unit === 'gal') litersPerUnit = 3.785

  const normalizedQty = quantity * amount * litersPerUnit
  return {
    normalizedQty,
    note: `Normalized liquid measure from ${amount}${unit} to ${round2(amount * litersPerUnit)}L`,
  }
}

function deriveCategory(line: string): InvoiceCategory {
  const lower = line.toLowerCase()
  if (LIQUID_RE.test(line)) return 'LIQUIDS'
  if (DIAMOND_TOOL_RE.test(line)) return 'DIAMOND_TOOLS'
  if (STATIONERY_PACK_RE.test(line) || /\bstationery\b|\bpaper\b|\bpen\b|\bpencil\b|\bnotebook\b/i.test(lower)) {
    return 'STATIONERY'
  }
  return 'GENERAL'
}

function pickLineNumbers(line: string, numericTokens: NumericToken[]) {
  if (numericTokens.length === 0) {
    return { qty: 0, unitPrice: 0, lineTotal: 0, hasExplicitLineTotal: false }
  }

  const tokens = normalizeLineForParsing(line).split(/\s+/)
  const explicit = findExplicitQuantity(tokens, numericTokens)
  if (explicit) {
    const suffix = numericTokens.filter((entry) => entry.index > explicit.qtyIndex)
    if (suffix.length >= 2) {
      const unitPrice = suffix[suffix.length - 2].value
      let lineTotal = suffix[suffix.length - 1].value
      if (explicit.qty === 1 && suffix.length === 2 && Math.abs(lineTotal - unitPrice) <= Math.max(0.5, round2(unitPrice * 0.01))) {
        lineTotal = unitPrice
      }
      return { qty: explicit.qty, unitPrice, lineTotal, hasExplicitLineTotal: true }
    }
    if (suffix.length === 1) {
      return { qty: explicit.qty, unitPrice: suffix[0].value, lineTotal: suffix[0].value, hasExplicitLineTotal: false }
    }
  }

  const structured = pickStructuredNumbers(line, numericTokens)
  if (structured) {
    return {
      qty: structured.qty.value,
      unitPrice: structured.unitPrice,
      lineTotal: structured.lineTotal,
      hasExplicitLineTotal: true,
    }
  }

  if (numericTokens.length === 1) {
    const unitPrice = numericTokens[0].value
    return { qty: 1, unitPrice, lineTotal: unitPrice, hasExplicitLineTotal: false }
  }

  const inferred = inferQuantityAndPrice(numericTokens)
  if (inferred) {
    const { qty, unit, total } = inferred
    let lineTotal = total.value
    if (qty.value === 1 && Math.abs(total.value - unit.value) <= Math.max(0.5, round2(unit.value * 0.01))) {
      lineTotal = unit.value
    }
    return { qty: qty.value, unitPrice: unit.value, lineTotal, hasExplicitLineTotal: true }
  }

  const fallbackQty = numericTokens[Math.max(0, numericTokens.length - 3)]?.value ?? 0
  const fallbackUnit = numericTokens[Math.max(0, numericTokens.length - 2)]?.value ?? 0
  const fallbackTotal = numericTokens[Math.max(0, numericTokens.length - 1)]?.value ?? fallbackUnit
  return { qty: fallbackQty, unitPrice: fallbackUnit, lineTotal: fallbackTotal, hasExplicitLineTotal: numericTokens.length >= 3 }
}

export function processAndValidateInvoice(rawOcrLines: string[], claimedGrandTotal: number): InvoiceValidationResult {
  const mismatchLog: string[] = []
  const lineItems: InvoiceValidationLineItem[] = []
  let subtotal = 0
  let hasWarnings = false
  let hasErrors = false
  const normalizedLines = rawOcrLines.map((rawLine) => normalizeLineForParsing(String(rawLine ?? '')))
  let startIndex = -1
  let endIndex = normalizedLines.length - 1
  let sawHeader = false

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const trimmed = normalizedLines[index]
    if (!trimmed) continue
    if (isTableHeaderLine(trimmed)) {
      startIndex = Math.min(index + 1, normalizedLines.length)
      sawHeader = true
      break
    }
  }

  if (startIndex === -1) {
    for (let index = 0; index < normalizedLines.length; index += 1) {
      const trimmed = normalizedLines[index]
      if (!trimmed) continue
      const numericTokens = extractNumericTokens(trimmed)
      if (isStrictTableRowCandidate(trimmed, numericTokens)) {
        startIndex = index
        break
      }
    }
  }

  if (startIndex === -1) startIndex = 0

  for (let index = startIndex; index < normalizedLines.length; index += 1) {
    const trimmed = normalizedLines[index]
    if (!trimmed) continue
    if ((sawHeader || index > startIndex) && isTableTerminationLine(trimmed)) {
      endIndex = index - 1
      break
    }
  }

  for (let index = startIndex; index <= endIndex; index += 1) {
    const trimmed = normalizedLines[index]
    const lineNumber = index + 1
    if (!trimmed) continue
    if (isTableHeaderLine(trimmed) || isTableTerminationLine(trimmed)) continue
    if (isNoiseLine(trimmed) || SUMMARY_LINE_RE.test(trimmed)) continue

    const category = deriveCategory(trimmed)
    const numericTokens = extractNumericTokens(trimmed)
    if (!isLikelyItemLine(trimmed, numericTokens)) continue

    const structuredCandidate = isStrictTableRowCandidate(trimmed, numericTokens)
    if (!structuredCandidate && numericTokens.length < 3) continue

    const { qty, unitPrice, lineTotal } = pickLineNumbers(trimmed, numericTokens)

    if (qty <= 0 || lineTotal <= 0) {
      hasErrors = true
      mismatchLog.push(`Line ${lineNumber}: Unable to safely parse quantity or line total from OCR text.`)
      continue
    }

    let normalizedStockQty = qty
    let inventoryUnit: 'pcs' | 'Liters' = 'pcs'
    let verifiedUnitPrice = unitPrice
    let systemNote = structuredCandidate ? 'Parsed from OCR table row' : 'Parsed from OCR line'
    let lineStatus: InvoiceLineStatus = 'VALID'
    let calculatedLineTotal = lineTotal
    let expectedLineTotal = qty * unitPrice
    let delta = Math.abs(expectedLineTotal - lineTotal)

    if (!closeEnough(expectedLineTotal, lineTotal, LINE_TOTAL_ABS_TOL, LINE_TOTAL_REL_TOL) && numericTokens.length >= 4) {
      verifiedUnitPrice = lineTotal / qty
      expectedLineTotal = qty * verifiedUnitPrice
      delta = Math.abs(expectedLineTotal - lineTotal)
      systemNote = 'Normalized from OCR table columns'
      lineStatus = 'WARNING'
      hasWarnings = true
    }

    if (!closeEnough(expectedLineTotal, lineTotal, LINE_TOTAL_ABS_TOL, LINE_TOTAL_REL_TOL)) {
      lineStatus = 'ERROR'
      hasErrors = true
      mismatchLog.push(
        `Line ${lineNumber}: quantity x unit price (${round2(expectedLineTotal)}) does not match line total (${round2(lineTotal)}).`
      )
    }

    if (category === 'STATIONERY') {
      const packMatch = trimmed.match(STATIONERY_PACK_RE)
      if (packMatch) {
        const packSize = Number.parseInt(packMatch[1], 10)
        if (Number.isFinite(packSize) && packSize > 0) {
          normalizedStockQty = qty * packSize
          verifiedUnitPrice = round2(unitPrice / packSize)
          systemNote = `Stationery pack expanded by ${packSize} units`
        }
      }
    }

    if (category === 'LIQUIDS') {
      const liquidNormalization = normalizeVolumeToLiters(qty, trimmed)
      if (liquidNormalization) {
        normalizedStockQty = round2(liquidNormalization.normalizedQty)
        inventoryUnit = 'Liters'
        verifiedUnitPrice = normalizedStockQty > 0 ? round2(calculatedLineTotal / normalizedStockQty) : verifiedUnitPrice
        systemNote = liquidNormalization.note
      } else {
        inventoryUnit = 'Liters'
        systemNote = 'Liquid item detected; normalized to Liters'
      }
    }

    if (category === 'DIAMOND_TOOLS') {
      const hasDimension = DIMENSION_RE.test(trimmed)
      const hasGrit = GRIT_RE.test(trimmed)
      if (!hasDimension || !hasGrit) {
        lineStatus = lineStatus === 'ERROR' ? 'ERROR' : 'WARNING'
        hasWarnings = true
        const missingParts: string[] = []
        if (!hasDimension) missingParts.push('dimension')
        if (!hasGrit) missingParts.push('grit rating')
        mismatchLog.push(`Line ${lineNumber}: diamond tooling item missing ${missingParts.join(' and ')} metadata.`)
        systemNote = systemNote === 'Parsed from OCR line'
          ? 'Diamond tooling item requires manual review'
          : `${systemNote}; diamond tooling item requires manual review`
      }
    }

    subtotal += calculatedLineTotal

    lineItems.push({
      rawDescription: trimmed,
      category,
      originalQty: round2(qty),
      normalizedStockQty: round2(normalizedStockQty),
      inventoryUnit,
      verifiedUnitPrice: round2(verifiedUnitPrice),
      calculatedLineTotal: round2(calculatedLineTotal),
      lineStatus,
      systemNote,
    })
  }

  if (lineItems.length === 0) {
    hasErrors = true
    mismatchLog.push('No billable OCR line items could be extracted from the provided text.')
  }

  const roundedSubtotal = round2(subtotal)
  const roundedClaim = round2(claimedGrandTotal)
  if (!closeEnough(roundedSubtotal, roundedClaim, GRAND_TOTAL_ABS_TOL, GRAND_TOTAL_REL_TOL)) {
    hasErrors = true
    mismatchLog.push(
      `Claimed grand total (${roundedClaim}) does not match calculated subtotal (${roundedSubtotal}).`
    )
  }

  const globalInvoiceStatus: GlobalInvoiceStatus = hasErrors
    ? 'REJECTED_MATH_ERROR'
    : hasWarnings
      ? 'WARNING_RETAINED'
      : 'READY_FOR_STOCK'

  return {
    isValid: !hasErrors,
    globalInvoiceStatus,
    calculatedSubtotal: round2(subtotal),
    mismatchLog,
    lineItems,
  }
}
