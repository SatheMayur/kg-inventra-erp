export interface ThreeWayInput {
  orderedQty: number      // sum of PO line quantities
  receivedQty: number     // sum of received quantities (GRN)
  orderedAmount: number   // PO total
  invoicedAmount: number  // vendor invoice total
  /** Allowed fractional variance on amount (default 1%). */
  tolerance?: number
}

export interface MatchResult {
  matched: boolean
  discrepancies: string[]
}

/**
 * 3-way match: PO ↔ goods receipt ↔ invoice. Returns matched=true only when the
 * received quantity covers what was ordered AND the invoiced amount is within
 * tolerance of the PO amount. Pure — used to gate payment and to surface mismatches.
 */
export function threeWayMatch(input: ThreeWayInput): MatchResult {
  const tolerance = input.tolerance ?? 0.01
  const discrepancies: string[] = []

  if (input.receivedQty < input.orderedQty) {
    discrepancies.push(`Short delivery: received ${input.receivedQty} of ${input.orderedQty} ordered`)
  } else if (input.receivedQty > input.orderedQty) {
    discrepancies.push(`Over delivery: received ${input.receivedQty} vs ${input.orderedQty} ordered`)
  }

  const amountDiff = Math.abs(input.invoicedAmount - input.orderedAmount)
  const allowed = Math.max(input.orderedAmount * tolerance, 0.01)
  if (amountDiff > allowed) {
    discrepancies.push(`Invoice amount ${input.invoicedAmount} differs from PO amount ${input.orderedAmount}`)
  }

  return { matched: discrepancies.length === 0, discrepancies }
}
