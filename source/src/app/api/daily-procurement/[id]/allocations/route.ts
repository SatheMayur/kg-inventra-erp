import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import {
  DAILY_ALLOCATION_STATUS,
  DAILY_LINE_STATUS,
  DAILY_PROCUREMENT_STATUS,
  DAILY_QUOTE_STATUS,
  calculateUnitLandedRate,
  canManageDailyProcurement,
  rankVendorQuotes,
} from '@/lib/daily-procurement'

const allocationCreateSchema = z.object({
  allocations: z.array(z.object({
    batchLineId: z.string().min(1, 'Batch line is required'),
    quoteId: z.string().min(1, 'Verified quote is required'),
    allocatedQty: z.number().positive('Allocated quantity must be greater than zero'),
    reason: z.string().max(500).optional(),
  })).min(1, 'At least one allocation is required'),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.user
    if (!user || !canManageDailyProcurement(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const payload = allocationCreateSchema.parse(await request.json())

    const result = await db.$transaction(async (tx) => {
      const batch = await tx.dailyProcurementBatch.findFirst({
        where: { OR: [{ id }, { batchNumber: id }] },
        include: {
          lines: true,
          allocations: true,
        },
      })
      if (!batch) throw new ApiError(404, 'Daily Procurement Batch not found', 'NOT_FOUND')
      if ([DAILY_PROCUREMENT_STATUS.CLOSED, DAILY_PROCUREMENT_STATUS.CANCELLED].includes(batch.status as any)) {
        throw new ApiError(400, `Cannot allocate vendors for a batch in ${batch.status} status`, 'BAD_REQUEST')
      }
      if (batch.allocations.some((allocation: any) => allocation.status !== DAILY_ALLOCATION_STATUS.PROPOSED)) {
        throw new ApiError(409, 'Approved or ordered allocations cannot be replaced', 'CONFLICT')
      }

      const batchLineById = new Map(batch.lines.map((line: any) => [line.id, line]))
      const quoteIds = [...new Set(payload.allocations.map((allocation) => allocation.quoteId))]
      const quotes = await tx.dailyVendorQuote.findMany({
        where: { id: { in: quoteIds } },
        include: {
          supplier: true,
          enquiryLine: {
            include: {
              batchLine: true,
            },
          },
        },
      })
      const quoteById = new Map(quotes.map((quote: any) => [quote.id, quote]))

      const allocatedByLine = new Map<string, number>()
      const allocatedByQuote = new Map<string, number>()
      const rows: any[] = []

      for (const allocation of payload.allocations) {
        const batchLine = batchLineById.get(allocation.batchLineId)
        if (!batchLine) throw new ApiError(400, 'Allocation line does not belong to this batch', 'BAD_REQUEST')
        const quote = quoteById.get(allocation.quoteId)
        if (!quote) throw new ApiError(404, 'Verified quote not found', 'NOT_FOUND')
        if (quote.enquiryLine.batchLineId !== allocation.batchLineId) {
          throw new ApiError(400, 'Quote does not belong to the selected batch line', 'BAD_REQUEST')
        }
        if (quote.verificationStatus !== DAILY_QUOTE_STATUS.VERIFIED) {
          throw new ApiError(400, 'Only verified vendor quotes can be allocated', 'BAD_REQUEST')
        }
        if (quote.normalizedRate === null || quote.normalizedRate === undefined) {
          throw new ApiError(400, 'Quote must have a normalized rate before allocation', 'BAD_REQUEST')
        }

        const nextLineQty = (allocatedByLine.get(allocation.batchLineId) ?? 0) + allocation.allocatedQty
        if (nextLineQty - batchLine.finalPurchaseQty > 0.001) {
          throw new ApiError(400, `Allocated quantity exceeds final purchase quantity for ${batchLine.itemName}`, 'BAD_REQUEST')
        }
        allocatedByLine.set(allocation.batchLineId, nextLineQty)

        const nextQuoteQty = (allocatedByQuote.get(allocation.quoteId) ?? 0) + allocation.allocatedQty
        if (nextQuoteQty - quote.availableQuantity > 0.001) {
          throw new ApiError(400, `Allocated quantity exceeds vendor availability for ${quote.supplier.name}`, 'BAD_REQUEST')
        }
        allocatedByQuote.set(allocation.quoteId, nextQuoteQty)

        const landedRate = calculateUnitLandedRate({
          normalizedRate: quote.normalizedRate,
          transportCharge: quote.transportCharge,
          taxRate: quote.taxRate,
          quantityForTransport: allocation.allocatedQty,
        })
        const recommendation = rankVendorQuotes([
          {
            quoteId: quote.id,
            supplierId: quote.supplierId,
            supplierName: quote.supplier.name,
            requestedQuantity: quote.requestedQuantity,
            availableQuantity: quote.availableQuantity,
            normalizedRate: quote.normalizedRate,
            transportCharge: quote.transportCharge,
            taxRate: quote.taxRate,
            qualityGrade: quote.qualityGrade,
            requiredQualityGrade: batchLine.qualityGrade,
            deliveryTime: quote.deliveryTime,
            verificationStatus: quote.verificationStatus,
            conversionApproximate: quote.conversionApproximate,
          },
        ])[0]

        rows.push({
          batchId: batch.id,
          batchLineId: allocation.batchLineId,
          quoteId: quote.id,
          supplierId: quote.supplierId,
          itemId: batchLine.itemId,
          allocatedQty: allocation.allocatedQty,
          unit: batchLine.unit,
          normalizedRate: quote.normalizedRate,
          transportCharge: quote.transportCharge,
          taxRate: quote.taxRate,
          landedRate,
          recommendationReason: allocation.reason ?? recommendation?.reasons.join('; ') ?? null,
          createdBy: user.name,
        })
      }

      await tx.dailyVendorAllocation.deleteMany({
        where: { batchId: batch.id, status: DAILY_ALLOCATION_STATUS.PROPOSED },
      })
      await tx.dailyVendorAllocation.createMany({ data: rows })
      await tx.dailyProcurementLine.updateMany({
        where: { id: { in: [...allocatedByLine.keys()] } },
        data: { status: DAILY_LINE_STATUS.ALLOCATED },
      })
      const updatedBatch = await tx.dailyProcurementBatch.update({
        where: { id: batch.id },
        data: { status: DAILY_PROCUREMENT_STATUS.ALLOCATION_READY, version: { increment: 1 } },
        include: {
          lines: { include: { allocations: { include: { supplier: true, quote: true } } } },
          allocations: { include: { supplier: true, quote: true } },
          enquiries: { include: { supplier: true, lines: { include: { quotes: true } } } },
          supplyOrders: { include: { supplier: true, lines: true } },
        },
      })

      return { batch: updatedBatch, created: rows.length }
    })

    await createAuditLog({
      action: 'ALLOCATE_DAILY_PROCUREMENT_VENDOR' as any,
      user,
      targetId: result.batch.id,
      targetName: result.batch.batchNumber,
      metadata: { allocations: result.created },
    })

    return NextResponse.json({ batch: result.batch })
  } catch (error) {
    return handleApiError(error)
  }
}
