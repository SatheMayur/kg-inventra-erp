import type { Prisma } from '@prisma/client'
import { ApiError } from './api-utils'
import { PO_STATUS, isPoApprovableStatus, normalizePoStatus } from './po-status'
import { isSupplierUsableForPo, isValidGstin, normalizeGstin } from './supplier-dedupe'

type Tx = Prisma.TransactionClient

export type PoApprovalSupplier = {
  id?: string | null
  name?: string | null
  active?: boolean | null
  status?: string | null
  gstNumber?: string | null
}

export type PoApprovalLine = {
  itemId?: string | null
  qty: number
  unitPrice: number
  discount?: number | null
  taxRate?: number | null
}

export type PoApprovalCandidate = {
  id: string
  poNumber: string
  status: string
  totalAmount: number
  tax?: number | null
  transportationCost?: number | null
  cgstRate?: number | null
  sgstRate?: number | null
  igstRate?: number | null
  supplier?: PoApprovalSupplier | null
  items: PoApprovalLine[]
}

export type PoCalculatedTotals = {
  lineSubtotal: number
  lineTaxAmount: number
  transportationCost: number
  headerTaxRate: number
  headerTaxAmount: number
  grandTotal: number
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function toCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100)
}

function numeric(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

export function calculatePoApprovalTotals(
  lines: PoApprovalLine[],
  options: {
    tax?: number | null
    transportationCost?: number | null
    cgstRate?: number | null
    sgstRate?: number | null
    igstRate?: number | null
  } = {},
): PoCalculatedTotals {
  const lineSubtotal = lines.reduce((sum, line) => {
    const discount = numeric(line.discount)
    return sum + line.qty * line.unitPrice * (1 - discount / 100)
  }, 0)

  const lineTaxAmount = lines.reduce((sum, line) => {
    const discount = numeric(line.discount)
    const taxable = line.qty * line.unitPrice * (1 - discount / 100)
    return sum + taxable * (numeric(line.taxRate) / 100)
  }, 0)

  const transportationCost = numeric(options.transportationCost)
  const splitGstRate = numeric(options.cgstRate) + numeric(options.sgstRate) + numeric(options.igstRate)
  const headerTaxRate = splitGstRate > 0 ? splitGstRate : numeric(options.tax)
  const headerTaxAmount = (lineSubtotal + transportationCost) * (headerTaxRate / 100)

  return {
    lineSubtotal: roundMoney(lineSubtotal),
    lineTaxAmount: roundMoney(lineTaxAmount),
    transportationCost: roundMoney(transportationCost),
    headerTaxRate,
    headerTaxAmount: roundMoney(headerTaxAmount),
    grandTotal: roundMoney(lineSubtotal + lineTaxAmount + transportationCost + headerTaxAmount),
  }
}

export function validatePoForApproval(po: PoApprovalCandidate) {
  const canonicalStatus = normalizePoStatus(po.status)

  if (!isPoApprovableStatus(po.status)) {
    if (canonicalStatus === PO_STATUS.APPROVED) {
      throw new ApiError(409, 'Purchase Order is already approved', 'ALREADY_APPROVED')
    }
    throw new ApiError(400, `This Purchase Order cannot be approved from status ${po.status}`, 'BAD_REQUEST')
  }

  if (!po.supplier) {
    throw new ApiError(400, 'Supplier information is missing for this Purchase Order', 'BAD_REQUEST')
  }

  if (!po.supplier.name?.trim()) {
    throw new ApiError(400, 'Supplier name is required before Purchase Order approval', 'BAD_REQUEST')
  }

  if (!isSupplierUsableForPo(po.supplier)) {
    throw new ApiError(400, 'Supplier is inactive or blocked and cannot be used for Purchase Order approval', 'BAD_REQUEST')
  }

  const gstin = normalizeGstin(po.supplier.gstNumber)
  if (gstin && !isValidGstin(gstin)) {
    throw new ApiError(400, 'Supplier GSTIN is invalid. Correct the supplier master before approval.', 'BAD_REQUEST')
  }

  if (!po.items.length) {
    throw new ApiError(400, 'Purchase Order must contain at least one line item before approval', 'BAD_REQUEST')
  }

  for (const line of po.items) {
    if (!line.itemId) {
      throw new ApiError(400, 'Every Purchase Order line must reference a valid item', 'BAD_REQUEST')
    }
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new ApiError(400, 'Every Purchase Order line must have quantity greater than zero', 'BAD_REQUEST')
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new ApiError(400, 'Every Purchase Order line must have a valid non-negative unit price', 'BAD_REQUEST')
    }
    if (numeric(line.discount) < 0 || numeric(line.discount) > 100) {
      throw new ApiError(400, 'Purchase Order line discount must be between 0 and 100', 'BAD_REQUEST')
    }
    if (numeric(line.taxRate) < 0 || numeric(line.taxRate) > 100) {
      throw new ApiError(400, 'Purchase Order line tax rate must be between 0 and 100', 'BAD_REQUEST')
    }
  }

  const totals = calculatePoApprovalTotals(po.items, {
    tax: po.tax,
    transportationCost: po.transportationCost,
    cgstRate: po.cgstRate,
    sgstRate: po.sgstRate,
    igstRate: po.igstRate,
  })
  const deltaCents = Math.abs(toCents(po.totalAmount) - toCents(totals.grandTotal))
  if (deltaCents > 1) {
    throw new ApiError(
      400,
      `Purchase Order total does not match its line totals. Expected ${totals.grandTotal.toFixed(2)}, found ${roundMoney(po.totalAmount).toFixed(2)}.`,
      'BAD_REQUEST',
    )
  }

  return { canonicalStatus, totals }
}

export async function resolvePoCreatorId(
  tx: Tx,
  po: { id: string; createdBy?: string | null },
  fallbackUserId: string,
) {
  const submitLog = await tx.approvalLog.findFirst({
    where: { poId: po.id, action: 'SUBMIT', userId: { not: '' } },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  })
  if (submitLog?.userId) return submitLog.userId

  const createdBy = po.createdBy?.trim()
  if (createdBy) {
    const creator = await tx.user.findFirst({
      where: {
        OR: [
          { id: createdBy },
          { empId: createdBy },
          { name: createdBy },
        ],
      },
      select: { id: true },
    })
    if (creator?.id) return creator.id
  }

  return fallbackUserId
}

export function canFinalizePoWithoutWorkflow(role: string) {
  return role === 'admin' || role === 'STORE_ADMIN' || role === 'PURCHASE_USER' || role === 'MANAGEMENT'
}
