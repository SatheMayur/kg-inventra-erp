import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/auth'
import { db } from '@/lib/db'
import { fetchPriceTransactions } from '@/lib/price-management'

export async function GET(request: NextRequest) {
  const auth = await authorize(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const user = auth.user!

  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('itemId') || undefined
  const categoryId = searchParams.get('categoryId') || undefined
  const supplierId = searchParams.get('supplierId') || undefined
  const startDate = searchParams.get('startDate') || undefined
  const endDate = searchParams.get('endDate') || undefined
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 1000

  try {
    const transactions = await fetchPriceTransactions({
      itemId,
      categoryId,
      supplierId,
      startDate,
      endDate,
      limit,
    })
    return NextResponse.json({ transactions })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch price transactions' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const user = auth.user!

  try {
    const body = await request.json()
    const { itemId, supplierId, transactionDate, rate, quantity, gstRate, invoiceNumber, notes } = body

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }
    const numRate = Number(rate)
    const numQty = Number(quantity)
    if (isNaN(numRate) || numRate <= 0) {
      return NextResponse.json({ error: 'Rate must be greater than zero' }, { status: 400 })
    }
    if (isNaN(numQty) || numQty <= 0) {
      return NextResponse.json({ error: 'Quantity must be greater than zero' }, { status: 400 })
    }

    const item = await db.item.findUnique({ where: { id: itemId } })
    if (!item) {
      return NextResponse.json({ error: 'Item Master record not found' }, { status: 404 })
    }

    const gst = Number(gstRate) || item.gstRate || 0
    const lineAmount = Number((numRate * numQty).toFixed(2))
    const taxAmount = Number(((lineAmount * gst) / 100).toFixed(2))
    const grossAmount = Number((lineAmount + taxAmount).toFixed(2))
    const grossRate = Number((grossAmount / numQty).toFixed(2))

    const transaction = await db.priceTransaction.create({
      data: {
        itemId: item.id,
        categoryId: item.category,
        unitId: item.unit,
        supplierId: supplierId || null,
        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
        rate: numRate,
        quantity: numQty,
        lineAmount,
        gstRate: gst,
        taxAmount,
        grossAmount,
        grossRate,
        invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : null,
        notes: notes ? String(notes).trim() : null,
        sourceType: 'MANUAL_ENTRY',
        originalItemText: item.name,
        createdById: auth.user.id,
        createdBy: auth.user.name,
      },
      include: {
        item: { select: { id: true, name: true, category: true, unit: true } },
        supplier: { select: { id: true, name: true } },
      },
    })

    await db.auditLog.create({
      data: {
        actorId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.role,
        action: 'CREATE_PRICE_TRANSACTION',
        targetType: 'PriceTransaction',
        targetId: transaction.id,
        details: JSON.stringify({ itemId: item.id, itemName: item.name, rate: numRate, quantity: numQty, grossAmount }),
      },
    })

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create price transaction' },
      { status: 500 }
    )
  }
}
