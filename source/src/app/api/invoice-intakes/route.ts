import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { handleApiError, ApiError } from '@/lib/api-utils'
import { processAndValidateInvoice, type InvoiceValidationResult } from '@/lib/invoice-validation'
import { analyzeOcrExtraction } from '@/lib/ocr-reliability'
import { threeWayMatch } from '@/lib/three-way-match'
import { PO_STATUS } from '@/lib/po-status'

const invoiceIntakeSchema = z.object({
  sourceName: z.string().max(200).optional(),
  invoiceNumber: z.string().max(100).optional(),
  purchaseOrderId: z.string().min(1).optional(),
  rawOcrText: z.string().min(1),
  claimedGrandTotal: z.coerce.number().finite(),
  autoPost: z.boolean().optional().default(true),
  notes: z.string().max(500).optional(),
})

function deriveReviewStatus(validation: InvoiceValidationResult, autoPostRequested: boolean, canAutoPost: boolean) {
  if (validation.globalInvoiceStatus === 'REJECTED_MATH_ERROR') return 'REJECTED'
  if (validation.globalInvoiceStatus === 'WARNING_RETAINED') return 'NEEDS_REVIEW'
  if (autoPostRequested && canAutoPost) return 'AUTO_POSTED'
  return 'PENDING'
}

function parseValidationJson(validationJson: string) {
  const parsed = JSON.parse(validationJson) as InvoiceValidationResult | { validation?: InvoiceValidationResult }
  return 'validation' in parsed && parsed.validation ? parsed.validation : parsed
}

async function listIntakes() {
  const intakes = await db.invoiceIntake.findMany({
    include: { purchaseOrder: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return intakes.map((intake) => ({
    ...intake,
    validationResult: parseValidationJson(intake.validationJson),
  }))
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const intakes = await listIntakes()
    return NextResponse.json(intakes)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin'])
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const payload = invoiceIntakeSchema.parse(await request.json())
    const rawOcrLines = payload.rawOcrText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const analysis = analyzeOcrExtraction(rawOcrLines.join('\n'))

    if (analysis.documentType === 'unknown') {
      throw new ApiError(
        422,
        `Document type could not be determined confidently`,
        'UNSUPPORTED_DOCUMENT',
      )
    }

    const validation = processAndValidateInvoice(rawOcrLines, payload.claimedGrandTotal)

    let invoice: { id: string; amount: number } | null = null
    const canAutoPost =
      payload.autoPost !== false &&
      validation.globalInvoiceStatus === 'READY_FOR_STOCK' &&
      Boolean(payload.invoiceNumber?.trim()) &&
      Boolean(payload.purchaseOrderId?.trim())

    const intake = await db.$transaction(async (tx) => {
      if (canAutoPost) {
        const po = await tx.purchaseOrder.findUnique({
          where: { id: payload.purchaseOrderId! },
          include: { items: true },
        })
        if (!po) throw new ApiError(404, 'Purchase order not found', 'NOT_FOUND')

        const invoiceNumber = payload.invoiceNumber!.trim()
        const dupe = await tx.purchaseInvoice.findUnique({ where: { invoiceNumber } })
        if (dupe) throw new ApiError(409, 'Invoice number already exists', 'CONFLICT')

        invoice = await tx.purchaseInvoice.create({
          data: {
            invoiceNumber,
            purchaseOrderId: payload.purchaseOrderId!,
            amount: validation.calculatedSubtotal,
            status: 'UNPAID',
            notes: payload.notes ?? null,
          },
        })

        // Gated 3-way match: run only when goods have been received (stock already mutated by GRN route)
        if (po.status === PO_STATUS.INVOICE_PENDING || po.status === PO_STATUS.FULLY_RECEIVED || po.status === PO_STATUS.NEEDS_REVIEW) {
          const orderedQty = po.items.reduce((sum, item) => sum + item.qty, 0);
          const receivedQty = po.items.reduce((sum, item) => sum + item.receivedQty, 0);
          const orderedAmount = po.totalAmount;
          const invoicedAmount = invoice.amount;

          const match = threeWayMatch({
            orderedQty,
            receivedQty,
            orderedAmount,
            invoicedAmount,
          });

          if (match.matched) {
            // Stock was already added by the GRN receive route — just close the PO
            await tx.purchaseOrder.update({
              where: { id: po.id },
              data: {
                status: PO_STATUS.CLOSED,
                notes: `3-Way Match Succeeded. Verified on ${new Date().toLocaleDateString('en-US')}`,
              },
            });
          } else {
            // Mismatch — flag for manual review
            await tx.purchaseOrder.update({
              where: { id: po.id },
              data: {
                status: PO_STATUS.NEEDS_REVIEW,
                notes: `3-Way Match Mismatch: ${match.discrepancies.join(', ')}`,
              },
            });
          }
        }
      }

      const reviewStatus = deriveReviewStatus(validation, payload.autoPost !== false, canAutoPost)
      const warningSummary = analysis.warnings.length > 0 ? `OCR warnings: ${analysis.warnings.join(' | ')}` : null
      const storedNotes = [payload.notes?.trim() || null, warningSummary].filter(Boolean).join('\n') || null

      return tx.invoiceIntake.create({
        data: {
          sourceName: payload.sourceName?.trim() || analysis.supplierName || null,
          invoiceNumber: payload.invoiceNumber?.trim() || null,
          rawOcrText: payload.rawOcrText,
          claimedGrandTotal: payload.claimedGrandTotal,
          purchaseOrderId: payload.purchaseOrderId?.trim() || null,
          validationStatus: validation.globalInvoiceStatus,
          reviewStatus,
          validationJson: JSON.stringify({
            validation,
            ocrAnalysis: analysis,
          }),
          postedInvoiceId: invoice?.id ?? null,
          notes: storedNotes,
        },
        include: { purchaseOrder: true },
      })
    });

    return NextResponse.json({
      intake: {
        ...intake,
        validationResult: validation,
      },
      invoice,
      ocrAnalysis: analysis,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
