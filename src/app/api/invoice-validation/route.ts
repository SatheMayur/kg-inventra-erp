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

      // Try to extract invoice number, vendor, and date using regex and supplier lookup
      let possibleInvoiceNumber: string | null = null
      let possibleVendor: string | null = null
      let possibleDate: string | null = null

      const invoiceNoRegex = /\b(?:invoice\s*no|inv\s*no|invoice\s*number|bill\s*no|inv\b)\.?\s*[:#-]?\s*([A-Za-z0-9\/\-]+)\b/i
      const dateRegex = /\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2})\b/

      for (const line of rawOcrLines) {
        if (!possibleInvoiceNumber) {
          const match = line.match(invoiceNoRegex)
          if (match) possibleInvoiceNumber = match[1]
        }
        if (!possibleDate) {
          const dateMatch = line.match(dateRegex)
          if (dateMatch) possibleDate = dateMatch[1]
        }
      }

      const suppliers = await db.supplier.findMany({ select: { name: true } })
      const ocrUpper = ocrText.toUpperCase()
      for (const supp of suppliers) {
        if (supp.name && supp.name.length >= 3 && ocrUpper.includes(supp.name.toUpperCase())) {
          possibleVendor = supp.name
          break
        }
      }

      const existing = await db.invoiceBank.findFirst({
        where: {
          OR: [
            { ocrHash },
            ...(possibleInvoiceNumber && possibleVendor ? [{ invoiceNumber: possibleInvoiceNumber, vendorName: possibleVendor }] : []),
          ],
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
