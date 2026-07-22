import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'

const PENDING_REQUEST_STATUSES = [
  'Pending',
  'SUBMITTED',
  'Pending Department Approval',
  'PENDING_DEPT_APPROVAL',
  'UNDER_REVIEW',
  'Approved',
  'PENDING_STORE_REVIEW',
  'STOCK_AVAILABLE',
  'ISSUE_PENDING',
  'PARTIALLY_ISSUED',
  'PartiallyIssued',
  'ReadyForPickup',
  'READY_FOR_PICKUP',
]

const OPEN_PO_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT_TO_SUPPLIER',
  'PARTIALLY_RECEIVED',
  'INVOICE_PENDING',
  'NEEDS_REVIEW',
  'ON_HOLD',
]

const OPEN_DAILY_STATUSES = [
  'DRAFT',
  'REQUIREMENTS_READY',
  'ENQUIRY_SENT',
  'QUOTES_RECEIVED',
  'ALLOCATION_READY',
  'PENDING_APPROVAL',
  'APPROVED',
  'SUPPLY_ORDERED',
  'RECEIVING',
  'GRN_POSTED',
]

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const requestedDate = searchParams.get('date')
    const reportDate = requestedDate ? new Date(`${requestedDate}T00:00:00`) : new Date()
    const dayStart = startOfLocalDay(reportDate)
    const dayEnd = addDays(dayStart, 1)
    const now = new Date()
    const staleWhatsappCutoff = new Date(now.getTime() - 10 * 60 * 1000)

    const todayRange = { gte: dayStart, lt: dayEnd }

    const [
      lowStockItems,
      outOfStockCount,
      pendingRequests,
      requestsCreatedToday,
      requestsIssuedToday,
      purchaseOrdersCreatedToday,
      openPurchaseOrders,
      goodsReceiptsToday,
      dailyBatches,
      pendingVendorReplies,
      whatsappQueue,
      topConsumedGroups,
      recentFailures,
    ] = await Promise.all([
      db.item.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, name: true, category: true, unit: true, stock: true, minStock: true, reservedQty: true },
        orderBy: { stock: 'asc' },
        take: 50,
      }),
      db.item.count({ where: { deletedAt: null, active: true, stock: { lte: 0 } } }),
      db.request.findMany({
        where: { status: { in: PENDING_REQUEST_STATUSES } },
        select: {
          id: true,
          requestNumber: true,
          employee: true,
          department: true,
          status: true,
          priority: true,
          createdAt: true,
          lines: { select: { requestedQty: true, issuedQty: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      db.request.count({ where: { createdAt: todayRange } }),
      db.request.count({
        where: {
          OR: [
            { issuedAt: todayRange },
            { updatedAt: todayRange, status: { in: ['Issued', 'COMPLETED'] } },
          ],
        },
      }),
      db.purchaseOrder.count({ where: { createdAt: todayRange } }),
      db.purchaseOrder.findMany({
        where: { status: { in: OPEN_PO_STATUSES } },
        select: {
          id: true,
          poNumber: true,
          status: true,
          totalAmount: true,
          expectedDeliveryDate: true,
          createdAt: true,
          supplier: { select: { name: true } },
          items: { select: { qty: true, receivedQty: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      db.goodsReceipt.count({ where: { receivedDate: todayRange } }),
      db.dailyProcurementBatch.findMany({
        where: {
          OR: [
            { requirementDate: todayRange },
            { deliveryDate: todayRange },
            { status: { in: OPEN_DAILY_STATUSES } },
          ],
        },
        select: {
          id: true,
          batchNumber: true,
          status: true,
          deliveryDate: true,
          deliveryTimeSlot: true,
          departmentName: true,
          lines: { select: { finalPurchaseQty: true, status: true } },
          conversations: { select: { status: true, unreadCount: true } },
        },
        orderBy: { deliveryDate: 'asc' },
        take: 20,
      }),
      db.dailyRateEnquiry.count({
        where: {
          businessStatus: { in: ['AWAITING_RESPONSE', 'PARTIALLY_QUOTED', 'NEEDS_REVIEW'] },
          status: { notIn: ['FAILED', 'EXPIRED'] },
        },
      }),
      db.whatsAppMessage.groupBy({
        by: ['status'],
        where: { direction: 'OUTBOUND' },
        _count: { _all: true },
      }),
      db.transaction.groupBy({
        by: ['itemId', 'itemName'],
        where: {
          type: 'OUT',
          date: todayRange,
        },
        _sum: { qty: true },
        _count: { _all: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 10,
      }),
      db.whatsAppMessage.findMany({
        where: {
          direction: 'OUTBOUND',
          status: 'FAILED',
          updatedAt: { gte: addDays(dayStart, -1) },
        },
        select: { id: true, phone: true, messageType: true, error: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ])

    const stockRiskItems = lowStockItems
      .map((item) => {
        const available = item.stock - item.reservedQty
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          unit: item.unit,
          stock: item.stock,
          reservedQty: item.reservedQty,
          available,
          minStock: item.minStock,
          shortageQty: Math.max(0, item.minStock - available),
          severity: available <= 0 ? 'critical' : available <= item.minStock ? 'warning' : 'ok',
        }
      })
      .filter((item) => item.severity !== 'ok')
      .slice(0, 12)

    const openPoRows = openPurchaseOrders.map((po) => {
      const orderedQty = po.items.reduce((sum, item) => sum + item.qty, 0)
      const receivedQty = po.items.reduce((sum, item) => sum + item.receivedQty, 0)
      const pendingQty = Math.max(0, orderedQty - receivedQty)
      const ageInDays = Math.max(0, Math.floor((now.getTime() - po.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
      const overdue = po.expectedDeliveryDate ? po.expectedDeliveryDate < dayStart : false

      return {
        id: po.id,
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        status: po.status,
        totalAmount: po.totalAmount,
        expectedDeliveryDate: po.expectedDeliveryDate,
        orderedQty,
        receivedQty,
        pendingQty,
        ageInDays,
        overdue,
      }
    })

    const whatsappCounts = whatsappQueue.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all
      return acc
    }, {})

    const staleProcessingCount = await db.whatsAppMessage.count({
      where: {
        direction: 'OUTBOUND',
        status: 'PROCESSING',
        updatedAt: { lte: staleWhatsappCutoff },
      },
    })

    const pendingRequestRows = pendingRequests.map((request) => {
      const requestedQty = request.lines.reduce((sum, line) => sum + line.requestedQty, 0)
      const issuedQty = request.lines.reduce((sum, line) => sum + line.issuedQty, 0)
      const ageInDays = Math.max(0, Math.floor((now.getTime() - request.createdAt.getTime()) / (1000 * 60 * 60 * 24)))

      return {
        id: request.id,
        requestNumber: request.requestNumber ?? `REQ-${request.id.slice(-6).toUpperCase()}`,
        employee: request.employee,
        department: request.department,
        status: request.status,
        priority: request.priority,
        requestedQty,
        issuedQty,
        ageInDays,
      }
    })

    const dailyRows = dailyBatches.map((batch) => {
      const finalPurchaseQty = batch.lines.reduce((sum, line) => sum + line.finalPurchaseQty, 0)
      const openLines = batch.lines.filter((line) => !['RECEIVED', 'CANCELLED'].includes(line.status)).length
      const unreadVendorMessages = batch.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)
      const activeConversations = batch.conversations.filter((conversation) => !['CLOSED', 'CANCELLED', 'RECEIVED'].includes(conversation.status)).length

      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        status: batch.status,
        deliveryDate: batch.deliveryDate,
        deliveryTimeSlot: batch.deliveryTimeSlot,
        departmentName: batch.departmentName,
        finalPurchaseQty,
        openLines,
        activeConversations,
        unreadVendorMessages,
      }
    })

    const urgentActions = [
      stockRiskItems.filter((item) => item.severity === 'critical').length
        ? {
          severity: 'critical',
          area: 'Inventory',
          title: `${stockRiskItems.filter((item) => item.severity === 'critical').length} item(s) are out of stock`,
          detail: 'Review stock risk and create urgent procurement or transfer actions.',
        }
        : null,
      pendingRequestRows.filter((request) => request.ageInDays >= 2).length
        ? {
          severity: 'warning',
          area: 'Requisitions',
          title: `${pendingRequestRows.filter((request) => request.ageInDays >= 2).length} pending requisition(s) older than 2 days`,
          detail: 'Clear approval, store review, or issue pending queues.',
        }
        : null,
      openPoRows.filter((po) => po.overdue).length
        ? {
          severity: 'warning',
          area: 'Purchase Orders',
          title: `${openPoRows.filter((po) => po.overdue).length} purchase order(s) are overdue`,
          detail: 'Follow up with suppliers and update expected delivery dates.',
        }
        : null,
      pendingVendorReplies
        ? {
          severity: 'warning',
          area: 'Daily Procurement',
          title: `${pendingVendorReplies} vendor reply/review item(s) pending`,
          detail: 'Check WhatsApp vendor replies before final allocation.',
        }
        : null,
      staleProcessingCount || (whatsappCounts.FAILED ?? 0)
        ? {
          severity: 'critical',
          area: 'WhatsApp',
          title: `${staleProcessingCount} stuck and ${whatsappCounts.FAILED ?? 0} failed outbound message(s)`,
          detail: 'Run queue recovery and verify the WhatsApp bridge.',
        }
        : null,
    ].filter((action): action is { severity: string; area: string; title: string; detail: string } => Boolean(action))

    return NextResponse.json({
      reportDate: formatDateKey(dayStart),
      generatedAt: now.toISOString(),
      summary: {
        stockRiskCount: stockRiskItems.length,
        outOfStockCount,
        requestsCreatedToday,
        requestsIssuedToday,
        pendingRequests: pendingRequestRows.length,
        purchaseOrdersCreatedToday,
        openPurchaseOrders: openPoRows.length,
        overduePurchaseOrders: openPoRows.filter((po) => po.overdue).length,
        goodsReceiptsToday,
        dailyProcurementBatches: dailyRows.length,
        pendingVendorReplies,
        whatsappPending: whatsappCounts.PENDING ?? 0,
        whatsappProcessing: whatsappCounts.PROCESSING ?? 0,
        whatsappFailed: whatsappCounts.FAILED ?? 0,
        whatsappStaleProcessing: staleProcessingCount,
      },
      urgentActions,
      stockRiskItems,
      pendingRequests: pendingRequestRows,
      purchaseOrders: openPoRows,
      dailyProcurement: dailyRows,
      whatsappFailures: recentFailures,
      topConsumedItems: topConsumedGroups.map((row) => ({
        itemId: row.itemId,
        itemName: row.itemName,
        qty: row._sum.qty ?? 0,
        transactions: row._count._all,
      })),
    }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientValidationError) {
      console.error('[reporting/daily-operations] prisma error:', error)
    }
    return handleApiError(error)
  }
}
