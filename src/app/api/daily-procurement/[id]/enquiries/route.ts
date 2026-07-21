import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { getKolkataDateString } from '@/lib/date-utils'
import { isSupplierUsableForPo } from '@/lib/supplier-dedupe'
import {
  DAILY_BUSINESS_RESPONSE_STATUS,
  DAILY_ENQUIRY_STATUS,
  DAILY_LINE_STATUS,
  DAILY_MESSAGE_STATUS,
  DAILY_PROCUREMENT_STATUS,
  buildDailyRateEnquiryMessage,
  buildDocumentReference,
  canManageDailyProcurement,
  normalizeWhatsAppPhone,
} from '@/lib/daily-procurement'

const enquiryCreateSchema = z.object({
  supplierIds: z.array(z.string().min(1)).min(1, 'Select at least one supplier'),
  batchLineIds: z.array(z.string().min(1)).optional(),
  sendWhatsApp: z.boolean().default(true),
  language: z.string().min(2).max(20).default('en'),
  notes: z.string().max(500).optional(),
})

async function nextEnquiryNumber(tx: any, offset: number) {
  const date = getKolkataDateString().replace(/-/g, '')
  const prefix = `DRE-${date}`
  const count = await tx.dailyRateEnquiry.count({ where: { enquiryNumber: { startsWith: prefix } } })
  return `${prefix}-${String(count + offset + 1).padStart(3, '0')}`
}

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
    const payload = enquiryCreateSchema.parse(await request.json())
    const supplierIds = [...new Set(payload.supplierIds)]

    const result = await db.$transaction(async (tx) => {
      const batch = await tx.dailyProcurementBatch.findFirst({
        where: { OR: [{ id }, { batchNumber: id }] },
        include: { lines: true },
      })
      if (!batch) throw new ApiError(404, 'Daily Procurement Batch not found', 'NOT_FOUND')
      if ([DAILY_PROCUREMENT_STATUS.CLOSED, DAILY_PROCUREMENT_STATUS.CANCELLED].includes(batch.status as any)) {
        throw new ApiError(400, `Cannot send enquiries for a batch in ${batch.status} status`, 'BAD_REQUEST')
      }

      const selectedLineIds = payload.batchLineIds && payload.batchLineIds.length > 0
        ? new Set(payload.batchLineIds)
        : null
      const lines = batch.lines.filter((line: any) =>
        line.finalPurchaseQty > 0 &&
        line.status !== DAILY_LINE_STATUS.CANCELLED &&
        (!selectedLineIds || selectedLineIds.has(line.id)),
      )
      if (lines.length === 0) {
        throw new ApiError(400, 'No positive Daily Procurement lines are available for enquiry', 'BAD_REQUEST')
      }

      const suppliers = await tx.supplier.findMany({ where: { id: { in: supplierIds } } })
      if (suppliers.length !== supplierIds.length) {
        throw new ApiError(404, 'One or more selected suppliers were not found', 'NOT_FOUND')
      }

      const createdOrExisting: any[] = []
      let createdCount = 0

      for (const supplier of suppliers) {
        if (!isSupplierUsableForPo(supplier)) {
          throw new ApiError(400, `Supplier ${supplier.name} is inactive or blocked`, 'BAD_REQUEST')
        }

        const existing = await tx.dailyRateEnquiry.findFirst({
          where: {
            batchId: batch.id,
            supplierId: supplier.id,
            status: { in: [DAILY_ENQUIRY_STATUS.DRAFT, DAILY_ENQUIRY_STATUS.QUEUED, DAILY_ENQUIRY_STATUS.SENT] },
          },
          include: { supplier: true, lines: true },
        })
        if (existing) {
          createdOrExisting.push(existing)
          continue
        }

        const enquiryNumber = await nextEnquiryNumber(tx, createdCount)
        const reference = buildDocumentReference('DRE', batch.batchNumber)
        const phone = normalizeWhatsAppPhone(supplier.phone || supplier.contact)

        if (payload.sendWhatsApp && !phone) {
          throw new ApiError(400, `Supplier ${supplier.name} does not have a WhatsApp phone number`, 'BAD_REQUEST')
        }

        const enquiry = await tx.dailyRateEnquiry.create({
          data: {
            enquiryNumber,
            batchId: batch.id,
            supplierId: supplier.id,
            status: payload.sendWhatsApp ? DAILY_ENQUIRY_STATUS.QUEUED : DAILY_ENQUIRY_STATUS.DRAFT,
            businessStatus: DAILY_BUSINESS_RESPONSE_STATUS.AWAITING_RESPONSE,
            messageStatus: payload.sendWhatsApp ? DAILY_MESSAGE_STATUS.QUEUED : DAILY_MESSAGE_STATUS.DRAFT,
            whatsappReference: reference,
            language: payload.language,
            createdBy: user.name,
            notes: payload.notes ?? null,
            sentAt: payload.sendWhatsApp ? new Date() : null,
            lines: {
              create: lines.map((line: any) => ({
                batchLineId: line.id,
                itemId: line.itemId,
                requestedQty: line.finalPurchaseQty,
                unit: line.unit,
                qualityGrade: line.qualityGrade,
                itemSpec: line.itemSpec,
              })),
            },
          },
          include: { supplier: true, lines: true },
        })

        let withMessage = enquiry
        if (payload.sendWhatsApp) {
          const message = buildDailyRateEnquiryMessage({
            reference,
            batchNumber: batch.batchNumber,
            deliveryDate: batch.deliveryDate.toISOString().slice(0, 10),
            deliveryLocation: batch.deliveryLocation,
            deliveryTimeSlot: batch.deliveryTimeSlot,
            lines: lines.map((line: any) => ({
              itemName: line.itemName,
              requestedQty: line.finalPurchaseQty,
              unit: line.unit,
              qualityGrade: line.qualityGrade,
              itemSpec: line.itemSpec,
            })),
          })
          const whatsappMessage = await tx.whatsAppMessage.create({
            data: {
              phone: phone!,
              message,
              direction: 'OUTBOUND',
              status: 'PENDING',
              senderName: `${supplier.name} (Supplier)`,
            },
          })
          withMessage = await tx.dailyRateEnquiry.update({
            where: { id: enquiry.id },
            data: { whatsappMessageId: whatsappMessage.id },
            include: { supplier: true, lines: true },
          })
        }

        createdCount += 1
        createdOrExisting.push(withMessage)
      }

      await tx.dailyProcurementLine.updateMany({
        where: { id: { in: lines.map((line: any) => line.id) } },
        data: { status: DAILY_LINE_STATUS.ENQUIRY_SENT },
      })
      await tx.dailyProcurementBatch.update({
        where: { id: batch.id },
        data: { status: DAILY_PROCUREMENT_STATUS.ENQUIRY_SENT, version: { increment: 1 } },
      })

      return { batch, enquiries: createdOrExisting, createdCount }
    })

    await createAuditLog({
      action: 'SEND_DAILY_RATE_ENQUIRY' as any,
      user,
      targetId: result.batch.id,
      targetName: result.batch.batchNumber,
      metadata: { suppliers: supplierIds.length, created: result.createdCount, sendWhatsApp: payload.sendWhatsApp },
    })

    return NextResponse.json({ enquiries: result.enquiries })
  } catch (error) {
    return handleApiError(error)
  }
}
