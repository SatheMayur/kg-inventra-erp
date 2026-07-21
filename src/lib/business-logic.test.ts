import { describe, it, expect, beforeAll } from 'vitest'
import { db } from './db'
import { mutateStock } from './stock'
import { threeWayMatch } from './three-way-match'
import { getKolkataDateString } from './date-utils'

describe('End-to-End Requisition Routing and 3-Way Match Verification', () => {
  const userId = 'test-user-proc'
  const itemId = 'test-item-proc'
  const supplierId = 'test-supplier-proc'

  beforeAll(async () => {
    // Clean up old test data to avoid SQLite constraint violations
    await db.approvalLog.deleteMany({})
    await db.goodsReceiptItem.deleteMany({})
    await db.goodsReceipt.deleteMany({})
    await db.purchaseInvoice.deleteMany({})
    await db.pOItem.deleteMany({})
    await db.purchaseOrder.deleteMany({})
    await db.requestLine.deleteMany({})
    await db.request.deleteMany({})

    // Upsert User
    await db.user.upsert({
      where: { id: userId },
      update: { role: 'admin', active: true },
      create: {
        id: userId,
        empId: 'EMP-TEST-PROC',
        name: 'Test Admin',
        department: 'Operations',
        role: 'admin',
        password: 'password',
        active: true
      }
    })

    // Upsert Supplier
    await db.supplier.upsert({
      where: { id: supplierId },
      update: {
        status: 'ACTIVE',
        active: true,
        gstNumber: '24AAAAC1234A1Z1',
        phone: '919876543210',
        paymentTerms: 'Net 30'
      },
      create: {
        id: supplierId,
        name: 'Ambika Traders',
        status: 'ACTIVE',
        active: true,
        gstNumber: '24AAAAC1234A1Z1',
        phone: '919876543210',
        paymentTerms: 'Net 30'
      }
    })

    // Upsert Item
    await db.item.upsert({
      where: { id: itemId },
      update: {
        stock: 120,
        reservedQty: 0,
        price: 10,
        preferredSupplierId: supplierId
      },
      create: {
        id: itemId,
        name: 'Blue Gel Pen',
        category: 'Stationery',
        unit: 'pcs',
        stock: 120,
        reservedQty: 0,
        price: 10,
        preferredSupplierId: supplierId
      }
    })
  })

  it('should run E2E procurement workflow from Requisition to Closed PO', async () => {
    const requestedQty = 150 // stock is 120, shortfall is 30
    
    const user = await db.user.findUnique({ where: { id: userId } })
    const item = await db.item.findUnique({ where: { id: itemId } })

    expect(user).toBeDefined()
    expect(item).toBeDefined()

    // 1. Create a Store Requisition that has shortfall
    const req = await db.$transaction(async (tx) => {
      const available = item!.stock - item!.reservedQty // 120
      const shortfall = requestedQty - available // 30
      
      // Reserve available stock
      await tx.item.update({
        where: { id: itemId },
        data: { reservedQty: { increment: available }, version: { increment: 1 } }
      })

      return tx.request.create({
        data: {
          userId,
          employee: user!.name,
          department: user!.department,
          status: 'UNDER_REVIEW',
          lines: {
            create: [{
              itemId,
              itemName: item!.name,
              requestedQty,
              availableQtySnapshot: available,
              unit: item!.unit,
              status: 'UNDER_REVIEW'
            }]
          }
        },
        include: { lines: true }
      })
    })

    expect(req.status).toBe('UNDER_REVIEW')
    expect(req.lines[0].availableQtySnapshot).toBe(120)

    // 2. Approve Requisition
    const approvedReq = await db.$transaction(async (tx) => {
      await tx.requestLine.updateMany({
        where: { requestId: req.id },
        data: { status: 'APPROVED', approvedQty: requestedQty }
      })
      return tx.request.update({
        where: { id: req.id },
        data: { status: 'APPROVED' },
        include: { lines: true }
      })
    })

    expect(approvedReq.status).toBe('APPROVED')

    // 3. Convert Requisition to PO (DRAFT)
    const po = await db.$transaction(async (tx) => {
      // Duplicate conversion check
      const existingPo = await tx.purchaseOrder.findFirst({
        where: { linkedSrId: approvedReq.id, status: { not: 'CANCELLED' } }
      })
      if (existingPo) throw new Error('PO already exists')

      // Build PO items from lines shortfall
      const poItems = approvedReq.lines.map(line => {
        const orderedQty = line.requestedQty - line.availableQtySnapshot
        return {
          itemId: line.itemId,
          qty: orderedQty,
          unitPrice: Math.max(0, Math.round(item!.price || 0))
        }
      }).filter(i => i.qty > 0)

      const date = getKolkataDateString().replace(/-/g, '')
      const count = await tx.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${date}` } } })
      const poNumber = `PO-${date}-${(count + 1).toString().padStart(3, '0')}`
      const totalAmount = poItems.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)

      const newPo = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          linkedSrId: approvedReq.id,
          totalAmount,
          status: 'DRAFT',
          createdBy: user!.name,
          items: {
            create: poItems.map(i => ({
              itemId: i.itemId,
              qty: i.qty,
              unitPrice: i.unitPrice
            }))
          }
        },
        include: { items: true }
      })

      // Update Requisition to CONVERTED_TO_PO
      await tx.request.update({
        where: { id: approvedReq.id },
        data: { status: 'CONVERTED_TO_PO' }
      })

      // Create initial approval log
      await tx.approvalLog.create({
        data: {
          poId: newPo.id,
          userId: user!.id,
          userName: user!.name,
          role: user!.role,
          action: 'SUBMIT',
          remarks: 'Converted from requisition',
          amount: totalAmount
        }
      })

      return newPo
    })

    expect(po.status).toBe('DRAFT')
    expect(po.items[0].qty).toBe(30)

    // Verify Requisition is now CONVERTED_TO_PO
    const finalReqState = await db.request.findUnique({ where: { id: req.id } })
    expect(finalReqState!.status).toBe('CONVERTED_TO_PO')

    // 4. PO Approval
    const approvedPo = await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } })
      if (!supplier || supplier.status !== 'ACTIVE') throw new Error('Supplier inactive')
      if (!supplier.gstNumber) throw new Error('Supplier needs GST')
      if (!supplier.phone && !supplier.contact) throw new Error('Supplier needs contact info')
      if (!supplier.paymentTerms) throw new Error('Supplier needs payment terms')

      await tx.approvalLog.create({
        data: {
          poId: po.id,
          userId: user!.id,
          userName: user!.name,
          role: user!.role,
          action: 'APPROVE',
          remarks: 'Approved PO',
          amount: po.totalAmount
        }
      })

      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: 'APPROVED',
          approvedBy: user!.id,
          approvedAt: new Date()
        },
        include: { items: true }
      })
    })

    expect(approvedPo.status).toBe('APPROVED')
    expect(approvedPo.approvedBy).toBe(user!.id)

    // 5. Receive Goods (GRN is created, physical stock updates immediately, status becomes INVOICE_PENDING)
    const receivePo = await db.$transaction(async (tx) => {
      const date = getKolkataDateString().replace(/-/g, '')
      const grnCount = await tx.goodsReceipt.count({ where: { grnNumber: { startsWith: `GRN-${date}` } } })
      const grnNumber = `GRN-${date}-${(grnCount + 1).toString().padStart(3, '0')}`

      const grn = await tx.goodsReceipt.create({
        data: {
          grnNumber,
          purchaseOrderId: approvedPo.id,
          supplierId,
          receivedBy: user!.name,
          remarks: 'Test receipt'
        }
      })

      for (const itemLine of approvedPo.items) {
        // Create GoodsReceiptItem
        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: grn.id,
            itemId: itemLine.itemId,
            orderedQty: itemLine.qty,
            receivedQty: itemLine.qty,
            rejectedQty: 0,
            acceptedQty: itemLine.qty
          }
        })

        // Update physical stock IMMEDIATELY
        await mutateStock(tx, {
          itemId: itemLine.itemId,
          delta: itemLine.qty,
          reference: `GRN ${grnNumber} for PO ${approvedPo.poNumber}`,
          userId: user!.id,
          subType: 'PURCHASE'
        })

        // Update POItem receivedQty
        await tx.pOItem.update({
          where: { id: itemLine.id },
          data: { receivedQty: itemLine.qty }
        })
      }

      // Update PO status to INVOICE_PENDING since no invoice has been recorded yet
      return tx.purchaseOrder.update({
        where: { id: approvedPo.id },
        data: {
          status: 'INVOICE_PENDING',
          notes: 'Received goods; pending vendor invoice upload for 3-way match verification.'
        },
        include: { items: true }
      })
    })

    expect(receivePo.status).toBe('INVOICE_PENDING')

    // Physical stock updates immediately (120 initial + 30 received = 150)
    const itemAfterGrn = await db.item.findUnique({ where: { id: itemId } })
    expect(itemAfterGrn!.stock).toBe(150)

    // 6. Record Vendor Invoice & Execute 3-Way Match to Close the PO
    const finalPo = await db.$transaction(async (tx) => {
      const inv = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber: 'TEST-INV-MATCH',
          purchaseOrderId: po.id,
          amount: po.totalAmount,
          status: 'UNPAID'
        }
      })

      const orderedQty = receivePo.items.reduce((sum, item) => sum + item.qty, 0)
      const receivedQty = receivePo.items.reduce((sum, item) => sum + item.receivedQty, 0)
      const orderedAmount = receivePo.totalAmount
      const invoicedAmount = inv.amount

      const match = threeWayMatch({
        orderedQty,
        receivedQty,
        orderedAmount,
        invoicedAmount
      })

      expect(match.matched).toBe(true)

      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: 'CLOSED',
          notes: '3-Way Match Succeeded. PO Closed.'
        }
      })
    })

    expect(finalPo.status).toBe('CLOSED')
    expect(finalPo.notes).toContain('3-Way Match Succeeded')

    // Final physical stock remains 150
    const finalItemState = await db.item.findUnique({ where: { id: itemId } })
    expect(finalItemState!.stock).toBe(150)
  })
})
