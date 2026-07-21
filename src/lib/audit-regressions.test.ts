import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from './db'
import { generateToken, type AuthRole } from './jwt'
import { PATCH as receivePurchaseOrder } from '@/app/api/purchase-orders/[id]/receive/route'
import { POST as createPurchaseOrder } from '@/app/api/purchase-orders/route'
import { POST as createRequest } from '@/app/api/requests/route'
import { GET as listTransactions } from '@/app/api/transactions/route'
import { PATCH as returnCheckout } from '@/app/api/checkouts/[id]/return/route'

const PREFIX = 'audit-regression'

const users = {
  departmentUser: {
    id: `${PREFIX}-department-user`,
    empId: `${PREFIX}-department-user`,
    name: 'Department User',
    department: 'Cutting',
    role: 'DEPT_USER' as AuthRole,
    password: 'password',
    active: true,
  },
  otherUser: {
    id: `${PREFIX}-other-user`,
    empId: `${PREFIX}-other-user`,
    name: 'Other User',
    department: 'Polishing',
    role: 'DEPT_USER' as AuthRole,
    password: 'password',
    active: true,
  },
  purchaseUser: {
    id: `${PREFIX}-purchase-user`,
    empId: `${PREFIX}-purchase-user`,
    name: 'Purchase User',
    department: 'Purchase',
    role: 'PURCHASE_USER' as AuthRole,
    password: 'password',
    active: true,
  },
  storeUser: {
    id: `${PREFIX}-store-user`,
    empId: `${PREFIX}-store-user`,
    name: 'Store User',
    department: 'Store',
    role: 'STORE_OPERATOR' as AuthRole,
    password: 'password',
    active: true,
  },
}

const itemId = `${PREFIX}-item`
const supplierId = `${PREFIX}-supplier`
const requestId = `${PREFIX}-request`
const receivePoId = `${PREFIX}-receive-po`
const checkoutId = `${PREFIX}-checkout`

async function cleanupFixtures() {
  const requestRows = await db.request.findMany({
    where: { OR: [{ id: { startsWith: PREFIX } }, { userId: { startsWith: PREFIX } }] },
    select: { id: true },
  })
  const requestIds = requestRows.map((row) => row.id)
  const poRows = await db.purchaseOrder.findMany({
    where: { OR: [{ id: { startsWith: PREFIX } }, { linkedSrId: { in: requestIds } }] },
    select: { id: true },
  })
  const poIds = poRows.map((row) => row.id)
  const instances = await db.approvalInstance.findMany({
    where: { documentId: { in: [...requestIds, ...poIds] } },
    select: { id: true },
  })
  const instanceIds = instances.map((row) => row.id)

  if (instanceIds.length) {
    await db.approvalStep.deleteMany({ where: { instanceId: { in: instanceIds } } })
    await db.approvalInstance.deleteMany({ where: { id: { in: instanceIds } } })
  }
  await db.notification.deleteMany({ where: { userId: { startsWith: PREFIX } } })
  await db.auditLog.deleteMany({ where: { userId: { startsWith: PREFIX } } })
  await db.approvalLog.deleteMany({
    where: { OR: [{ userId: { startsWith: PREFIX } }, { poId: { in: poIds } }, { reqId: { in: requestIds } }] },
  })

  const receipts = await db.goodsReceipt.findMany({
    where: { purchaseOrderId: { in: poIds } },
    select: { id: true },
  })
  const receiptIds = receipts.map((row) => row.id)
  if (receiptIds.length) {
    await db.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: { in: receiptIds } } })
    await db.goodsReceipt.deleteMany({ where: { id: { in: receiptIds } } })
  }
  if (poIds.length) {
    await db.pOItem.deleteMany({ where: { purchaseOrderId: { in: poIds } } })
    await db.purchaseOrder.deleteMany({ where: { id: { in: poIds } } })
  }
  if (requestIds.length) {
    await db.requestLine.deleteMany({ where: { requestId: { in: requestIds } } })
    await db.request.deleteMany({ where: { id: { in: requestIds } } })
  }
  await db.itemCheckout.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.transaction.deleteMany({
    where: { OR: [{ id: { startsWith: PREFIX } }, { itemId: { startsWith: PREFIX } }] },
  })
  await db.item.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.supplier.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function tokenFor(user: typeof users[keyof typeof users]) {
  return generateToken({
    id: user.id,
    empId: user.empId,
    name: user.name,
    department: user.department,
    role: user.role,
  })
}

async function apiRequest(
  path: string,
  user: typeof users[keyof typeof users],
  options: { method?: string; body?: unknown } = {},
) {
  const token = await tokenFor(user)
  return new NextRequest(`http://localhost${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

describe('audit regression coverage', () => {
  beforeEach(async () => {
    await cleanupFixtures()
    await db.user.createMany({ data: Object.values(users) })
    await db.item.create({
      data: {
        id: itemId,
        name: 'Audit Item',
        category: 'Testing',
        unit: 'pcs',
        stock: 10,
        reservedQty: 0,
        active: true,
      },
    })
    await db.supplier.create({
      data: { id: supplierId, name: 'Audit Supplier', active: true, status: 'ACTIVE' },
    })
    await db.request.create({
      data: {
        id: requestId,
        requestNumber: 'SR-AUDIT-001',
        userId: users.otherUser.id,
        employee: users.otherUser.name,
        department: users.otherUser.department,
        status: 'Approved',
        lines: {
          create: {
            itemId,
            itemName: 'Audit Item',
            requestedQty: 2,
            approvedQty: 2,
            pendingPurchaseQty: 2,
            fulfillmentStatus: 'PURCHASE_REQUIRED',
            unit: 'pcs',
            status: 'Approved',
          },
        },
      },
    })
    await db.purchaseOrder.create({
      data: {
        id: receivePoId,
        poNumber: 'PO-AUDIT-RECEIVE-001',
        supplierId,
        status: 'APPROVED',
        totalAmount: 100,
        items: { create: { itemId, qty: 10, unitPrice: 10 } },
      },
    })
    await db.itemCheckout.create({
      data: { id: checkoutId, itemId, userId: users.otherUser.id, qty: 1, status: 'ACTIVE' },
    })
    await db.transaction.createMany({
      data: [
        {
          id: `${PREFIX}-txn-own`,
          type: 'OUT',
          itemId,
          itemName: 'Audit Item',
          qty: 1,
          userId: users.departmentUser.id,
        },
        {
          id: `${PREFIX}-txn-other`,
          type: 'OUT',
          itemId,
          itemName: 'Audit Item',
          qty: 1,
          userId: users.otherUser.id,
        },
      ],
    })
  })

  afterEach(cleanupFixtures)

  it('rejects cumulative over-receipt through duplicate item lines', async () => {
    const request = await apiRequest(`/api/purchase-orders/${receivePoId}/receive`, users.storeUser, {
      method: 'PATCH',
      body: { items: [{ itemId, qty: 10 }, { itemId, qty: 10 }] },
    })
    const response = await receivePurchaseOrder(request, { params: Promise.resolve({ id: receivePoId }) })

    expect(response.status).toBe(400)
    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).stock).toBe(10)
  })

  it('rejects PO quantities above the linked requisition purchase balance', async () => {
    const request = await apiRequest('/api/purchase-orders', users.purchaseUser, {
      method: 'POST',
      body: {
        linkedSrId: requestId,
        supplierId,
        items: [{ itemId, qty: 3, unitPrice: 10 }],
      },
    })
    const response = await createPurchaseOrder(request)

    expect(response.status).toBe(400)
    expect(await db.purchaseOrder.count({ where: { linkedSrId: requestId } })).toBe(0)
  })

  it('prevents a department user from creating a request for another user', async () => {
    const request = await apiRequest('/api/requests', users.departmentUser, {
      method: 'POST',
      body: { userId: users.otherUser.id, lines: [{ itemId, qty: 1 }] },
    })
    const response = await createRequest(request)

    expect(response.status).toBe(403)
  })

  it('scopes department-user transaction history to that user', async () => {
    const request = await apiRequest(`/api/transactions?itemId=${itemId}`, users.departmentUser)
    const response = await listTransactions(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.transactions).toHaveLength(1)
    expect(payload.transactions[0].userId).toBe(users.departmentUser.id)
  })

  it('prevents a department user from returning another user checkout', async () => {
    const request = await apiRequest(`/api/checkouts/${checkoutId}/return`, users.departmentUser, {
      method: 'PATCH',
    })
    const response = await returnCheckout(request, { params: Promise.resolve({ id: checkoutId }) })

    expect(response.status).toBe(403)
    expect((await db.itemCheckout.findUniqueOrThrow({ where: { id: checkoutId } })).status).toBe('ACTIVE')
    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).stock).toBe(10)
  })
})
