import { NextRequest, NextResponse } from 'next/server'
import * as xlsx from 'xlsx'
import { authorize } from '@/lib/auth'
import { db } from '@/lib/db'

type ParsedRow = {
  rowIndex: number
  transactionDate: string
  originalItemText: string
  mappedItemId: string | null
  mappedItemName: string | null
  unitText: string
  categoryText: string
  rate: number
  quantity: number
  lineAmount: number
  gstRate: number
  taxAmount: number
  grossAmount: number
  grossRate: number
  supplierText: string
  matchedSupplierId: string | null
  invoiceNumber: string
  notes: string
  isMapped: boolean
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const user = auth.user!

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const action = (formData.get('action') as string) || 'PREVIEW' // PREVIEW | COMMIT
    const mappingsJson = formData.get('mappings') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No Excel file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true })

    const logSheet = workbook.Sheets['Purchase Log'] || workbook.Sheets[workbook.SheetNames[0]]
    if (!logSheet) {
      return NextResponse.json({ error: 'Purchase Log sheet not found in uploaded workbook' }, { status: 400 })
    }

    const rawData = xlsx.utils.sheet_to_json<unknown[]>(logSheet, { header: 1 })

    // Find header row index containing 'Item Name' or 'Item'
    let headerIdx = -1
    for (let i = 0; i < Math.min(15, rawData.length); i++) {
      const row = rawData[i]
      if (Array.isArray(row) && row.some((cell) => typeof cell === 'string' && (cell.includes('Item Name') || cell.includes('Item')))) {
        headerIdx = i
        break
      }
    }

    if (headerIdx === -1) {
      return NextResponse.json({ error: 'Could not find header row in Purchase Log sheet' }, { status: 400 })
    }

    const logRows = rawData.slice(headerIdx + 1)

    // Load active items, aliases, suppliers, and existing mappings
    const dbItems = await db.item.findMany({ include: { aliases: true } })
    const dbSuppliers = await db.supplier.findMany()
    const existingMappings = await db.priceMapping.findMany()

    const mappingMap = new Map<string, string>()
    existingMappings.forEach((m) => mappingMap.set(m.sourceText.trim().toLowerCase(), m.mappedItemId))

    // Optional manual mappings submitted during COMMIT
    if (mappingsJson) {
      try {
        const customMappings = JSON.parse(mappingsJson) as Record<string, string>
        Object.entries(customMappings).forEach(([srcText, targetItemId]) => {
          if (srcText && targetItemId) mappingMap.set(srcText.trim().toLowerCase(), targetItemId)
        })
      } catch (e) {
        console.error('Failed to parse manual mappings JSON:', e)
      }
    }

    const parsedRows: ParsedRow[] = []
    const unmappedItems = new Set<string>()

    for (let idx = 0; idx < logRows.length; idx++) {
      const row = logRows[idx]
      if (!Array.isArray(row) || !row.length || !row[0]) continue

      // Date parsing (Col A)
      let dateVal: Date = new Date()
      const rawDate = row[0]
      if (rawDate instanceof Date) {
        dateVal = rawDate
      } else if (typeof rawDate === 'string') {
        const parts = rawDate.split('-')
        if (parts.length === 3) {
          // DD-MM-YYYY
          dateVal = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
        } else {
          dateVal = new Date(rawDate)
        }
      }

      if (isNaN(dateVal.getTime())) dateVal = new Date()

      const itemText = String(row[1] || '').trim()
      const unitText = String(row[2] || 'pcs').trim()
      const categoryText = String(row[3] || 'General').trim()
      const rateNum = Number(row[4]) || 0
      const qtyNum = Number(row[5]) || 0
      const amountNum = Number(row[6]) || rateNum * qtyNum
      const supplierText = String(row[7] || '').trim()
      const invoiceNo = String(row[8] || '').trim()
      const notesText = String(row[9] || '').trim()

      if (!itemText || rateNum <= 0 || qtyNum <= 0) continue

      // Resolve Item
      const cleanItemText = itemText.toLowerCase()
      let mappedItemId = mappingMap.get(cleanItemText) || null
      let matchedDbItem = mappedItemId ? dbItems.find((i) => i.id === mappedItemId) : null

      if (!matchedDbItem) {
        matchedDbItem =
          dbItems.find((i) => i.name.trim().toLowerCase() === cleanItemText) ||
          dbItems.find((i) => (i.shortName || '').trim().toLowerCase() === cleanItemText) ||
          dbItems.find((i) => i.aliases.some((a) => a.aliasText.trim().toLowerCase() === cleanItemText)) ||
          dbItems.find((i) => i.name.toLowerCase().includes(cleanItemText) || cleanItemText.includes(i.name.toLowerCase()))

        if (matchedDbItem) {
          mappedItemId = matchedDbItem.id
        }
      }

      if (!mappedItemId) {
        unmappedItems.add(itemText)
      }

      // Resolve Supplier
      let matchedSupplierId: string | null = null
      if (supplierText) {
        const cleanSupplier = supplierText.toLowerCase()
        const sup = dbSuppliers.find((s) => s.name.trim().toLowerCase() === cleanSupplier || s.name.toLowerCase().includes(cleanSupplier))
        if (sup) matchedSupplierId = sup.id
      }

      // Calculate GST where applicable (5% GST for Grocery/Dry items)
      const isGroceryOrSpice = categoryText.toLowerCase().includes('grocery') || categoryText.toLowerCase().includes('dry') || categoryText.toLowerCase().includes('spice')
      const gstRate = isGroceryOrSpice ? 5 : 0
      const taxableAmount = Number((rateNum * qtyNum).toFixed(2))
      const taxAmount = Number(((taxableAmount * gstRate) / 100).toFixed(2))
      const grossAmount = Number((taxableAmount + taxAmount).toFixed(2))
      const grossRate = Number((grossAmount / qtyNum).toFixed(2))

      parsedRows.push({
        rowIndex: idx + 6,
        transactionDate: dateVal.toISOString().split('T')[0],
        originalItemText: itemText,
        mappedItemId,
        mappedItemName: matchedDbItem ? matchedDbItem.name : null,
        unitText,
        categoryText,
        rate: rateNum,
        quantity: qtyNum,
        lineAmount: taxableAmount,
        gstRate,
        taxAmount,
        grossAmount,
        grossRate,
        supplierText,
        matchedSupplierId,
        invoiceNumber: invoiceNo,
        notes: notesText,
        isMapped: Boolean(mappedItemId),
      })
    }

    if (action === 'PREVIEW') {
      return NextResponse.json({
        totalRows: parsedRows.length,
        mappedRows: parsedRows.filter((r) => r.isMapped).length,
        unmappedRowsCount: unmappedItems.size,
        unmappedItems: Array.from(unmappedItems),
        parsedRows,
        availableDbItems: dbItems.map((i) => ({ id: i.id, name: i.name, category: i.category, unit: i.unit })),
      })
    }

    // Action === 'COMMIT'
    const importBatch = await db.priceImportBatch.create({
      data: {
        fileName: file.name,
        totalRows: parsedRows.length,
        importedRows: parsedRows.filter((r) => r.isMapped).length,
        unmappedRows: unmappedItems.size,
        status: unmappedItems.size === 0 ? 'COMPLETED' : 'PARTIALLY_MAPPED',
        uploadedBy: user.name,
      },
    })

    const transactionsToInsert = parsedRows
      .filter((r) => r.mappedItemId)
      .map((r) => ({
        itemId: r.mappedItemId!,
        categoryId: r.categoryText,
        unitId: r.unitText,
        supplierId: r.matchedSupplierId,
        transactionDate: new Date(r.transactionDate),
        rate: r.rate,
        quantity: r.quantity,
        lineAmount: r.lineAmount,
        gstRate: r.gstRate,
        taxAmount: r.taxAmount,
        grossAmount: r.grossAmount,
        grossRate: r.grossRate,
        invoiceNumber: r.invoiceNumber || null,
        notes: r.notes || null,
        sourceType: 'EXCEL_IMPORT',
        originalItemText: r.originalItemText,
        originalSupplierText: r.supplierText || null,
        importBatchId: importBatch.id,
        createdById: user.id,
        createdBy: user.name,
      }))

    if (transactionsToInsert.length > 0) {
      await db.priceTransaction.createMany({
        data: transactionsToInsert,
      })
    }

    return NextResponse.json({
      success: true,
      batchId: importBatch.id,
      importedCount: transactionsToInsert.length,
      unmappedItems: Array.from(unmappedItems),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process Excel import' },
      { status: 500 }
    )
  }
}
