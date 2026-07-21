import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { processAndValidateInvoice } from '@/lib/invoice-validation'
import { analyzeOcrExtraction } from '@/lib/ocr-reliability'
import { db } from '@/lib/db'
import { createHash } from 'crypto'

const invoiceValidationSchema = z.object({
  rawOcrLines: z.array(z.string()).optional(),
  rawOcrText: z.string().optional(),
  claimedGrandTotal: z.coerce.number().finite(),
}).refine(
  (data) => {
    const hasLines = Array.isArray(data.rawOcrLines) && data.rawOcrLines.length > 0
    const hasText = typeof data.rawOcrText === 'string' && data.rawOcrText.trim().length > 0
    return hasLines || hasText
  },
  { message: 'Provide raw OCR lines or raw OCR text.' }
)

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin'])
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const payload = invoiceValidationSchema.parse(await request.json())
    const rawOcrLines = payload.rawOcrLines?.length
      ? payload.rawOcrLines
      : (payload.rawOcrText ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const analysis = analyzeOcrExtraction(rawOcrLines.join('\n'))

    if (analysis.documentType === 'unknown') {
      throw new ApiError(
        422,
        `Document type could not be determined confidently`,
        'UNSUPPORTED_DOCUMENT',
      )
    }

    const result = processAndValidateInvoice(rawOcrLines, payload.claimedGrandTotal)

    // Persist into InvoiceBank for READY_FOR_STOCK or WARNING_RETAINED
    let invoiceBankId: string | null = null
    if (result.globalInvoiceStatus === 'READY_FOR_STOCK' || result.globalInvoiceStatus === 'WARNING_RETAINED') {
      const ocrText = rawOcrLines.join('\n')
      const ocrHash = createHash('sha256').update(ocrText).digest('hex')

      // Try to extract invoice number using regex from raw OCR lines
      let possibleInvoiceNumber: string | null = null
      const invoiceNoRegex = /\b(?:invoice\s*no|inv\s*no|invoice\s*number|bill\s*no|inv\b)\.?\s*[:#-]?\s*([A-Za-z0-9\/\-]+)\b/i
      for (const line of rawOcrLines) {
        const match = line.match(invoiceNoRegex)
        if (match) {
          possibleInvoiceNumber = match[1]
          break
        }
      }
      const possibleVendor = null
      const possibleDate = null

      const existing = await db.invoiceBank.findFirst({
        where: {
          ocrHash,
          // TODO: Implement composite backup matching (invoiceNumber + invoiceDate + vendorName)
          // once possibleDate and possibleVendor extraction are supported by the validation engine.
        },
      })

      if (existing) {
        invoiceBankId = existing.id
      } else {
        const created = await db.invoiceBank.create({
          data: {
            ocrHash,
            sourceName: 'invoice-validation',
            invoiceNumber: possibleInvoiceNumber ?? undefined,
            invoiceDate: possibleDate ?? undefined,
            vendorName: possibleVendor ?? undefined,
            rawOcrText: ocrText,
            claimedGrandTotal: payload.claimedGrandTotal,
            validationStatus: result.globalInvoiceStatus,
            validationJson: JSON.stringify(result),
          },
        })
        invoiceBankId = created.id
      }
    }

    return NextResponse.json({ ...result, ocrAnalysis: analysis, invoiceBankId })
  } catch (error) {
    return handleApiError(error)
  }
}
