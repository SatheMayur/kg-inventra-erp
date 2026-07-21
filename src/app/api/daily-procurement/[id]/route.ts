import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import {
  canReadDailyProcurement,
  rankVendorQuotes,
} from '@/lib/daily-procurement'

function detailInclude() {
  return {
    lines: {
      include: {
        item: true,
        enquiryLines: {
          include: {
            enquiry: { include: { supplier: true } },
            quotes: {
              include: { supplier: true },
              orderBy: { createdAt: 'desc' as const },
            },
          },
        },
        allocations: {
          include: { supplier: true, quote: true },
          orderBy: { createdAt: 'asc' as const },
        },
      },
      orderBy: { createdAt: 'asc' as const },
    },
    enquiries: {
      include: {
        supplier: true,
        lines: {
          include: {
            quotes: {
              include: { supplier: true },
              orderBy: { createdAt: 'desc' as const },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' as const },
    },
    allocations: {
      include: { supplier: true, quote: true },
      orderBy: { createdAt: 'asc' as const },
    },
    supplyOrders: {
      include: { supplier: true, lines: true },
      orderBy: { createdAt: 'desc' as const },
    },
  } as const
}

function withRecommendations(batch: any) {
  const recommendationsByLineId: Record<string, ReturnType<typeof rankVendorQuotes>> = {}

  for (const line of batch.lines ?? []) {
    const candidates = (line.enquiryLines ?? []).flatMap((enquiryLine: any) =>
      (enquiryLine.quotes ?? []).map((quote: any) => ({
        quoteId: quote.id,
        supplierId: quote.supplierId,
        supplierName: quote.supplier?.name ?? enquiryLine.enquiry?.supplier?.name ?? 'Supplier',
        requestedQuantity: quote.requestedQuantity,
        availableQuantity: quote.availableQuantity,
        normalizedRate: quote.normalizedRate,
        transportCharge: quote.transportCharge,
        taxRate: quote.taxRate,
        qualityGrade: quote.qualityGrade,
        requiredQualityGrade: line.qualityGrade,
        deliveryTime: quote.deliveryTime,
        verificationStatus: quote.verificationStatus,
        conversionApproximate: quote.conversionApproximate,
      })),
    )
    recommendationsByLineId[line.id] = rankVendorQuotes(candidates)
  }

  return { ...batch, recommendationsByLineId }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.user
    if (!user || !canReadDailyProcurement(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const identifier = id.trim()
    if (!identifier) throw new ApiError(400, 'Daily Procurement Batch identifier is required', 'BAD_REQUEST')

    const batch = await db.dailyProcurementBatch.findFirst({
      where: { OR: [{ id: identifier }, { batchNumber: identifier }] },
      include: detailInclude(),
    })
    if (!batch) throw new ApiError(404, 'Daily Procurement Batch not found', 'NOT_FOUND')

    return NextResponse.json({ batch: withRecommendations(batch) })
  } catch (error) {
    return handleApiError(error)
  }
}
