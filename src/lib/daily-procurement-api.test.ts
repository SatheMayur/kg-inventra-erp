import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from './db'
import { generateToken } from './jwt'
import { PO_STATUS } from './po-status'
import { DAILY_PROCUREMENT_MODULE, DAILY_PROCUREMENT_STATUS } from './daily-procurement'
import { GET as getDailyBatch } from '@/app/api/daily-procurement/[id]/route'
import { POST as createDailyBatch } from '@/app/api/daily-procurement/route'
import { POST as sendDailyEnquiries } from '@/app/api/daily-procurement/[id]/enquiries/route'
import { POST as createDailyQuote } from '@/app/api/daily-procurement/quotes/route'
import { POST as allocateDailyVendors } from '@/app/api/daily-procurement/[id]/allocations/route'
import { POST as approveDailyBatch } from '@/app/api/daily-procurement/[id]/approve/route'
import { POST as sendDailySupplyOrders } from '@/app/api/daily-procurement/[id]/supply-orders/route'

const PREFIX = 'daily-proc-api'

const users = {
  creator: {
    id: `${PREFIX}-creator`,
    empId: `${PREFIX}-creator`,
    name: 'Daily Proc Creator',
    department: 'Purchase',
    role: 'PURCHASE_USER' as const,
    password: 'password',
    active: true,
  },
  approver: {
    id: `${PREFIX}-approver`,
    empId: `${PREFIX}-approver`,
    name: 'Daily Proc Approver',
    department: 'Store',
    role: 'STORE_ADMIN' as const,
    password: 'password',
    active: true,
  },
  employee: {
    id: `${PREFIX}-employee`,
    empId: `${PREFIX}-employee`,
    name: 'Daily Proc Employee',
    department: 'Kitchen',
    role: 'employee' as const,
    password: 'password',
    active: true,
  },
}

const itemId = `${PREFIX}-tomato`
const supplierAId = `${PREFIX}-supplier-a`
const supplierBId = `${PREFIX}-supplier-b`
const openPoId = `${PREFIX}-open-po`

async function cleanupFixtures() {
  const batches = await db.dailyProcurementBatch.findMany({
    where: { OR: [{ notes: { contains: PREFIX } }, { createdById: { startsWith: PREFIX } }] },
    select: { id: true },
  })
  const batchIds = batches.map((batch) => batch.id)
  const instances = batchIds.length
    ? await db.approvalInstance.findMany({
        where: { moduleName: DAILY_PROCUREMENT_MODULE, documentId: { in: batchIds } },
        select: { id: true },
      })
    : []
  const instanceIds = instances.map((instance) => instance.id)

  if (instanceIds.length) {
    await db.approvalStep.deleteMany({ where: { instanceId: { in: instanceIds } } })
    await db.approvalInstance.deleteMany({ where: { id: { in: instanceIds } } })
  }

  if (batchIds.length) {
    const enquiries = await db.dailyRateEnquiry.findMany({ where: { batchId: { in: batchIds } }, select: { id: true } })
    const enquiryIds = enquiries.map((enquiry) => enquiry.id)
    const enquiryLines = enquiryIds.length
      ? await db.dailyRateEnquiryLine.findMany({ where: { enquiryId: { in: enquiryIds } }, select: { id: true } })
      : []
    const enquiryLineIds = enquiryLines.map((line) => line.id)
    const supplyOrders = await db.dailySupplyOrder.findMany({ where: { batchId: { in: batchIds } }, select: { id: true } })
    const supplyOrderIds = supplyOrders.map((order) => order.id)

    if (supplyOrderIds.length) {
      await db.dailySupplyOrderLine.deleteMany({ where: { supplyOrderId: { in: supplyOrderIds } } })
      await db.dailySupplyOrder.deleteMany({ where: { id: { in: supplyOrderIds } } })
    }
    await db.dailyVendorAllocation.deleteMany({ where: { batchId: { in: batchIds } } })
    if (enquiryLineIds.length) await db.dailyVendorQuote.deleteMany({ where: { enquiryLineId: { in: enquiryLineIds } } })
    if (enquiryIds.length) {
      await db.dailyRateEnquiryLine.deleteMany({ where: { enquiryId: { in: enquiryIds } } })
      await db.dailyRateEnquiry.deleteMany({ where: { id: { in: enquiryIds } } })
    }
    await db.dailyProcurementLine.deleteMany({ where: { batchId: { in: batchIds } } })
    await db.dailyProcurementBatch.deleteMany({ where: { id: { in: batchIds } } })
  }

  await db.auditLog.deleteMany({
    where: { OR: [{ userId: { startsWith: PREFIX } }, { targetName: { contains: PREFIX } }] },
  })
  await db.approvalLog.deleteMany({ where: { userId: { startsWith: PREFIX } } })
  await db.whatsAppMessage.deleteMany({
    where: {
      phone: { in: ['919000000010@s.whatsapp.net', '919000000011@s.whatsapp.net'] },
    },
  })
  await db.approvalWorkflow.deleteMany({ where: { OR: [{ id: { startsWith: PREFIX } }, { moduleName: DAILY_PROCUREMENT_MODULE }] } })
  await db.pOItem.deleteMany({ where: { purchaseOrderId: openPoId } })
  await db.purchaseOrder.deleteMany({ where: { id: openPoId } })
  await db.supplier.deleteMany({ where: { id: { in: [supplierAId, supplierBId, `${PREFIX}-po-supplier`] } } })
  await db.item.deleteMany({ where: { id: itemId } })
  await db.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function seedFixtures() {
  await db.user.createMany({ data: Object.values(users) })
  await db.item.create({
    data: {
      id: itemId,
      name: 'Daily Tomato',
      category: 'Vegetables',
      unit: 'kg',
      stock: 20,
      reservedQty: 5,
      safetyStock: 5,
      price: 40,
      active: true,
      procurementType: 'DAILY',
      pricingMode: 'DAILY_MARKET_RATE',
      itemNature: 'PERISHABLE',
      baseUnit: 'kg',
      purchaseUnit: 'kg',
      consumptionUnit: 'kg',
      unitConversion: 1,
      perishable: true,
      dailyProcurementEligible: true,
    },
  })
  await db.supplier.createMany({
    data: [
      {
        id: supplierAId,
        name: 'Daily Vendor A',
        phone: '919000000010',
        active: true,
        status: 'ACTIVE',
      },
      {
        id: supplierBId,
        name: 'Daily Vendor B',
        phone: '919000000011',
        active: true,
        status: 'ACTIVE',
      },
      {
        id: `${PREFIX}-po-supplier`,
        name: 'Daily Existing PO Supplier',
        phone: '919000000012',
        active: true,
        status: 'ACTIVE',
      },
    ],
  })
  await db.purchaseOrder.create({
    data: {
      id: openPoId,
      poNumber: `${PREFIX.toUpperCase()}-OPEN-PO`,
      supplierId: `${PREFIX}-po-supplier`,
      status: PO_STATUS.APPROVED,
      totalAmount: 200,
      items: { create: [{ itemId, qty: 8, receivedQty: 3, unitPrice: 25 }] },
    },
  })
  await db.approvalWorkflow.create({
    data: {
      id: `${PREFIX}-workflow`,
      moduleName: DAILY_PROCUREMENT_MODULE,
      conditionType: 'ALWAYS',
      approverRole: users.approver.role,
      sequence: 1,
      active: true,
    },
  })
}

async function tokenFor(user: { id: string; empId: string; name: string; department: string; role: string }) {
  return generateToken({
    id: user.id,
    empId: user.empId,
    name: user.name,
    department: user.department,
    role: user.role,
  })
}

async function makeRequest(path: string, method: string, body: unknown, user: { id: string; empId: string; name: string; department: string; role: string } = users.creator) {
  const token = await tokenFor(user)
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function createBatch(body: unknown, user: { id: string; empId: string; name: string; department: string; role: string } = users.creator) {
  return createDailyBatch(await makeRequest('/api/daily-procurement', 'POST', body, user))
}

async function createStandardBatch() {
  const res = await createBatch({
    deliveryDate: '2026-07-19',
    deliveryTimeSlot: 'Morning',
    deliveryLocation: 'Central Kitchen',
    notes: PREFIX,
    lines: [
      {
        itemId,
        operationalRequirement: 50,
        requiredClosingStock: 5,
        qualityGrade: 'A',
      },
    ],
  })
  const data = await res.json()
  expect(res.status).toBe(201)
  return data.batch
}

describe('Daily Procurement API Release 1 workflow', () => {
  beforeEach(async () => {
    await cleanupFixtures()
    await seedFixtures()
  })

  afterEach(async () => {
    await cleanupFixtures()
  })

  it('consolidates compatible requirements and calculates net purchase quantity with pending supply', async () => {
    const res = await createBatch({
      deliveryDate: '2026-07-19',
      deliveryTimeSlot: 'Morning',
      deliveryLocation: 'Central Kitchen',
      notes: PREFIX,
      lines: [
        {
          itemId,
          operationalRequirement: 50,
          requiredClosingStock: 5,
          qualityGrade: 'A',
        },
        {
          itemId,
          operationalRequirement: 10,
          requiredClosingStock: 2,
          qualityGrade: 'A',
        },
      ],
    })
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.batch.lines).toHaveLength(1)
    expect(data.batch.lines[0].operationalRequirement).toBe(60)
    expect(data.batch.lines[0].usableStock).toBe(15)
    expect(data.batch.lines[0].confirmedPendingSupply).toBe(5)
    expect(data.batch.lines[0].calculatedNetQty).toBe(45)
    expect(data.batch.lines[0].finalPurchaseQty).toBe(45)
  })

  it('requires an override reason when final quantity differs from calculated net quantity', async () => {
    const res = await createBatch({
      deliveryDate: '2026-07-19',
      notes: PREFIX,
      lines: [
        {
          itemId,
          operationalRequirement: 50,
          requiredClosingStock: 5,
          finalPurchaseQty: 99,
        },
      ],
    })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/override reason/i)
  })

  it('blocks non-procurement users from creating daily batches', async () => {
    const res = await createBatch({
      deliveryDate: '2026-07-19',
      notes: PREFIX,
      lines: [{ itemId, operationalRequirement: 1 }],
    }, users.employee)

    expect(res.status).toBe(403)
  })

  it('runs enquiry, quote verification, comparison, split allocation, approval, and explicit WhatsApp order send', async () => {
    const batch = await createStandardBatch()
    const line = batch.lines[0]
    expect(line.finalPurchaseQty).toBe(35)

    const enquiryRes = await sendDailyEnquiries(
      await makeRequest(`/api/daily-procurement/${batch.id}/enquiries`, 'POST', {
        supplierIds: [supplierAId, supplierBId],
        sendWhatsApp: true,
      }),
      { params: Promise.resolve({ id: batch.id }) },
    )
    expect(enquiryRes.status).toBe(200)
    expect(await db.whatsAppMessage.count({
      where: { phone: { in: ['919000000010@s.whatsapp.net', '919000000011@s.whatsapp.net'] }, direction: 'OUTBOUND' },
    })).toBe(2)

    const repeatEnquiryRes = await sendDailyEnquiries(
      await makeRequest(`/api/daily-procurement/${batch.id}/enquiries`, 'POST', {
        supplierIds: [supplierAId, supplierBId],
        sendWhatsApp: true,
      }),
      { params: Promise.resolve({ id: batch.id }) },
    )
    expect(repeatEnquiryRes.status).toBe(200)
    expect(await db.whatsAppMessage.count({
      where: { phone: { in: ['919000000010@s.whatsapp.net', '919000000011@s.whatsapp.net'] }, direction: 'OUTBOUND' },
    })).toBe(2)

    const enquiryLines = await db.dailyRateEnquiryLine.findMany({
      where: { batchLineId: line.id },
      include: { enquiry: true },
      orderBy: { createdAt: 'asc' },
    })
    expect(enquiryLines).toHaveLength(2)
    const lineA = enquiryLines.find((entry) => entry.enquiry.supplierId === supplierAId)!
    const lineB = enquiryLines.find((entry) => entry.enquiry.supplierId === supplierBId)!

    const quoteA = await createDailyQuote(await makeRequest('/api/daily-procurement/quotes', 'POST', {
      enquiryLineId: lineA.id,
      availableQuantity: 35,
      quotedRate: 42,
      quotedUnit: 'kg',
      qualityGrade: 'A',
      verificationStatus: 'VERIFIED',
    }))
    expect(quoteA.status).toBe(201)

    const quoteB = await createDailyQuote(await makeRequest('/api/daily-procurement/quotes', 'POST', {
      enquiryLineId: lineB.id,
      availableQuantity: 10,
      quotedRate: 40,
      quotedUnit: 'kg',
      qualityGrade: 'B',
      verificationStatus: 'VERIFIED',
    }))
    expect(quoteB.status).toBe(201)

    const detailRes = await getDailyBatch(
      await makeRequest(`/api/daily-procurement/${batch.id}`, 'GET', undefined),
      { params: Promise.resolve({ id: batch.id }) },
    )
    const detail = await detailRes.json()
    const recommendations = detail.batch.recommendationsByLineId[line.id]
    expect(recommendations[0].supplierId).toBe(supplierAId)

    const allocationRes = await allocateDailyVendors(
      await makeRequest(`/api/daily-procurement/${batch.id}/allocations`, 'POST', {
        allocations: [
          { batchLineId: line.id, quoteId: recommendations[0].quoteId, allocatedQty: 25 },
          { batchLineId: line.id, quoteId: recommendations[1].quoteId, allocatedQty: 10 },
        ],
      }),
      { params: Promise.resolve({ id: batch.id }) },
    )
    const allocationData = await allocationRes.json()
    expect(allocationRes.status).toBe(200)
    expect(allocationData.batch.status).toBe(DAILY_PROCUREMENT_STATUS.ALLOCATION_READY)

    const approveRes = await approveDailyBatch(
      await makeRequest(`/api/daily-procurement/${batch.id}/approve`, 'POST', { remarks: 'Commercial approval' }, users.approver),
      { params: Promise.resolve({ id: batch.id }) },
    )
    const approveData = await approveRes.json()
    expect(approveRes.status).toBe(200)
    expect(approveData.batch.status).toBe(DAILY_PROCUREMENT_STATUS.APPROVED)
    expect(approveData.batch.supplyOrders).toHaveLength(2)
    expect(approveData.batch.supplyOrders.every((order: any) => !order.whatsappMessageId)).toBe(true)

    const sendOrdersRes = await sendDailySupplyOrders(
      await makeRequest(`/api/daily-procurement/${batch.id}/supply-orders`, 'POST', {}, users.creator),
      { params: Promise.resolve({ id: batch.id }) },
    )
    const sendOrdersData = await sendOrdersRes.json()
    expect(sendOrdersRes.status).toBe(200)
    expect(sendOrdersData.batch.status).toBe(DAILY_PROCUREMENT_STATUS.SUPPLY_ORDERED)
    expect(sendOrdersData.supplyOrders.every((order: any) => order.whatsappMessageId)).toBe(true)
    expect(await db.whatsAppMessage.count({
      where: { phone: { in: ['919000000010@s.whatsapp.net', '919000000011@s.whatsapp.net'] }, direction: 'OUTBOUND' },
    })).toBe(4)
  })

  it('rejects a verified quote when unit conversion is missing for different units', async () => {
    const batch = await createStandardBatch()
    await sendDailyEnquiries(
      await makeRequest(`/api/daily-procurement/${batch.id}/enquiries`, 'POST', {
        supplierIds: [supplierAId],
        sendWhatsApp: false,
      }),
      { params: Promise.resolve({ id: batch.id }) },
    )
    const enquiryLine = await db.dailyRateEnquiryLine.findFirst({ where: { batchLineId: batch.lines[0].id } })
    expect(enquiryLine).toBeDefined()

    const res = await createDailyQuote(await makeRequest('/api/daily-procurement/quotes', 'POST', {
      enquiryLineId: enquiryLine!.id,
      availableQuantity: 1,
      quotedRate: 800,
      quotedUnit: 'crate',
      verificationStatus: 'VERIFIED',
    }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/conversion factor/i)
  })
})
