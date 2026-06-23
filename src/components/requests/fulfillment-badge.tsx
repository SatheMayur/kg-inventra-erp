import { Badge } from '@/components/ui/badge'

// reservedNow drives issuability regardless of the summary label.
export function reservedNow(line: { availableQty?: number; issuedQty?: number }) {
  return Math.max(0, (line.availableQty ?? 0) - (line.issuedQty ?? 0))
}

const LABELS: Record<string, string> = {
  READY_FOR_ISSUE: 'Ready for Issue',
  WAITING_FOR_STOCK: 'Waiting for Stock',
  PARTIALLY_AVAILABLE: 'Partially Available',
  PURCHASE_REQUIRED: 'Purchase Required',
  PENDING_CHECK: 'Pending Check',
  CLOSED: 'Completed',
  CANCELLED: 'Cancelled',
  // legacy aliases
  AVAILABLE: 'Ready for Issue',
  FULFILLED: 'Completed',
}

export function FulfillmentBadge({ status }: { status?: string }) {
  const s = status ?? 'PENDING_CHECK'
  return <Badge variant="outline">{LABELS[s] ?? s}</Badge>
}
