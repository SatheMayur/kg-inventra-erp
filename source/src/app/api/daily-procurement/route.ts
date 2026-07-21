import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { getKolkataDateString } from '@/lib/date-utils'
import { OPEN_PO_STATUSES } from '@/lib/po-status'
import {
  DAILY_ALLOCATION_STATUS,
  DAILY_PROCUREMENT_STATUS,
  calculateNetPurchaseQuantity,
  canCreateDailyRequirement,
  canManageDailyProcurement,
  canOverrideDailyProcurementQuantity,
  canReadDailyProcurement,
  roundQty,
} from '@/lib/daily-procurement'
import { isDailyProcurementEligibleItem } from '@/lib/item-master'

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : null),
    z.string().max(max).nullable().optional(),
  )

const batchLineCreateSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  operationalRequirement: z.number().positive('Operational requirement must be greater than zero'),
  requiredClosingStock: z.number().nonnegative().optional(),
  finalPurchaseQty: z.number().nonnegative().optional(),
  overrideReason: optionalText(300),
  qualityGrade: optionalText(80),
  itemSpec: optionalText(200),
  storageCondition: optionalText(120),
  deliveryLocation: optionalText(200),
  deliveryTimeSlot: optionalText(100),
  sourceType: optionalText(80),
  sourceRequestId: optionalText(120),
  sourceRequestLineId: optionalText(120),
  notes: optionalText(500),
})

const batchCreateSchema = z.object({
  requirementDate: z.string().optional(),
  deliveryDate: z.string().min(1, 'Delivery date is required'),
  deliveryTimeSlot: optionalText(100),
  requirementCutoffTime: z.string().optional(),
  locationId: optionalText(120),
  deliveryLocation: optionalText(200),
  departmentId: optionalText(120),
  departmentName: optionalText(200),
  notes: optionalText(500),
  lines: z.array(batchLineCreateSchema).min(1, 'At least one requirement line is required'),
})

type BatchLineInput = z.infer<typeof batchLineCreateSchema>

function normalizeConsolidationPart(value?: string | null) {
  return (value ?? '').trim().toLowerCase()
}

function consolidationKey(line: BatchLineInput, header: z.infer<typeof batchCreateSchema>) {
  return [
    line.itemId,
    normalizeConsolidationPart(line.deliveryLocation ?? header.deliveryLocation),
    normalizeConsolidationPart(line.deliveryTimeSlot ?? header.deliveryTimeSlot),
    normalizeConsolidationPart(line.qualityGrade),
    normalizeConsolidationPart(line.itemSpec),
    normalizeConsolidationPart(line.storageCondition),
  ].join('|')
}

function consolidateRequirementLines(payload: z.infer<typeof batchCreateSchema>) {
  const grouped = new Map<string, BatchLineInput & { sourceType?: string | null }>()

  for (const line of payload.lines) {
    const key = consolidationKey(line, payload)
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { ...line })
      continue
    }

    existing.operationalRequirement += line.operationalRequirement
    existing.requiredClosingStock = Math.max(existing.requiredClosingStock ?? 0, line.requiredClosingStock ?? 0)
    if (existing.finalPurchaseQty !== undefined || line.finalPurchaseQty !== undefined) {
      existing.finalPurchaseQty = (existing.finalPurchaseQty ?? 0) + (line.finalPurchaseQty ?? 0)
    }
    existing.overrideReason = [existing.overrideReason, line.overrideReason]
      .filter(Boolean)
      .join('; ') || null
    existing.sourceType = existing.sourceType === line.sourceType ? existing.sourceType : 'CONSOLIDATED'
    existing.sourceRequestId = existing.sourceRequestId === line.sourceRequestId ? existing.sourceRequestId : null
    existing.sourceRequestLineId = existing.sourceRequestLineId === line.sourceRequestLineId ? existing.sourceRequestLineId : null
  }

  return [...grouped.values()]
}

function batchInclude() {
  return {
    lines: {
      include: {
        item: true,
        enquiryLines: {
          include: {
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
    conversations: {
      include: {
        supplier: true,
        lines: { include: { item: true, batchLine: true }, orderBy: { createdAt: 'asc' as const } },
        messages: { orderBy: { createdAt: 'asc' as const } },
        supplyOrders: { include: { lines: true }, orderBy: { createdAt: 'desc' as const } },
      },
      orderBy: { createdAt: 'asc' as const },
    },
  } as const
}

async function confirmedPendingSupplyFor(tx: any, itemId: string) {
  const [openPoItems, openDailyAllocations] = await Promise.all([
    tx.pOItem.findMany({
      where: {
        itemId,
        purchaseOrder: { status: { in: [...OPEN_PO_STATUSES] } },
      },
      select: { qty: true, receivedQty: true },
    }),
    tx.dailyVendorAllocation.findMany({
      where: {
        itemId,
        status: { in: [DAILY_ALLOCATION_STATUS.PROPOSED, DAILY_ALLOCATION_STATUS.APPROVED, DAILY_ALLOCATION_STATUS.ORDERED] },
        batch: { status: { notIn: [DAILY_PROCUREMENT_STATUS.CLOSED, DAILY_PROCUREMENT_STATUS.CANCELLED] } },
      },
      select: { allocatedQty: true },
    }),
  ])

  const openPoQty = openPoItems.reduce((sum: number, line: { qty: number; receivedQty: number }) => {
    return sum + Math.max(0, line.qty - line.receivedQty)
  }, 0)
  const dailyQty = openDailyAllocations.reduce((sum: number, line: { allocatedQty: number }) => sum + line.allocatedQty, 0)

  return roundQty(openPoQty + dailyQty)
}

async function nextBatchNumber(tx: any) {
  const date = getKolkataDateString().replace(/-/g, '')
  const prefix = `DPB-${date}`
  const count = await tx.dailyProcurementBatch.count({ where: { batchNumber: { startsWith: prefix } } })
  return `${prefix}-${String(count + 1).padStart(3, '0')}`
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.user
    if (!user || !canReadDailyProcurement(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)

    const batches = await db.dailyProcurementBatch.findMany({
      where: status ? { status } : undefined,
      include: batchInclude(),
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ batches })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.user
    if (!user || !canCreateDailyRequirement(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const payload = batchCreateSchema.parse(await request.json())
    const requirementDate = payload.requirementDate ? new Date(payload.requirementDate) : new Date()
    if (Number.isNaN(requirementDate.getTime())) {
      throw new ApiError(400, 'Invalid requirement date', 'BAD_REQUEST')
    }
    const deliveryDate = new Date(payload.deliveryDate)
    if (Number.isNaN(deliveryDate.getTime())) {
      throw new ApiError(400, 'Invalid delivery date', 'BAD_REQUEST')
    }
    const requirementCutoffTime = payload.requirementCutoffTime ? new Date(payload.requirementCutoffTime) : null
    if (payload.requirementCutoffTime && Number.isNaN(requirementCutoffTime!.getTime())) {
      throw new ApiError(400, 'Invalid requirement cutoff time', 'BAD_REQUEST')
    }

    const result = await db.$transaction(async (tx) => {
      const batchNumber = await nextBatchNumber(tx)
      const consolidatedLines = consolidateRequirementLines(payload)
      const uniqueItemIds = [...new Set(consolidatedLines.map((line) => line.itemId))]
      const items = await tx.item.findMany({
        where: { id: { in: uniqueItemIds }, deletedAt: null, active: true },
      })
      const itemById = new Map(items.map((item) => [item.id, item]))

      if (items.length !== uniqueItemIds.length) {
        throw new ApiError(400, 'One or more requirement items are inactive, deleted, or missing', 'BAD_REQUEST')
      }
      const ineligibleItem = items.find((item) => !isDailyProcurementEligibleItem(item))
      if (ineligibleItem) {
        throw new ApiError(
          400,
          `"${ineligibleItem.name}" is not eligible for Daily Procurement. Mark it DAILY/BOTH and non-service in Item Master before using it.`,
          'BAD_REQUEST',
        )
      }

      const lineData: any[] = []
      for (const line of consolidatedLines) {
        const item = itemById.get(line.itemId)!
        const usableStock = Math.max(0, item.stock - item.reservedQty)
        const confirmedPendingSupply = await confirmedPendingSupplyFor(tx, line.itemId)
        const calculatedNetQty = calculateNetPurchaseQuantity({
          operationalRequirement: line.operationalRequirement,
          requiredClosingStock: line.requiredClosingStock ?? item.safetyStock ?? 0,
          usableStock,
          confirmedPendingSupply,
        })
        const finalPurchaseQty = line.finalPurchaseQty ?? calculatedNetQty
        const isOverride = Math.abs(finalPurchaseQty - calculatedNetQty) > 0.001

        if (isOverride && !line.overrideReason) {
          throw new ApiError(400, 'Override reason is required when final purchase quantity differs from calculated net quantity', 'BAD_REQUEST')
        }
        if (isOverride && !canOverrideDailyProcurementQuantity(user.role)) {
          throw new ApiError(403, 'You do not have permission to override Daily Procurement quantities', 'FORBIDDEN')
        }

        lineData.push({
          sourceType: line.sourceType ?? 'MANUAL',
          sourceRequestId: line.sourceRequestId ?? null,
          sourceRequestLineId: line.sourceRequestLineId ?? null,
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          operationalRequirement: line.operationalRequirement,
          requiredClosingStock: line.requiredClosingStock ?? item.safetyStock ?? 0,
          usableStock,
          confirmedPendingSupply,
          calculatedNetQty,
          finalPurchaseQty,
          overrideReason: isOverride ? line.overrideReason ?? null : null,
          overriddenBy: isOverride ? user.name : null,
          overriddenAt: isOverride ? new Date() : null,
          qualityGrade: line.qualityGrade ?? null,
          itemSpec: line.itemSpec ?? null,
          storageCondition: line.storageCondition ?? null,
          deliveryLocation: line.deliveryLocation ?? payload.deliveryLocation ?? null,
          deliveryTimeSlot: line.deliveryTimeSlot ?? payload.deliveryTimeSlot ?? null,
          notes: line.notes ?? null,
        })
      }

      return tx.dailyProcurementBatch.create({
        data: {
          batchNumber,
          requirementDate,
          deliveryDate,
          deliveryTimeSlot: payload.deliveryTimeSlot ?? null,
          requirementCutoffTime,
          locationId: payload.locationId ?? null,
          deliveryLocation: payload.deliveryLocation ?? null,
          departmentId: payload.departmentId ?? null,
          departmentName: payload.departmentName ?? user.department ?? null,
          status: DAILY_PROCUREMENT_STATUS.REQUIREMENTS_READY,
          createdBy: user.name,
          createdById: user.id,
          notes: payload.notes ?? null,
          lines: { create: lineData },
        },
        include: batchInclude(),
      })
    })

    await createAuditLog({
      action: 'CREATE_DAILY_PROCUREMENT_BATCH' as any,
      user,
      targetId: result.id,
      targetName: result.batchNumber,
      metadata: { lines: result.lines.length, status: result.status },
    })

    return NextResponse.json({ batch: result }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
