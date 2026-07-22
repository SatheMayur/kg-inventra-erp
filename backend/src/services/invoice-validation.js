const MONEY_TOLERANCE = 0.02;
const GRAND_TOTAL_TOLERANCE = 0.05;
const GALLON_TO_LITERS = 3.785;

const DIAMOND_KEYWORD_RE = /\b(?:blade|grit|wheel|cup|core\s*drill)\b/i;
const DIMENSION_RE = /\b(?:\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|inches|in|"))|\b\d+(?:\.\d+)?\s*-\s*inch\b/i;
const GRIT_RE = /(?:#\s*\d{1,3}(?:\s*\/\s*\d{1,3})?|\b\d{1,3}\s*\/\s*\d{1,3}\s*grit\b|\bgrit\s*#?\s*\d{1,3}\b)/i;
const STATIONERY_PACK_RE = /\b(?:box|pack)\s+of\s+([0-9OlI][0-9OlI,]*)\b/i;
const LIQUID_UNIT_RE = /\b(?:ml|millilitre|millilitre|milliliter|milliliters?|litre|litres|liter|liters?|ltr|lt|l|gallon|gallons|gal)\b/i;

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sanitizeNumericToken(value) {
  return String(value ?? '')
    .trim()
    .replace(/^[₹$€£]/, '')
    .replace(/[, ]+/g, '')
    .replace(/[oO]/g, '0')
    .replace(/[lI|]/g, '1');
}

function parseMoneyToken(token) {
  const raw = String(token ?? '').trim();
  if (!raw) return null;
  const stripped = raw.replace(/^[₹$€£]/, '').replace(/[, ]+/g, '');
  if (raw.includes('/') || raw.startsWith('#')) return null;
  if (/[a-km-np-z]/i.test(stripped)) return null;
  const normalized = sanitizeNumericToken(raw).replace(/[^0-9.+-]/g, '');
  if (!/^[+-]?\d*(?:\.\d+)?$/.test(normalized) || normalized === '' || normalized === '+' || normalized === '-') {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonQtyUnit(unit) {
  if (!unit) return null;
  const u = String(unit).toLowerCase();
  if (/^(pc|pcs|piece|pieces|no|nos|each)$/.test(u)) return 'pcs';
  if (/^(ml|millilitre|millilitre|milliliter|milliliters)$/.test(u)) return 'ml';
  if (/^(l|lt|ltr|liter|litre|liters|litres)$/.test(u)) return 'l';
  if (/^(gallon|gallons|gal)$/.test(u)) return 'gallon';
  if (/^(dozen|doz|dz)$/.test(u)) return 'dozen';
  return null;
}

function parseQuantityToken(token) {
  const raw = String(token ?? '').trim();
  if (!raw) return null;
  if (/^#\s*\d+$/.test(raw) || /\d+\s*\/\s*\d+\s*grit/i.test(raw)) return null;

  const compact = raw.replace(/[, ]+/g, '');
  const attached = compact.match(/^([+-]?[0-9oOlI]+(?:\.[0-9oOlI]+)?)([a-zA-Z]+)$/);
  if (attached) {
    const unit = canonQtyUnit(attached[2]);
    if (!unit) return null;
    const value = Number(sanitizeNumericToken(attached[1]));
    if (!Number.isFinite(value)) return null;
    return { value, unit };
  }

  const parsed = parseMoneyToken(raw);
  if (parsed == null) return null;
  return { value: parsed, unit: null };
}

function extractQuantityFromTokens(tokens, unitPriceIndex) {
  const directIndex = unitPriceIndex - 1;
  if (directIndex >= 0) {
    const direct = parseQuantityToken(tokens[directIndex]);
    if (direct) {
      return { ...direct, startIndex: directIndex, text: tokens[directIndex] };
    }
  }

  const pairedIndex = unitPriceIndex - 2;
  if (pairedIndex >= 0) {
    const combined = `${tokens[pairedIndex]}${tokens[pairedIndex + 1]}`;
    const paired = parseQuantityToken(combined);
    if (paired) {
      return {
        ...paired,
        startIndex: pairedIndex,
        text: `${tokens[pairedIndex]} ${tokens[pairedIndex + 1]}`,
      };
    }
  }

  return null;
}

function collapseSpaces(value) {
  return String(value ?? '')
    .replace(/[\t|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPackSize(text) {
  const match = STATIONERY_PACK_RE.exec(text);
  if (!match) return null;
  const size = parseMoneyToken(match[1]);
  if (!size || !Number.isFinite(size) || size <= 0) return null;
  return size;
}

function parseVolumeToLiters(qty, unit) {
  if (!Number.isFinite(qty)) return null;
  if (unit === 'ml') return qty / 1000;
  if (unit === 'l' || unit == null) return qty;
  if (unit === 'gallon') return qty * GALLON_TO_LITERS;
  return null;
}

function classifyLine(description, qtyUnit) {
  const hasDiamondKeyword = DIAMOND_KEYWORD_RE.test(description);
  const hasLiquidUnit = qtyUnit === 'ml' || qtyUnit === 'l' || qtyUnit === 'gallon' || LIQUID_UNIT_RE.test(description);
  const packSize = extractPackSize(description);

  if (hasDiamondKeyword) return { category: 'DIAMOND_TOOLS', packSize };
  if (hasLiquidUnit) return { category: 'LIQUIDS', packSize };
  if (packSize) return { category: 'STATIONERY', packSize };
  return { category: 'GENERAL', packSize };
}

function validateDiamondSpecs(description) {
  if (!DIAMOND_KEYWORD_RE.test(description)) {
    return { warning: false, missing: [] };
  }
  const missing = [];
  if (!DIMENSION_RE.test(description)) missing.push('physical dimension');
  if (!GRIT_RE.test(description)) missing.push('mesh grit rating');
  return { warning: missing.length > 0, missing };
}

function buildLineStatus({ mathOk, warning, parseError }) {
  if (parseError || !mathOk) return 'ERROR';
  if (warning) return 'WARNING';
  return 'VALID';
}

function processAndValidateInvoice(rawOcrLines, claimedGrandTotal) {
  const mismatchLog = [];
  const lineItems = [];

  if (!Array.isArray(rawOcrLines)) {
    return {
      isValid: false,
      globalInvoiceStatus: 'REJECTED_MATH_ERROR',
      calculatedSubtotal: 0,
      mismatchLog: ['Invoice payload error: rawOcrLines must be an array of strings.'],
      lineItems: [],
    };
  }

  const claimedTotal = parseMoneyToken(String(claimedGrandTotal ?? ''));
  const safeClaimedTotal = claimedTotal == null ? null : round(claimedTotal, 2);

  let calculatedSubtotal = 0;
  let hasWarnings = false;
  let hasErrors = false;

  for (let index = 0; index < rawOcrLines.length; index++) {
    const lineNumber = index + 1;
    const rawLine = collapseSpaces(rawOcrLines[index]);

    if (!rawLine) continue;

    const tokens = rawLine.split(' ');
    const moneyIndices = [];
    for (let i = tokens.length - 1; i >= 0; i--) {
      const money = parseMoneyToken(tokens[i]);
      if (money == null) continue;
      moneyIndices.push({ index: i, value: money });
      if (moneyIndices.length === 2) break;
    }

    if (moneyIndices.length < 2) {
      hasErrors = true;
      mismatchLog.push(`Line ${lineNumber}: unable to locate both unit price and line total.`);
      lineItems.push({
        rawDescription: rawLine,
        category: 'GENERAL',
        originalQty: 0,
        normalizedStockQty: 0,
        inventoryUnit: 'pcs',
        verifiedUnitPrice: 0,
        calculatedLineTotal: 0,
        lineStatus: 'ERROR',
        systemNote: 'Parsing failed before financial validation.',
      });
      continue;
    }

    const lineTotalToken = tokens[moneyIndices[0].index];
    const unitPriceToken = tokens[moneyIndices[1].index];
    const lineTotal = parseMoneyToken(lineTotalToken);
    const unitPrice = parseMoneyToken(unitPriceToken);

    const qty = extractQuantityFromTokens(tokens, moneyIndices[1].index);
    if (!qty) {
      hasErrors = true;
      mismatchLog.push(`Line ${lineNumber}: quantity token not found before unit price.`);
      lineItems.push({
        rawDescription: rawLine,
        category: 'GENERAL',
        originalQty: 0,
        normalizedStockQty: 0,
        inventoryUnit: 'pcs',
        verifiedUnitPrice: round(unitPrice ?? 0, 2),
        calculatedLineTotal: round(lineTotal ?? 0, 2),
        lineStatus: 'ERROR',
        systemNote: 'Parsing failed before quantity extraction.',
      });
      continue;
    }

    const rawDescription = collapseSpaces(tokens.slice(0, qty.startIndex).join(' ')) || rawLine;
    const classification = classifyLine(rawDescription, qty.unit);
    const category = classification.category;
    const packSize = classification.packSize;
    const diamondCheck = validateDiamondSpecs(rawDescription);

    let normalizedStockQty = qty.value;
    let inventoryUnit = 'pcs';
    const systemNotes = [];

    if (category === 'LIQUIDS') {
      inventoryUnit = 'Liters';
      const liters = parseVolumeToLiters(qty.value, qty.unit || 'l');
      if (liters == null) {
        hasErrors = true;
        mismatchLog.push(`Line ${lineNumber}: could not normalize liquid quantity "${qty.text}" to liters.`);
        lineItems.push({
          rawDescription,
          category,
          originalQty: round(qty.value, 3),
          normalizedStockQty: 0,
          inventoryUnit,
          verifiedUnitPrice: round(unitPrice ?? 0, 2),
          calculatedLineTotal: round(lineTotal ?? 0, 2),
          lineStatus: 'ERROR',
          systemNote: 'Liquid normalization failed.',
        });
        continue;
      }
      normalizedStockQty = liters;
      systemNotes.push(`Normalized to ${round(liters, 3)} Liters`);
      if (qty.unit === 'ml') systemNotes.push('Converted ml to Liters');
      if (qty.unit === 'gallon') systemNotes.push(`Converted gallons using ${GALLON_TO_LITERS} L/gallon`);
    } else if (packSize) {
      normalizedStockQty = qty.value * packSize;
      systemNotes.push(`Expanded pack size x${packSize} to individual pcs`);
    }

    const expectedLineTotal = qty.value * unitPrice;
    const mathOk = Number.isFinite(expectedLineTotal) && Number.isFinite(lineTotal) && Math.abs(expectedLineTotal - lineTotal) <= MONEY_TOLERANCE;
    const verifiedUnitPrice = normalizedStockQty > 0 ? round(lineTotal / normalizedStockQty, 2) : round(unitPrice, 2);
    const calculatedLineTotal = round(lineTotal, 2);
    calculatedSubtotal += lineTotal;

    if (packSize) {
      systemNotes.push(`Recalculated unit price for ${round(normalizedStockQty, 3)} ${inventoryUnit}`);
    }
    if (category === 'DIAMOND_TOOLS') {
      if (diamondCheck.warning) {
        hasWarnings = true;
        systemNotes.push(`Diamond tool spec warning: missing ${diamondCheck.missing.join(' and ')}`);
        mismatchLog.push(`Line ${lineNumber}: DIAMOND_TOOLS warning - missing ${diamondCheck.missing.join(' and ')}.`);
      } else {
        systemNotes.push('Diamond tool spec verified');
      }
    }

    const parseError = !mathOk;
    if (parseError) {
      hasErrors = true;
      mismatchLog.push(
        `Line ${lineNumber}: horizontal math mismatch. Qty ${qty.value} × unit price ${round(unitPrice, 2)} = ${round(expectedLineTotal, 2)}, but parsed line total is ${round(lineTotal, 2)}.`
      );
    }

    const lineStatus = buildLineStatus({
      mathOk,
      warning: category === 'DIAMOND_TOOLS' && diamondCheck.warning,
      parseError,
    });

    if (lineStatus === 'WARNING') hasWarnings = true;

    lineItems.push({
      rawDescription,
      category,
      originalQty: round(qty.value, 3),
      normalizedStockQty: round(normalizedStockQty, 3),
      inventoryUnit,
      verifiedUnitPrice: verifiedUnitPrice == null ? 0 : verifiedUnitPrice,
      calculatedLineTotal,
      lineStatus,
      systemNote: systemNotes.length ? systemNotes.join('; ') : 'No vertical auto-conversion applied',
    });
  }

  const subtotalRounded = round(calculatedSubtotal, 2) ?? 0;
  const grandTotalMismatch = safeClaimedTotal == null
    ? false
    : Math.abs(subtotalRounded - safeClaimedTotal) > GRAND_TOTAL_TOLERANCE;

  if (grandTotalMismatch) {
    hasErrors = true;
    mismatchLog.push(
      `Invoice grand total mismatch: calculated subtotal ${subtotalRounded.toFixed(2)} differs from claimed total ${safeClaimedTotal.toFixed(2)} by ${Math.abs(subtotalRounded - safeClaimedTotal).toFixed(2)}.`
    );
  }

  const globalInvoiceStatus = grandTotalMismatch || hasErrors
    ? 'REJECTED_MATH_ERROR'
    : hasWarnings
      ? 'WARNING_RETAINED'
      : 'READY_FOR_STOCK';

  return {
    isValid: !hasErrors,
    globalInvoiceStatus,
    calculatedSubtotal: subtotalRounded,
    mismatchLog,
    lineItems,
  };
}

module.exports = {
  processAndValidateInvoice,
  // Exported for unit tests and future route wiring.
  _invoiceValidationInternals: {
    parseMoneyToken,
    parseQuantityToken,
    extractPackSize,
    classifyLine,
    validateDiamondSpecs,
  },
};
