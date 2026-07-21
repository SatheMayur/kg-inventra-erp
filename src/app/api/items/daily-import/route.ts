import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import {
  ITEM_NATURE,
  ITEM_PRICING_MODE,
  ITEM_PRICING_MODES,
  ITEM_PROCUREMENT_TYPE,
  ITEM_SOURCE_CHANNEL,
  canImportDailyItems,
  ensureDefaultDailyCategories,
  ensureItemCategories,
  findItemDuplicateMatches,
  normalizeItemName,
  validateUnitConversion,
} from '@/lib/item-master'
import { assertSpreadsheetSize } from '@/lib/upload-limits'

type ImportStatus =
  | 'VALID'
  | 'IMPORTED'
  | 'DUPLICATE'
  | 'POSSIBLE_MATCH'
  | 'MISSING_UNIT'
  | 'INVALID_CATEGORY'
  | 'INVALID_CONVERSION'
  | 'VENDOR_NOT_FOUND'
  | 'IMPORT_FAILED'

type RawRow = Record<string, unknown>

type ValidatedImportRow = {
  rowNumber: number
  status: ImportStatus
  message: string
  matches: Awaited<ReturnType<typeof findItemDuplicateMatches>>
  input: {
    name: string
    itemCode: string | null
    category: string
    baseUnit: string
    purchaseUnit: string
    consumptionUnit: string
    unitConversion: number
    pricingMode: string
    perishable: boolean
    preferredSupplierId: string | null
    preferredVendor: string | null
    storageCondition: string | null
    minStock: number
  }
  itemId: string | null
}

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  itemname: 'name',
  item: 'name',
  itemcode: 'itemCode',
  code: 'itemCode',
  sku: 'itemCode',
  category: 'category',
  baseunit: 'baseUnit',
  unit: 'baseUnit',
  purchaseunit: 'purchaseUnit',
  consumptionunit: 'consumptionUnit',
  unitconversion: 'unitConversion',
  conversion: 'unitConversion',
  pricingmode: 'pricingMode',
  perishable: 'perishable',
  preferredvendor: 'preferredVendor',
  preferredsupplier: 'preferredVendor',
  storagecondition: 'storageCondition',
  minstock: 'minStock',
  minimumstock: 'minStock',
}

function normaliseHeader(value: string) {
  return String(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function cleanText(value: unknown) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function parseNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function parseBoolean(value: unknown) {
  const text = cleanText(value).toLowerCase()
  if (!text) return false
  return ['true', 'yes', 'y', '1', 'perishable'].includes(text)
}

async function parseUploadedRows(request: NextRequest): Promise<{ rows: RawRow[]; commit: boolean; fileName?: string }> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      throw new ApiError(400, 'No import file uploaded', 'BAD_REQUEST')
    }
    assertSpreadsheetSize(file)
    const commit = formData.get('commit') === 'true'
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as RawRow[]
    return { rows, commit, fileName: file.name }
  }

  const body = await request.json()
  return {
    rows: Array.isArray(body?.rows) ? body.rows : [],
    commit: body?.commit === true,
    fileName: typeof body?.fileName === 'string' ? body.fileName : undefined,
  }
}

function mapRow(raw: RawRow) {
  const mapped: RawRow = {}
  for (const [key, value] of Object.entries(raw)) {
    const canonical = COLUMN_MAP[normaliseHeader(key)]
    if (canonical) mapped[canonical] = value
  }
  return mapped
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!canImportDailyItems(auth.user?.role)) {
      return NextResponse.json({ error: 'You do not have permission to import Daily Procurement items' }, { status: 403 })
    }

    const { rows, commit, fileName } = await parseUploadedRows(request)
    if (rows.length === 0) {
      throw new ApiError(400, 'Import file has no data rows', 'BAD_REQUEST')
    }

    const results = await db.$transaction(async (tx) => {
      await ensureDefaultDailyCategories(tx)
      const [categories, suppliers] = await Promise.all([
        tx.itemCategory.findMany({ where: { active: true }, select: { name: true } }),
        tx.supplier.findMany({
          where: { active: true, status: { not: 'BLOCKED' } },
          select: { id: true, name: true, phone: true, email: true },
        }),
      ])

      const categoryByKey = new Map(categories.map((category) => [normalizeItemName(category.name), category.name]))
      const supplierByKey = new Map<string, string>()
      for (const supplier of suppliers) {
        supplierByKey.set(normalizeItemName(supplier.name), supplier.id)
        if (supplier.phone) supplierByKey.set(normalizeItemName(supplier.phone), supplier.id)
        if (supplier.email) supplierByKey.set(normalizeItemName(supplier.email), supplier.id)
      }

      const validatedRows: ValidatedImportRow[] = []
      const seenNameCategory = new Set<string>()
      const seenItemCodes = new Set<string>()
      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2
        const mapped = mapRow(rows[i])
        const name = cleanText(mapped.name)
        const categoryText = cleanText(mapped.category)
        const baseUnit = cleanText(mapped.baseUnit)
        const purchaseUnit = cleanText(mapped.purchaseUnit) || baseUnit
        const consumptionUnit = cleanText(mapped.consumptionUnit) || baseUnit
        const unitConversion = parseNumber(mapped.unitConversion) ?? 1
        const minStock = parseNumber(mapped.minStock) ?? 0
        const perishable = parseBoolean(mapped.perishable)
        const preferredVendor = cleanText(mapped.preferredVendor)
        const itemCode = cleanText(mapped.itemCode)
        const pricingModeRaw = cleanText(mapped.pricingMode).toUpperCase()
        const pricingMode = ITEM_PRICING_MODES.includes(pricingModeRaw as any)
          ? pricingModeRaw
          : ITEM_PRICING_MODE.DAILY_MARKET_RATE

        let status: ImportStatus = 'VALID'
        let message = ''
        let category = categoryByKey.get(normalizeItemName(categoryText)) || ''
        let preferredSupplierId: string | null = null
        const matches = name ? await findItemDuplicateMatches(tx, { name, category: categoryText }) : []
        const duplicateKey = `${normalizeItemName(name)}|${normalizeItemName(categoryText)}`

        if (!name) {
          status = 'IMPORT_FAILED'
          message = 'Item name is required'
        } else if (!baseUnit) {
          status = 'MISSING_UNIT'
          message = 'Base unit is required'
        } else if (!category) {
          status = 'INVALID_CATEGORY'
          message = `Category "${categoryText || '-'}" is not in Item Category Master`
        } else {
          const conversionError = validateUnitConversion({ baseUnit, purchaseUnit, consumptionUnit, unitConversion })
          if (conversionError || !Number.isFinite(unitConversion) || unitConversion <= 0) {
            status = 'INVALID_CONVERSION'
            message = conversionError || 'Unit conversion must be greater than zero'
          }
        }

        if (status === 'VALID' && preferredVendor) {
          preferredSupplierId = supplierByKey.get(normalizeItemName(preferredVendor)) || null
          if (!preferredSupplierId) {
            status = 'VENDOR_NOT_FOUND'
            message = `Preferred vendor "${preferredVendor}" was not found`
          }
        }

        if (status === 'VALID' && matches.length > 0) {
          const exact = matches.find((match) => match.matchType === 'EXACT_NAME' && match.active)
          status = exact ? 'DUPLICATE' : 'POSSIBLE_MATCH'
          message = exact ? 'Active duplicate item exists' : 'Possible matching item exists'
        }
        if (status === 'VALID' && seenNameCategory.has(duplicateKey)) {
          status = 'DUPLICATE'
          message = 'Duplicate item row in this import file'
        }
        if (status === 'VALID' && itemCode) {
          if (seenItemCodes.has(normalizeItemName(itemCode))) {
            status = 'DUPLICATE'
            message = 'Duplicate item code row in this import file'
          } else {
            const existingCode = await tx.item.findUnique({ where: { itemCode } })
            if (existingCode) {
              status = 'DUPLICATE'
              message = `Item code already used by "${existingCode.name}"`
            }
          }
        }
        if (status === 'VALID') {
          seenNameCategory.add(duplicateKey)
          if (itemCode) seenItemCodes.add(normalizeItemName(itemCode))
        }

        validatedRows.push({
          rowNumber,
          status,
          message,
          matches,
          input: {
            name,
            itemCode: itemCode || null,
            category,
            baseUnit,
            purchaseUnit,
            consumptionUnit,
            unitConversion,
            pricingMode,
            perishable,
            preferredSupplierId,
            preferredVendor: preferredVendor || null,
            storageCondition: cleanText(mapped.storageCondition) || null,
            minStock: Number.isFinite(minStock) && minStock >= 0 ? Math.round(minStock) : 0,
          },
          itemId: null as string | null,
        })
      }

      const hasInvalidRows = validatedRows.some((row) => row.status !== 'VALID')
      if (!commit || hasInvalidRows) return { rows: validatedRows, imported: [] as any[] }

      await ensureItemCategories(
        tx,
        validatedRows.map((row) => ({ name: row.input.category, procurementType: ITEM_PROCUREMENT_TYPE.DAILY })),
      )

      const imported: any[] = []
      for (const row of validatedRows) {
        const item = await tx.item.create({
          data: {
            name: row.input.name,
            itemCode: row.input.itemCode || null,
            category: row.input.category,
            unit: row.input.baseUnit,
            stock: 0,
            minStock: row.input.minStock,
            reservedQty: 0,
            preferredSupplierId: row.input.preferredSupplierId,
            procurementType: ITEM_PROCUREMENT_TYPE.DAILY,
            pricingMode: row.input.pricingMode,
            itemNature: row.input.perishable ? ITEM_NATURE.PERISHABLE : ITEM_NATURE.NON_PERISHABLE,
            baseUnit: row.input.baseUnit,
            purchaseUnit: row.input.purchaseUnit,
            consumptionUnit: row.input.consumptionUnit,
            unitConversion: row.input.unitConversion,
            perishable: row.input.perishable,
            storageCondition: row.input.storageCondition,
            dailyProcurementEligible: true,
            requiresMasterReview: auth.user?.role === 'admin' || auth.user?.role === 'STORE_ADMIN' ? false : true,
            active: true,
            sourceChannel: ITEM_SOURCE_CHANNEL.DAILY_PROCUREMENT_IMPORT,
            version: 1,
          },
        })
        row.status = 'IMPORTED'
        row.itemId = item.id
        imported.push(item)
      }

      return { rows: validatedRows, imported }
    })

    if (commit && results.rows.some((row) => row.status !== 'IMPORTED')) {
      return NextResponse.json(
        {
          error: 'Import contains invalid, duplicate, or possible-match rows. No items were imported.',
          rows: results.rows,
          importedCount: 0,
        },
        { status: 400 },
      )
    }

    if (commit) {
      await createAuditLog({
        action: 'DAILY_ITEM_IMPORT' as any,
        user: auth.user,
        metadata: { imported: results.imported.length, fileName: fileName ?? null },
      })
    }

    return NextResponse.json({
      rows: results.rows,
      importedCount: results.imported.length,
      items: results.imported,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
