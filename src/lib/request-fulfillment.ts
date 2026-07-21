/**
 * Pure fulfillment logic for the multi-line requisition workflow. A Request is a
 * header; each RequestLine carries requestedQty / approvedQty / issuedQty and can
 * be issued in instalments (partial fulfillment). These helpers derive line and
 * header status from those quantities so routes never hand-roll the rollup.
 */
import { SR_STATUS, LINE_STATUS } from './sr-status';

export type LineLike = {
  requestedQty: number
  approvedQty: number
  issuedQty: number
  status: string
  pendingPurchaseQty?: number
}

export type LineStatus = 'Approved' | 'PartiallyIssued' | 'Issued'

/** Status of a single approved line after an issue, from its issued vs approved qty. */
export function lineStatusAfterIssue(approvedQty: number, issuedQty: number): LineStatus {
  if (issuedQty <= 0) return LINE_STATUS.APPROVED as LineStatus
  if (issuedQty >= approvedQty) return LINE_STATUS.ISSUED as LineStatus
  return LINE_STATUS.PARTIALLY_ISSUED as LineStatus
}

/**
 * Derive the header status from its lines. Rejected/Cancelled lines are excluded
 * from the issued/approved totals; if every line is rejected/cancelled the header
 * follows suit (Cancelled wins if any line was cancelled).
 */
export function rollupRequestStatus(lines: LineLike[]): string {
  if (lines.length === 0) return SR_STATUS.PENDING

  const active = lines.filter((l) => l.status !== LINE_STATUS.REJECTED && l.status !== LINE_STATUS.CANCELLED)
  if (active.length === 0) {
    return lines.some((l) => l.status === LINE_STATUS.CANCELLED) ? SR_STATUS.CANCELLED : SR_STATUS.REJECTED
  }

  const totalApproved = active.reduce((s, l) => s + l.approvedQty, 0)
  const totalIssued = active.reduce((s, l) => s + l.issuedQty, 0)
  const hasPendingPurchase = active.some((l) => (l.pendingPurchaseQty ?? 0) > 0)

  if (totalApproved <= 0) return SR_STATUS.PENDING
  if (totalIssued <= 0) return hasPendingPurchase ? SR_STATUS.CONVERTED_TO_PO : SR_STATUS.APPROVED
  if (totalIssued >= totalApproved) return SR_STATUS.ISSUED
  return SR_STATUS.PARTIALLY_ISSUED
}

/**
 * Guard an issue against a line: qty must be a positive integer and must not
 * exceed the unissued approved balance. Throws a plain Error the caller maps to
 * an ApiError (kept dependency-free so it stays unit-testable).
 */
export function assertIssuable(approvedQty: number, issuedQty: number, qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Issue quantity must be a positive integer')
  }
  if (issuedQty + qty > approvedQty) {
    throw new Error(
      `Cannot issue ${qty}: only ${approvedQty - issuedQty} approved and unissued`
    )
  }
}

export type FlatLine = { itemId: string; itemName: string; requestedQty: number }

/**
 * Transitional response adapter. The DB model is fully split (Request header +
 * RequestLine), but the current UI tree still reads flat `itemName/itemId/qty`.
 * This derives those from the lines so routes can keep the existing UI working
 * while the multi-line UI is built. Remove once the UI consumes `lines` directly.
 */
export function flattenRequest<T extends { lines?: FlatLine[] }>(
  req: T
): T & { itemId: string; itemName: string; qty: number } {
  const lines = req.lines ?? []
  const first = lines[0]
  return {
    ...req,
    itemId: first?.itemId ?? '',
    itemName: first
      ? lines.length > 1
        ? `${first.itemName} +${lines.length - 1} more`
        : first.itemName
      : '',
    qty: lines.reduce((s, l) => s + l.requestedQty, 0),
  }
}

export const FULFILLMENT_STATUS = {
  PENDING_CHECK: 'PENDING_CHECK',
  PARTIALLY_AVAILABLE: 'PARTIALLY_AVAILABLE',
  PURCHASE_REQUIRED: 'PURCHASE_REQUIRED',
  WAITING_FOR_STOCK: 'WAITING_FOR_STOCK',
  READY_FOR_ISSUE: 'READY_FOR_ISSUE',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const

export type NextActionTone = 'default' | 'warning' | 'success' | 'muted'
export type RequestNextAction = {
  label: string
  owner: string
  detail: string
  tone: NextActionTone
}

export type NextActionLine = {
  requestedQty: number
  approvedQty?: number
  issuedQty?: number
  availableQty?: number
  pendingPurchaseQty?: number
  status?: string
}

export type NextActionRequest = {
  status: string
  department?: string | null
  lines?: NextActionLine[]
}

function normalizeWorkflowStatus(status: string) {
  return status.toUpperCase().replace(/[\s_]+/g, '')
}

function reservedReadyQty(line: NextActionLine) {
  return Math.max(0, (line.availableQty ?? 0) - (line.issuedQty ?? 0))
}

export function getRequestNextAction(request: NextActionRequest): RequestNextAction {
  const status = normalizeWorkflowStatus(request.status)
  const lines = request.lines ?? []
  const readyQty = lines.reduce((sum, line) => sum + reservedReadyQty(line), 0)
  const pendingPurchaseQty = lines.reduce((sum, line) => sum + Math.max(0, line.pendingPurchaseQty ?? 0), 0)
  const approvedQty = lines.reduce((sum, line) => sum + Math.max(0, line.approvedQty ?? 0), 0)
  const issuedQty = lines.reduce((sum, line) => sum + Math.max(0, line.issuedQty ?? 0), 0)

  if (['REJECTED', 'CANCELLED'].includes(status)) {
    return {
      label: status === 'REJECTED' ? 'No Action - Rejected' : 'No Action - Cancelled',
      owner: 'Closed',
      detail: 'This request is no longer active.',
      tone: 'muted',
    }
  }

  if (['ISSUED', 'CLOSED'].includes(status) || (approvedQty > 0 && issuedQty >= approvedQty && pendingPurchaseQty <= 0)) {
    return {
      label: 'Completed',
      owner: 'Closed',
      detail: 'All approved material has been issued.',
      tone: 'success',
    }
  }

  if (['PENDING', 'SUBMITTED', 'PENDINGDEPTAPPROVAL', 'PENDINGDEPARTMENTAPPROVAL', 'UNDERREVIEW'].includes(status)) {
    return {
      label: 'Approve Request',
      owner: request.department ? `Dept. Head (${request.department})` : 'Department Head',
      detail: 'Request is waiting for approval before store or purchase action.',
      tone: 'warning',
    }
  }

  if (pendingPurchaseQty > 0 && readyQty > 0) {
    return {
      label: 'Issue Ready Qty / Track PO Balance',
      owner: 'Store Admin / Operator',
      detail: `${readyQty} item(s) are reserved now; ${pendingPurchaseQty} item(s) are still pending purchase.`,
      tone: 'warning',
    }
  }

  if (pendingPurchaseQty > 0) {
    if (status === 'CONVERTEDTOPO') {
      return {
        label: 'Receive PO Stock',
        owner: 'Store / Purchase',
        detail: `${pendingPurchaseQty} item(s) are waiting for purchase receipt.`,
        tone: 'warning',
      }
    }
    return {
      label: 'Create PO',
      owner: 'Purchase Department',
      detail: `${pendingPurchaseQty} item(s) need purchasing before issue.`,
      tone: 'warning',
    }
  }

  if (readyQty > 0) {
    return {
      label: 'Proceed to Issue',
      owner: 'Store Admin / Operator',
      detail: `${readyQty} item(s) are reserved and ready to issue.`,
      tone: 'success',
    }
  }

  if (['APPROVED', 'PARTIALLYISSUED', 'READYFORPICKUP', 'STOCKAVAILABLE', 'ISSUEPENDING'].includes(status)) {
    return {
      label: 'Verify Reserved Stock',
      owner: 'Store Admin / Operator',
      detail: 'Request is approved, but no reserved quantity is currently ready.',
      tone: 'default',
    }
  }

  return {
    label: 'Review Request',
    owner: 'Store Admin / Operator',
    detail: 'Review the request status and line quantities.',
    tone: 'default',
  }
}

export type FulfillmentLine = {
  requestedQty: number
  approvedQty: number
  issuedQty: number
  availableQty: number
  pendingPurchaseQty: number
  status: string
}

/**
 * Single derived fulfillment label for a requisition line, by priority (spec §2.2).
 * `committedQty` falls back to requestedQty pre-approval so a line classifies against
 * demand before it is approved. `reservedNow = availableQty − issuedQty` is the gate.
 */
export function deriveFulfillmentStatus(line: FulfillmentLine, hasOpenPoForLine: boolean): string {
  if (line.status === LINE_STATUS.CANCELLED || line.status === LINE_STATUS.REJECTED) return FULFILLMENT_STATUS.CANCELLED
  const committedQty = line.approvedQty > 0 ? line.approvedQty : line.requestedQty
  const reservedNow = Math.max(0, line.availableQty - line.issuedQty)
  if (committedQty > 0 && line.issuedQty >= committedQty && line.pendingPurchaseQty <= 0) {
    return FULFILLMENT_STATUS.CLOSED
  }
  if (line.pendingPurchaseQty > 0) {
    if (reservedNow > 0) return FULFILLMENT_STATUS.PARTIALLY_AVAILABLE
    return hasOpenPoForLine ? FULFILLMENT_STATUS.WAITING_FOR_STOCK : FULFILLMENT_STATUS.PURCHASE_REQUIRED
  }
  if (reservedNow > 0) return FULFILLMENT_STATUS.READY_FOR_ISSUE
  return FULFILLMENT_STATUS.PENDING_CHECK
}

/**
 * Guard an issue against a line's reserved-and-ready balance (spec §3.4):
 * qty must be a positive integer not exceeding `availableQty − issuedQty`.
 * Throws a plain Error the caller maps to an ApiError (kept dependency-free).
 */
export function assertReadyToIssue(availableQty: number, issuedQty: number, qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Issue quantity must be a positive integer')
  }
  const reservedNow = Math.max(0, availableQty - issuedQty)
  if (qty > reservedNow) {
    throw new Error(`Cannot issue ${qty}: only ${reservedNow} reserved and ready`)
  }
}

export type AllocatableLine = { id: string; pendingPurchaseQty: number }
export type Allocation = { lineId: string; allocQty: number }

/**
 * Distribute an accepted GRN quantity across requisition lines that still need
 * purchasing (spec §3.3). Lines are consumed in array order — caller sorts FIFO.
 * Each line takes at most its pendingPurchaseQty; any surplus is dropped (the
 * caller leaves it as free stock).
 */
export function allocateReceiptToLines(lines: AllocatableLine[], acceptedQty: number): Allocation[] {
  const allocations: Allocation[] = []
  let remaining = Math.max(0, Math.floor(acceptedQty))
  for (const line of lines) {
    if (remaining <= 0) break
    const pend = Math.max(0, line.pendingPurchaseQty)
    if (pend <= 0) continue
    const allocQty = Math.min(remaining, pend)
    allocations.push({ lineId: line.id, allocQty })
    remaining -= allocQty
  }
  return allocations
}
