/**
 * Canonical PO status values — single source of truth.
 *
 * Every route that reads or writes `purchaseOrder.status` should import
 * from here rather than using string literals.
 */
export const PO_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SENT_TO_SUPPLIER: 'SENT_TO_SUPPLIER',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  FULLY_RECEIVED: 'FULLY_RECEIVED',
  INVOICE_PENDING: 'INVOICE_PENDING',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  ON_HOLD: 'ON_HOLD',
} as const;

export type PoStatus = (typeof PO_STATUS)[keyof typeof PO_STATUS];

const PO_STATUS_ALIASES: Record<string, PoStatus> = {
  DRAFT: PO_STATUS.DRAFT,
  CREATED: PO_STATUS.DRAFT,
  PENDING: PO_STATUS.PENDING_APPROVAL,
  PENDING_APPROVAL: PO_STATUS.PENDING_APPROVAL,
  PENDINGAPPROVAL: PO_STATUS.PENDING_APPROVAL,
  APPROVED: PO_STATUS.APPROVED,
  ISSUED: PO_STATUS.SENT_TO_SUPPLIER,
  SENT: PO_STATUS.SENT_TO_SUPPLIER,
  SENT_TO_SUPPLIER: PO_STATUS.SENT_TO_SUPPLIER,
  SUPPLIER_CONFIRMED: PO_STATUS.SENT_TO_SUPPLIER,
  SUPPLIERCONFIRMED: PO_STATUS.SENT_TO_SUPPLIER,
  PARTIALLY_RECEIVED: PO_STATUS.PARTIALLY_RECEIVED,
  PARTIALLYRECEIVED: PO_STATUS.PARTIALLY_RECEIVED,
  RECEIVED: PO_STATUS.FULLY_RECEIVED,
  FULLY_RECEIVED: PO_STATUS.FULLY_RECEIVED,
  FULLYRECEIVED: PO_STATUS.FULLY_RECEIVED,
  INVOICED: PO_STATUS.INVOICE_PENDING,
  INVOICE_PENDING: PO_STATUS.INVOICE_PENDING,
  INVOICEPENDING: PO_STATUS.INVOICE_PENDING,
  NEEDS_REVIEW: PO_STATUS.NEEDS_REVIEW,
  NEEDSREVIEW: PO_STATUS.NEEDS_REVIEW,
  CLOSED: PO_STATUS.CLOSED,
  REJECTED: PO_STATUS.REJECTED,
  CANCELLED: PO_STATUS.CANCELLED,
  CANCELED: PO_STATUS.CANCELLED,
  ON_HOLD: PO_STATUS.ON_HOLD,
  ONHOLD: PO_STATUS.ON_HOLD,
};

export function normalizePoStatus(status?: string | null): PoStatus | null {
  if (!status) return null;
  const normalized = status.trim().replace(/[\s-]+/g, '_').toUpperCase();
  return PO_STATUS_ALIASES[normalized] ?? PO_STATUS_ALIASES[normalized.replace(/_/g, '')] ?? null;
}

export function isPoApprovableStatus(status?: string | null): boolean {
  const canonical = normalizePoStatus(status);
  return canonical === PO_STATUS.DRAFT || canonical === PO_STATUS.PENDING_APPROVAL;
}

export function isPoApprovedStatus(status?: string | null): boolean {
  return normalizePoStatus(status) === PO_STATUS.APPROVED;
}

/** Statuses that allow goods receipt (GRN). */
export const RECEIVABLE_STATUSES: readonly PoStatus[] = [
  PO_STATUS.APPROVED,
  PO_STATUS.SENT_TO_SUPPLIER,
  PO_STATUS.PARTIALLY_RECEIVED,
  PO_STATUS.INVOICE_PENDING,
] as const;

/** Statuses that allow linking an invoice. */
export const INVOICEABLE_STATUSES: readonly PoStatus[] = [
  PO_STATUS.APPROVED,
  PO_STATUS.SENT_TO_SUPPLIER,
  PO_STATUS.PARTIALLY_RECEIVED,
  PO_STATUS.FULLY_RECEIVED,
  PO_STATUS.INVOICE_PENDING,
] as const;

/** Statuses considered "open" for duplicate/reorder checks. */
export const OPEN_PO_STATUSES: readonly PoStatus[] = [
  PO_STATUS.DRAFT,
  PO_STATUS.PENDING_APPROVAL,
  PO_STATUS.APPROVED,
  PO_STATUS.SENT_TO_SUPPLIER,
] as const;
