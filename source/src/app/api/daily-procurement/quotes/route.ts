import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import {
  DAILY_BUSINESS_RESPONSE_STATUS,
  DAILY_LINE_STATUS,
  DAILY_PROCUREMENT_STATUS,
  DAILY_QUOTE_STATUS,
  canManageDailyProcurement,
  normalizeQuotedRate,
} from '@/lib/daily-procurement'

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : null),
    z.string().max(max).nullable().optional(),
  )

const quoteCreateSchema = z.object({
  enquiryLineId: z.string().min(1, 'Enquiry line is required'),
  supplierId: z.string().min(1).optional(),
  originalMessageId: optionalText(120),
  originalMessageText: optionalText(2000),
  quotedItemText: optionalText(300),
  matchedItemId: z.string().min(1).optional(),
  availableQuantity: z.number().nonnegative('Available quantity must be non-negative'),
  quotedRate: z.number().nonnegative('Quoted rate must be non-negative'),
  quotedUnit: z.string().min(1, 'Quoted unit is required').max(40),
  conversionFactor: z.number().positive('Conversion factor must be greater than zero').optional(),
  conversionApproximate: z.boolean().default(false),
  qualityGrade: optionalText(80),
  transportCharge: z.number().nonnegative().default(0),
  taxRate: z.number().min(0).max(100).default(0),
  deliveryTime: z.string().optional(),
  validityDateTime: z.string().optional(),
  substituteItem: optionalText(200),
  vendorRemarks: optionalText(500),
  parsingConfidence: z.number().min(0).max(1).optional(),
  verificationStatus: z.enum([
    DAILY_QUOTE_STATUS.UNPARSED,
    DAILY_QUOTE_STATUS.PARSED,
    DAILY_QUOTE_STATUS.NEEDS_REVIEW,
    DAILY_QUOTE_STATUS.VERIFIED,
    DAILY_QUOTE_STATUS.REJECTED,
    DAILY_QUOTE_STATUS.EXPIRED,
  ]).default(DAILY_QUOTE_STATUS.VERIFIED),
})

function parseOptionalDate(value: string | undefined, label: string) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `Invalid ${label}`, 'BAD_REQUEST')
  }
  return parsed
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.user
    if (!user || !canManageDailyProcurement(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const payload = quoteCreateSchema.parse(await request.json())
    const deliveryTime = parseOptionalDate(payload.deliveryTime, 'delivery time')
    const validityDateTime = parseOptionalDate(payload.validityDateTime, 'validity date/time')

    const result = await db.$transaction(async (tx) => {
      const enquiryLine = await tx.dailyRateEnquiryLine.findUnique({
        where: { id: payload.enquiryLineId },
        include: {
          enquiry: { include: { supplier: true, batch: true } },
          batchLine: { include: { item: true } },
        },
      })
      if (!enquiryLine) throw new ApiError(404, 'Daily Rate Enquiry line not found', 'NOT_FOUND')
      if ([DAILY_PROCUREMENT_STATUS.CLOSED, DAILY_PROCUREMENT_STATUS.CANCELLED].includes(enquiryLine.enquiry.batch.status as any)) {
        throw new ApiError(400, `Cannot add quotes to a batch in ${enquiryLine.enquiry.batch.status} status`, 'BAD_REQUEST')
      }

      const supplierId = payload.supplierId ?? enquiryLine.enquiry.supplierId
      if (supplierId !== enquiryLine.enquiry.supplierId) {
        throw new ApiError(400, 'Quote supplier must match the enquiry supplier', 'BAD_REQUEST')
      }

      const matchedItemId = payload.matchedItemId ?? enquiryLine.itemId
      const matchedItem = await tx.item.findUnique({ where: { id: matchedItemId } })
      if (!matchedItem || matchedItem.deletedAt || !matchedItem.active) {
        throw new ApiError(400, 'Matched item is inactive, deleted, or missing', 'BAD_REQUEST')
      }

      const normalized = normalizeQuotedRate({
        quotedRate: payload.quotedRate,
        quotedUnit: payload.quotedUnit,
        stockUnit: enquiryLine.unit,
        conversionFactor: payload.conversionFactor,
      })
      if (payload.verificationStatus === DAILY_QUOTE_STATUS.VERIFIED && normalized.normalizedRate === null) {
        throw new ApiError(400, 'Verified quote requires a unit conversion factor before rates can be compared', 'BAD_REQUEST')
      }

      const quote = await tx.dailyVendorQuote.create({
        data: {
          enquiryLineId: enquiryLine.id,
          supplierId,
          originalMessageId: payload.originalMessageId ?? null,
          originalMessageText: payload.originalMessageText ?? null,
          quotedItemText: payload.quotedItemText ?? null,
          matchedItemId,
          requestedQuantity: enquiryLine.requestedQty,
          availableQuantity: payload.availableQuantity,
          quotedRate: payload.quotedRate,
          quotedUnit: payload.quotedUnit,
          conversionFactor: normalized.conversionFactor,
          conversionApproximate: payload.conversionApproximate || normalized.needsConversionReview,
          normalizedRate: normalized.normalizedRate,
          qualityGrade: payload.qualityGrade ?? null,
          transportCharge: payload.transportCharge,
          taxRate: payload.taxRate,
          deliveryTime,
          validityDateTime,
          substituteItem: payload.substituteItem ?? null,
          vendorRemarks: payload.vendorRemarks ?? null,
          parsingConfidence: payload.parsingConfidence ?? null,
          verificationStatus: payload.verificationStatus,
          verifiedBy: payload.verificationStatus === DAILY_QUOTE_STATUS.VERIFIED ? user.name : null,
          verifiedAt: payload.verificationStatus === DAILY_QUOTE_STATUS.VERIFIED ? new Date() : null,
        },
        include: { supplier: true, matchedItem: true, enquiryLine: true },
      })

      const businessStatus = payload.verificationStatus === DAILY_QUOTE_STATUS.VERIFIED
        ? DAILY_BUSINESS_RESPONSE_STATUS.VERIFIED
        : DAILY_BUSINESS_RESPONSE_STATUS.NEEDS_REVIEW

      await tx.dailyRateEnquiryLine.update({
        where: { id: enquiryLine.id },
        data: { status: DAILY_LINE_STATUS.QUOTED },
      })
      await tx.dailyProcurementLine.update({
        where: { id: enquiryLine.batchLineId },
        data: { status: DAILY_LINE_STATUS.QUOTED },
      })
      await tx.dailyRateEnquiry.update({
        where: { id: enquiryLine.enquiryId },
        data: { businessStatus },
      })
      await tx.dailyProcurementBatch.update({
        where: { id: enquiryLine.enquiry.batchId },
        data: { status: DAILY_PROCUREMENT_STATUS.QUOTES_RECEIVED, version: { increment: 1 } },
      })

      return { quote, batch: enquiryLine.enquiry.batch }
    })

    await createAuditLog({
      action: 'VERIFY_DAILY_VENDOR_QUOTE' as any,
      user,
      targetId: result.batch.id,
      targetName: result.batch.batchNumber,
      metadata: {
        quoteId: result.quote.id,
        supplierId: result.quote.supplierId,
        verificationStatus: result.quote.verificationStatus,
        normalizedRate: result.quote.normalizedRate,
      },
    })

    return NextResponse.json({ quote: result.quote }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
