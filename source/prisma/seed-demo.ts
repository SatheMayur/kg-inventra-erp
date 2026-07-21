/**
 * Demo data seed — populates the modules the base seed leaves empty
 * (suppliers, purchase orders, transactions, checkouts, maintenance, pick lists,
 * gate passes, extra requests) so every screen shows realistic data.
 *
 * Idempotent-ish: skips if suppliers already exist. Re-run after `db:reset`.
 * Run: DATABASE_URL="file:./prisma/dev.db" node --experimental-strip-types prisma/seed-demo.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  if ((await db.supplier.count()) > 0) {
    console.log('Demo data already present (suppliers exist). Skipping.')
    return
  }

  const items = await db.item.findMany({ take: 12 })
  const users = await db.user.findMany({ take: 10 })
  if (items.length === 0 || users.length === 0) {
    console.log('Need items and users first (run the base seed). Aborting.')
    return
  }
  const pick = <T,>(arr: T[], i: number) => arr[i % arr.length]

  // 1. Suppliers
  const suppliers = await Promise.all(
    [
      { name: 'Apex Office Supplies', contact: '+91 98200 11111', email: 'sales@apexoffice.in', category: 'Stationery' },
      { name: 'TechNova Distributors', contact: '+91 98200 22222', email: 'orders@technova.in', category: 'IT Hardware' },
      { name: 'GreenLeaf Pantry Co.', contact: '+91 98200 33333', email: 'hello@greenleaf.in', category: 'Pantry' },
      { name: 'SafeGuard Facilities', contact: '+91 98200 44444', email: 'support@safeguard.in', category: 'Facilities' },
    ].map((s) => db.supplier.create({ data: { ...s, active: true } }))
  )
  console.log('suppliers', suppliers.length)

  // 2. Purchase orders (mix of statuses)
  let poN = 1
  const poStatuses = ['SENT', 'RECEIVED', 'DRAFT']
  for (let i = 0; i < 3; i++) {
    const lineItems = [pick(items, i), pick(items, i + 1)]
    const lines = lineItems.map((it) => ({ itemId: it.id, qty: 20 + i * 5, unitPrice: Math.max(1, Math.round((it.price || 50))) }))
    const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
    await db.purchaseOrder.create({
      data: {
        poNumber: `PO-DEMO-${String(poN++).padStart(3, '0')}`,
        supplierId: pick(suppliers, i).id,
        status: poStatuses[i],
        totalAmount: total,
        notes: 'Demo purchase order',
        items: { create: lines },
      },
    })
  }
  console.log('purchaseOrders 3')

  // 3. Transactions (stock history) — IN and OUT
  const txns: { type: string; itemId: string; itemName: string; qty: number; reference: string; userId: string }[] = []
  for (let i = 0; i < 14; i++) {
    const it = pick(items, i)
    const u = pick(users, i)
    txns.push({
      type: i % 3 === 0 ? 'IN' : 'OUT',
      itemId: it.id,
      itemName: it.name,
      qty: 1 + (i % 5),
      reference: i % 3 === 0 ? 'Demo restock' : 'Demo issue',
      userId: u.id,
    })
  }
  await db.transaction.createMany({ data: txns })
  console.log('transactions', txns.length)

  // 4. Checkouts (active loaner items)
  for (let i = 0; i < 3; i++) {
    await db.itemCheckout.create({
      data: {
        itemId: pick(items, i + 2).id,
        userId: pick(users, i).id,
        qty: 1,
        purpose: 'Demo loaner checkout',
        status: 'ACTIVE',
      },
    })
  }
  console.log('checkouts 3')

  // 5. Maintenance schedules
  const soon = new Date(); soon.setDate(soon.getDate() + 7)
  const later = new Date(); later.setDate(later.getDate() + 45)
  for (const [idx, due] of [soon, later].entries()) {
    await db.maintenanceSchedule.create({
      data: {
        itemId: pick(items, idx).id,
        title: idx === 0 ? 'Quarterly service check' : 'Annual calibration',
        dueDate: due,
        recurringDays: idx === 0 ? 90 : 365,
        status: 'PENDING',
        notes: 'Demo maintenance schedule',
      },
    })
  }
  console.log('maintenanceSchedules 2')

  // 6. Pick list with items
  await db.pickList.create({
    data: {
      name: 'Demo onboarding kit pull',
      status: 'DRAFT',
      notes: 'Demo pick list',
      items: {
        create: [pick(items, 0), pick(items, 1), pick(items, 2)].map((it) => ({
          itemId: it.id,
          itemName: it.name,
          qty: 2,
          pickedQty: 0,
          unit: it.unit || 'pcs',
          status: 'PENDING',
        })),
      },
    },
  })
  console.log('pickList 1')

  // 7. Gate passes
  for (let i = 0; i < 2; i++) {
    await db.gatePass.create({
      data: {
        passNumber: `GP-DEMO-${String(i + 1).padStart(3, '0')}`,
        type: i === 0 ? 'OUT' : 'IN',
        receiverName: pick(users, i).name,
        vehicleNumber: i === 0 ? 'MH01-AB-1234' : null,
        purpose: 'Demo gate pass',
        status: 'ISSUED',
      },
    })
  }
  console.log('gatePasses 2')

  // 8. A few more requests (Pending + Approved)
  for (let i = 0; i < 3; i++) {
    const it = pick(items, i + 3)
    const u = pick(users, i + 1)
    await db.request.create({
      data: {
        userId: u.id,
        employee: u.name,
        department: u.department,
        note: 'Demo request',
        status: i === 0 ? 'Approved' : 'Pending',
        lines: {
          create: [{
            itemId: it.id,
            itemName: it.name,
            requestedQty: 1 + i,
            approvedQty: i === 0 ? 1 + i : 0,
            status: i === 0 ? 'Approved' : 'Pending',
          }],
        },
      },
    })
  }
  console.log('requests +3')

  console.log('Demo seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
