import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from './db'
import { generateToken } from './jwt'
import { PO_STATUS } from './po-status'
import { POST as approvePurchaseOrder } from '@/app/api/purchase-orders/[id]/approve/route'

const PREFIX = 'po-approval-api'

type TestRole = 'admin' | 'employee' | 'STORE_ADMIN' | 'PURCHASE_USER' | 'ACCOUNTS_USER'

const users = {
  creator: {
    id: `${PREFIX}-creator`,
    empId: `${PREFIX}-creator`,
    name: 'PO Approval Creator',
    department: 'Purchase',
    role: 'PURCHASE_USER' as TestRole,
    password: 'password',
    active: true,
  },
  storeAdmin: {
    id: `${PREFIX}-store-admin`,
    empId: `${PREFIX}-store-admin`,
    name: 'PO Approval Store Admin',
    department: 'Store',
    role: 'STORE_ADMIN' as TestRole,
    password: 'password',
    active: true,
  },
  accounts: {
    id: `${PREFIX}-accounts`,
    empId: `${PREFIX}-accounts`,
    name: 'PO Approval Accounts',
    department: 'Accounts',
    role: 'ACCOUNTS_USER' as TestRole,
    password: 'password',
    active: true,
  },
  employee: {
    id: `${PREFIX}-employee`,
    empId: `${PREFIX}-employee`,
    name: 'PO Approval Employee',
    department: 'Sales',
    role: 'employee' as TestRole,
    password: 'password',
    active: true,
  },
}

let workflowSnapshot: Awaited<ReturnType<typeof db.approvalWorkflow.findMany>> = []

async function cleanupFixtures() {
  const poRows = await db.purchaseOrder.findMany({
    where: { id: { startsWith: PREFIX } },
    select: { id: true },
  })
  const poIds = poRows.map((po) => po.id)
  const instances = await db.approvalInstance.findMany({
    where: {
      OR: [
        { documentId: { startsWith: PREFIX } },
        ...(poIds.length ? [{ documentId: { in: poIds } }] : []),
      ],
    },
    select: { id: true },
  })
  const instanceIds = instances.map((instance) => instance.id)

  if (instanceIds.length) {
    await db.approvalStep.deleteMany({ where: { instanceId: { in: instanceIds } } })
    await db.approvalInstance.deleteMany({ where: { id: { in: instanceIds } } })
  }
  if (poIds.length) {
    await db.auditLog.deleteMany({
      where: {
        OR: [
          { targetId: { in: poIds } },
          { userId: { startsWith: PREFIX } },
        ],
      },
    })
    await db.approvalLog.deleteMany({
      where: {
        OR: [
          { poId: { in: poIds } },
          { userId: { startsWith: PREFIX } },
        ],
      },
    })
    await db.pOItem.deleteMany({ where: { purchaseOrderId: { in: poIds } } })
    await db.purchaseOrder.deleteMany({ where: { id: { in: poIds } } })
  }
  await db.supplier.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.item.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.approvalWorkflow.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function restoreWorkflows() {
  await db.approvalWorkflow.deleteMany({ where: { moduleName: 'PURCHASE_ORDER' } })
  if (workflowSnapshot.length) {
    await db.approvalWorkflow.createMany({ data: workflowSnapshot })
  }
}

async function seedBaseUsers() {
  await db.user.createMany({ data: Object.values(users) })
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

async function setPoWorkflow(steps: Array<{ approverRole: string; sequence: number; conditionType?: string; conditionValue?: string }>) {
  await db.approvalWorkflow.deleteMany({ where: { moduleName: 'PURCHASE_ORDER' } })
  await db.approvalWorkflow.createMany({
    data: steps.map((step) => ({
      id: `${PREFIX}-workflow-${step.sequence}-${step.approverRole}`,
      moduleName: 'PURCHASE_ORDER',
      conditionType: step.conditionType ?? 'ALWAYS',
      conditionValue: step.conditionValue,
      approverRole: step.approverRole,
      sequence: step.sequence,
      active: true,
    })),
  })
}

async function createPoFixture(options: {
  id: string
  poNumber?: string
  status?: string
  totalAmount?: number
  supplierActive?: boolean
  supplierStatus?: string
  supplierGstNumber?: string | null
  lineQty?: number
  unitPrice?: number
  createLine?: boolean
  cgstRate?: number
  sgstRate?: number
  igstRate?: number
}) {
  const itemId = `${options.id}-item`
  const supplierId = `${options.id}-supplier`

  await db.item.create({
    data: {
      id: itemId,
      name: `${options.id} Item`,
      category: 'Testing',
      unit: 'pcs',
      active: true,
    },
  })
  await db.supplier.create({
    data: {
      id: supplierId,
      name: `${options.id} Supplier`,
      gstNumber: options.supplierGstNumber ?? null,
      phone: '9876543210',
      paymentTerms: 'Net 30',
      active: options.supplierActive ?? true,
      status: options.supplierStatus ?? 'ACTIVE',
    },
  })

  const qty = options.lineQty ?? 2
  const unitPrice = options.unitPrice ?? 50
  const headerTaxRate = (options.cgstRate ?? 0) + (options.sgstRate ?? 0) + (options.igstRate ?? 0)
  const calculatedTotal = qty * unitPrice + (qty * unitPrice * headerTaxRate / 100)

  await db.purchaseOrder.create({
    data: {
      id: options.id,
      poNumber: options.poNumber ?? options.id.toUpperCase(),
      supplierId,
      status: options.status ?? PO_STATUS.PENDING_APPROVAL,
      totalAmount: options.totalAmount ?? calculatedTotal,
      createdBy: users.creator.name,
      cgstRate: options.cgstRate ?? 0,
      sgstRate: options.sgstRate ?? 0,
      igstRate: options.igstRate ?? 0,
    },
  })

  if (options.createLine !== false) {
    await db.pOItem.create({
      data: {
        purchaseOrderId: options.id,
        itemId,
        qty,
        unitPrice,
        discount: 0,
        taxRate: 0,
      },
    })
  }

  await db.approvalLog.create({
    data: {
      poId: options.id,
      userId: users.creator.id,
      userName: users.creator.name,
      role: users.creator.role,
      action: 'SUBMIT',
      remarks: 'Test PO submitted',
      amount: options.totalAmount ?? calculatedTotal,
    },
  })

  return { id: options.id, poNumber: options.poNumber ?? options.id.toUpperCase() }
}

async function approve(identifier: string, user = users.storeAdmin) {
  const token = await tokenFor(user)
  const req = new NextRequest(`http://localhost/api/purchase-orders/${identifier}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ remarks: 'Approved in test' }),
  })

  return approvePurchaseOrder(req, { params: Promise.resolve({ id: identifier }) })
}

describe('Purchase Order approval API', () => {
  beforeEach(async () => {
    workflowSnapshot = await db.approvalWorkflow.findMany({ where: { moduleName: 'PURCHASE_ORDER' } })
    await cleanupFixtures()
    await seedBaseUsers()
  })

  afterEach(async () => {
    await cleanupFixtures()
    await restoreWorkflows()
  })

  it('approves a valid pending PO with optional GSTIN missing', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-valid-no-gstin` })

    const res = await approve(po.id)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.po.status).toBe(PO_STATUS.APPROVED)
    expect(data.po.approvedBy).toBe(users.storeAdmin.id)
  })

  it('accepts the unique PO number as an approval identifier', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-po-number`, poNumber: 'PO-TEST-APPROVE-001' })

    const res = await approve(po.poNumber)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.po.id).toBe(po.id)
    expect(data.po.status).toBe(PO_STATUS.APPROVED)
  })

  it('returns 404 for an invalid PO identifier', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])

    const res = await approve(`${PREFIX}-missing`)
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toMatch(/not found/i)
  })

  it('rejects a user who does not match the current approval step', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-wrong-role` })

    const res = await approve(po.id, users.employee)
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toMatch(/STORE_ADMIN|permission/i)
  })

  it('rejects creator self-approval', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-self-approval` })

    const res = await approve(po.id, users.creator)
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toMatch(/own/i)
  })

  it('allows a configured ACCOUNTS_USER second approval step', async () => {
    await setPoWorkflow([
      { approverRole: 'STORE_ADMIN', sequence: 1 },
      { approverRole: 'ACCOUNTS_USER', sequence: 2, conditionType: 'AMOUNT_GTE', conditionValue: '100' },
    ])
    const po = await createPoFixture({ id: `${PREFIX}-accounts-step`, unitPrice: 75, totalAmount: 150 })

    const first = await approve(po.id, users.storeAdmin)
    const firstData = await first.json()
    expect(first.status).toBe(200)
    expect(firstData.po.status).toBe(PO_STATUS.PENDING_APPROVAL)

    const second = await approve(po.id, users.accounts)
    const secondData = await second.json()
    expect(second.status).toBe(200)
    expect(secondData.po.status).toBe(PO_STATUS.APPROVED)
  })

  it('returns an approved PO idempotently without duplicate approval logs', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-double-click` })

    const first = await approve(po.id)
    expect(first.status).toBe(200)
    const second = await approve(po.id)
    const secondData = await second.json()
    expect(second.status).toBe(200)
    expect(secondData.po.status).toBe(PO_STATUS.APPROVED)

    const approveLogs = await db.approvalLog.count({
      where: { poId: po.id, action: 'APPROVE' },
    })
    const auditLogs = await db.auditLog.count({
      where: { targetId: po.id, action: 'APPROVE_PO' },
    })
    expect(approveLogs).toBe(1)
    expect(auditLogs).toBe(1)
  })

  it('rejects cancelled POs', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-cancelled`, status: PO_STATUS.CANCELLED })

    const res = await approve(po.id)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/cannot be approved/i)
  })

  it('rejects POs without line items', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-no-lines`, createLine: false, totalAmount: 0 })

    const res = await approve(po.id)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/line item/i)
  })

  it('rejects PO lines with zero quantity', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-zero-qty`, lineQty: 0, totalAmount: 0 })

    const res = await approve(po.id)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/quantity greater than zero/i)
  })

  it('rejects inactive suppliers', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({
      id: `${PREFIX}-inactive-supplier`,
      supplierActive: false,
      supplierStatus: 'INACTIVE',
    })

    const res = await approve(po.id)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/inactive or blocked/i)
  })

  it('rejects total mismatches using a cents-safe comparison', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({ id: `${PREFIX}-bad-total`, totalAmount: 999 })

    const res = await approve(po.id)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/total does not match/i)
  })

  it('does not reject decimal rounding noise', async () => {
    await setPoWorkflow([{ approverRole: 'STORE_ADMIN', sequence: 1 }])
    const po = await createPoFixture({
      id: `${PREFIX}-rounding`,
      lineQty: 3,
      unitPrice: 33.3333,
      totalAmount: 100,
    })

    const res = await approve(po.id)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.po.status).toBe(PO_STATUS.APPROVED)
  })
})
