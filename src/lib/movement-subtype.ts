/**
 * Ledger movement subtypes — classify every stock Transaction beyond the coarse
 * IN/OUT direction so department/machine consumption, purchase inward, transfer
 * and return reports can be told apart. Persisted in `Transaction.subType`.
 *
 * IN-direction:  OPENING | PURCHASE | TRANSFER_IN | RETURN | ADJUST(+)
 * OUT-direction: ISSUE | TRANSFER_OUT | ADJUST(-)
 */
export const MOVEMENT_SUBTYPES = [
  'OPENING',
  'PURCHASE',
  'TRANSFER_IN',
  'ISSUE',
  'TRANSFER_OUT',
  'RETURN',
  'ADJUST',
] as const

export type MovementSubType = (typeof MOVEMENT_SUBTYPES)[number]

/**
 * Resolve the subtype to store on a ledger row. Defaults to ADJUST when a caller
 * does not specify one, and throws on an unknown value so a caller typo surfaces
 * immediately instead of writing a junk classification into the ledger.
 */
export function resolveSubType(subType: MovementSubType | undefined): MovementSubType {
  if (subType === undefined) return 'ADJUST'
  if (!MOVEMENT_SUBTYPES.includes(subType)) {
    throw new Error(`Unknown ledger movement subtype: ${subType}`)
  }
  return subType
}
