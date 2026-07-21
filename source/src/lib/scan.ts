export type ScanItem = {
  id: string
  name: string
  category: string
  unit: string
  stock: number
  reservedQty: number
  minStock: number
  price: number
  deletedAt: Date | string | null
}

export type ScanVariant = {
  id: string
  name: string
  packSize: string
  stock: number
}

export type ScanResult = {
  item: ScanItem
  variant?: ScanVariant
  available: number
}

export type ScanDeps = {
  findItemById: (id: string) => Promise<ScanItem | null>
  findItemByBarcode: (barcode: string) => Promise<ScanItem | null>
  findVariantByBarcode: (
    barcode: string
  ) => Promise<{ variant: ScanVariant; item: ScanItem } | null>
}

export function normalizeScanCode(code: string): string {
  const trimmed = code.trim()
  if (trimmed.toLowerCase().startsWith('storehub:')) {
    return trimmed.slice('storehub:'.length).trim()
  }
  return trimmed
}

function isDeleted(item: ScanItem | null | undefined): item is ScanItem {
  return !!item && item.deletedAt === null
}

export async function resolveScan(
  code: string,
  deps: ScanDeps
): Promise<ScanResult | null> {
  const normalized = normalizeScanCode(code)
  if (!normalized) return null

  const byId = await deps.findItemById(normalized)
  if (isDeleted(byId)) {
    return {
      item: byId,
      available: byId.stock - byId.reservedQty,
    }
  }

  const byBarcode = await deps.findItemByBarcode(normalized)
  if (isDeleted(byBarcode)) {
    return {
      item: byBarcode,
      available: byBarcode.stock - byBarcode.reservedQty,
    }
  }

  const variantMatch = await deps.findVariantByBarcode(normalized)
  if (variantMatch && isDeleted(variantMatch.item)) {
    return {
      item: variantMatch.item,
      variant: variantMatch.variant,
      available: variantMatch.item.stock - variantMatch.item.reservedQty,
    }
  }

  return null
}
