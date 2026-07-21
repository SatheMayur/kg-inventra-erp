export type SupplierIdentity = {
  id?: string | null
  name?: string | null
  gstNumber?: string | null
  phone?: string | null
  contact?: string | null
  email?: string | null
}

export type SupplierDuplicateField =
  | 'name'
  | 'gstNumber'
  | 'panFromGstin'
  | 'phone'
  | 'email'

export type SupplierDuplicateMatch = {
  field: SupplierDuplicateField
  value: string
  supplier: SupplierIdentity
}

export function cleanSupplierText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

export function normalizeSupplierName(value?: string | null): string | null {
  const cleaned = cleanSupplierText(value)
  return cleaned ? cleaned.toLowerCase() : null
}

export function normalizeEmail(value?: string | null): string | null {
  const cleaned = cleanSupplierText(value)
  return cleaned ? cleaned.toLowerCase() : null
}

export function normalizeGstin(value?: string | null): string | null {
  const cleaned = cleanSupplierText(value)
  if (!cleaned) return null
  const compact = cleaned.replace(/[^0-9a-z]/gi, '').toUpperCase()
  return compact.length > 0 ? compact : null
}

export function isValidGstin(value: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)
}

export function panFromGstin(value?: string | null): string | null {
  const gstin = normalizeGstin(value)
  if (!gstin || gstin.length !== 15) return null
  return gstin.slice(2, 12)
}

export function normalizePhoneNumber(value?: string | null): string | null {
  const cleaned = cleanSupplierText(value)
  if (!cleaned) return null
  const digits = cleaned.replace(/\D/g, '')
  if (digits.length < 7) return null
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10)
  return digits
}

function phoneKeys(supplier: SupplierIdentity) {
  return [normalizePhoneNumber(supplier.phone), normalizePhoneNumber(supplier.contact)]
    .filter((value): value is string => Boolean(value))
}

export function collectSupplierDuplicateMatches(
  input: SupplierIdentity,
  suppliers: SupplierIdentity[],
): SupplierDuplicateMatch[] {
  const matches: SupplierDuplicateMatch[] = []
  const inputName = normalizeSupplierName(input.name)
  const inputGstin = normalizeGstin(input.gstNumber)
  const inputPan = panFromGstin(input.gstNumber)
  const inputEmail = normalizeEmail(input.email)
  const inputPhones = phoneKeys(input)

  for (const supplier of suppliers) {
    if (input.id && supplier.id === input.id) continue

    if (inputName && normalizeSupplierName(supplier.name) === inputName) {
      matches.push({ field: 'name', value: input.name!.trim(), supplier })
    }

    const supplierGstin = normalizeGstin(supplier.gstNumber)
    if (inputGstin && supplierGstin === inputGstin) {
      matches.push({ field: 'gstNumber', value: inputGstin, supplier })
    }

    const supplierPan = panFromGstin(supplier.gstNumber)
    if (inputPan && supplierPan === inputPan) {
      matches.push({ field: 'panFromGstin', value: inputPan, supplier })
    }

    const supplierPhones = phoneKeys(supplier)
    const duplicatePhone = inputPhones.find((phone) => supplierPhones.includes(phone))
    if (duplicatePhone) {
      matches.push({ field: 'phone', value: duplicatePhone, supplier })
    }

    if (inputEmail && normalizeEmail(supplier.email) === inputEmail) {
      matches.push({ field: 'email', value: inputEmail, supplier })
    }
  }

  const seen = new Set<string>()
  return matches.filter((match) => {
    const key = `${match.supplier.id ?? match.supplier.name}:${match.field}:${match.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function describeSupplierDuplicateMatch(match: SupplierDuplicateMatch): string {
  const supplierName = match.supplier.name || 'an existing supplier'
  const fieldLabel: Record<SupplierDuplicateField, string> = {
    name: 'name',
    gstNumber: 'GSTIN',
    panFromGstin: 'PAN derived from GSTIN',
    phone: 'phone/contact number',
    email: 'email',
  }
  return `${supplierName} already uses this ${fieldLabel[match.field]} (${match.value})`
}

export function isSupplierUsableForPo(supplier: { active?: boolean | null; status?: string | null }): boolean {
  const status = (supplier.status || 'ACTIVE').toUpperCase()
  return supplier.active !== false && status !== 'INACTIVE' && status !== 'BLOCKED'
}
