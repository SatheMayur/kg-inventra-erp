import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from './db'
import { generateToken } from './jwt'
import { POST as createSupplier } from '@/app/api/suppliers/route'
import { POST as createPurchaseOrder } from '@/app/api/purchase-orders/route'

describe('supplier and PO supplier API validation', () => {
  const purchaseUser = {
    id: 'supplier-api-purchase-user',
    empId: 'SUP-API-PURCHASE',
    name: 'Supplier API Purchase User',
    department: 'Purchase',
    role: 'PURCHASE_USER' as const,
    password: 'password',
    active: true,
  }

  let token: string

  beforeAll(async () => {
    await db.supplier.deleteMany({
      where: {
        id: { in: ['supplier-api-existing', 'supplier-api-inactive'] },
      },
    })
    await db.user.deleteMany({ where: { id: purchaseUser.id } })

    await db.user.create({ data: purchaseUser })
    await db.supplier.create({
      data: {
        id: 'supplier-api-existing',
        name: 'Supplier API Existing',
        gstNumber: '24ABCDE1234F1Z5',
        phone: '919811112222',
        email: 'existing.supplier@example.com',
        active: true,
        status: 'ACTIVE',
      },
    })
    await db.supplier.create({
      data: {
        id: 'supplier-api-inactive',
        name: 'Supplier API Inactive',
        active: false,
        status: 'INACTIVE',
      },
    })

    token = await generateToken({
      id: purchaseUser.id,
      empId: purchaseUser.empId,
      name: purchaseUser.name,
      department: purchaseUser.department,
      role: purchaseUser.role,
    })
  })

  afterAll(async () => {
    await db.supplier.deleteMany({
      where: {
        OR: [
          { id: { in: ['supplier-api-existing', 'supplier-api-inactive'] } },
          { name: { startsWith: 'Supplier API' } },
        ],
      },
    })
    await db.user.deleteMany({ where: { id: purchaseUser.id } })
  })

  it('rejects inline supplier creation when GSTIN already belongs to another supplier', async () => {
    const req = new NextRequest('http://localhost/api/suppliers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Supplier API GST Duplicate',
        gstNumber: '24abcde1234f1z5',
      }),
    })

    const res = await createSupplier(req)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.error).toMatch(/duplicate supplier/i)
    expect(data.error).toMatch(/GSTIN|PAN/i)
  })

  it('rejects inline supplier creation when phone already exists in normalized form', async () => {
    const req = new NextRequest('http://localhost/api/suppliers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Supplier API Phone Duplicate',
        phone: '+91 98111 12222',
      }),
    })

    const res = await createSupplier(req)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.error).toMatch(/phone\/contact number/i)
  })

  it('rejects PO creation with an inactive supplier before mutating requisition data', async () => {
    const req = new NextRequest('http://localhost/api/purchase-orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        linkedSrId: 'missing-sr-for-inactive-supplier-test',
        supplierId: 'supplier-api-inactive',
        items: [{ itemId: 'missing-item', qty: 1, unitPrice: 10 }],
      }),
    })

    const res = await createPurchaseOrder(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/inactive or blocked/i)
  })
})
