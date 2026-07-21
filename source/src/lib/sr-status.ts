/**
 * Canonical SR (Store Requisition) status values — single source of truth.
 *
 * Standardised to UPPER_CASE to match PO status convention.
 * Every route that reads or writes `request.status` should import from here.
 */
export const SR_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'Pending',              // legacy — kept for backward compat with existing DB rows
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'Approved',            // rollup returns PascalCase; kept consistent
  PARTIALLY_ISSUED: 'PartiallyIssued',
  READY_FOR_PICKUP: 'ReadyForPickup',
  ISSUED: 'Issued',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CONVERTED_TO_PO: 'CONVERTED_TO_PO',

  // Enterprise ERP Statuses
  PENDING_DEPT_APPROVAL: 'Pending Department Approval',
  PENDING_STORE_REVIEW: 'PENDING_STORE_REVIEW',
  STOCK_AVAILABLE: 'STOCK_AVAILABLE',
  ISSUE_PENDING: 'ISSUE_PENDING',
  DEPARTMENT_ACKNOWLEDGED: 'DEPARTMENT_ACKNOWLEDGED',
  COMPLETED: 'COMPLETED',
  PURCHASE_REQUIRED: 'PURCHASE_REQUIRED',
} as const;

export type SrStatus = (typeof SR_STATUS)[keyof typeof SR_STATUS];

/** Statuses that allow approval. */
export const APPROVABLE_STATUSES: readonly string[] = [
  SR_STATUS.PENDING,
  SR_STATUS.SUBMITTED,
  SR_STATUS.UNDER_REVIEW,
  SR_STATUS.PENDING_DEPT_APPROVAL,
] as const;

/** Statuses that allow issuing material. */
export const ISSUABLE_STATUSES: readonly string[] = [
  SR_STATUS.APPROVED,
  SR_STATUS.CONVERTED_TO_PO,
  SR_STATUS.READY_FOR_PICKUP,
  SR_STATUS.PARTIALLY_ISSUED,
  SR_STATUS.STOCK_AVAILABLE,
  SR_STATUS.ISSUE_PENDING,
] as const;

/** Statuses that allow rejection. */
export const REJECTABLE_STATUSES: readonly string[] = [
  SR_STATUS.PENDING,
  SR_STATUS.SUBMITTED,
  SR_STATUS.UNDER_REVIEW,
  SR_STATUS.PENDING_DEPT_APPROVAL,
  SR_STATUS.APPROVED,
  SR_STATUS.PENDING_STORE_REVIEW,
] as const;

/** Statuses that allow cancellation by the requester. */
export const CANCELLABLE_STATUSES: readonly string[] = [
  SR_STATUS.DRAFT,
  SR_STATUS.PENDING,
  SR_STATUS.SUBMITTED,
  SR_STATUS.UNDER_REVIEW,
  SR_STATUS.PENDING_DEPT_APPROVAL,
] as const;

/** Line-level statuses. */
export const LINE_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'Pending',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'Approved',
  PARTIALLY_ISSUED: 'PartiallyIssued',
  ISSUED: 'Issued',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
} as const;
