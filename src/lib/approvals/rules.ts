/**
 * Pure approval-chain resolution (no DB) — core of the configurable approval
 * engine (spec: docs/superpowers/specs/2026-06-23-approval-engine-design.md §3).
 *
 * Given the workflow rules configured for a module and a document's context
 * (amount / flags), produce the ordered list of approver steps. An empty result
 * means "no approval required" — the caller auto-approves.
 */

export type ApprovalWorkflowRule = {
  conditionType: string // ALWAYS | AMOUNT_LT | AMOUNT_GTE | FLAG_TRUE
  conditionValue?: string | null // numeric threshold (AMOUNT_*) or flag name (FLAG_TRUE)
  approverRole: string // a User.role value
  sequence: number // step order within the chain (1, 2, ...)
  active?: boolean // inactive rules are ignored
}

export type ApprovalContext = {
  amount?: number
  flags?: string[]
}

export type ResolvedStep = { approverRole: string; sequence: number }

function conditionMatches(rule: ApprovalWorkflowRule, ctx: ApprovalContext): boolean {
  switch (rule.conditionType) {
    case 'ALWAYS':
      return true
    case 'AMOUNT_LT':
      return (
        ctx.amount !== undefined &&
        rule.conditionValue != null &&
        ctx.amount < Number(rule.conditionValue)
      )
    case 'AMOUNT_GTE':
      return (
        ctx.amount !== undefined &&
        rule.conditionValue != null &&
        ctx.amount >= Number(rule.conditionValue)
      )
    case 'FLAG_TRUE':
      return !!rule.conditionValue && (ctx.flags ?? []).includes(rule.conditionValue)
    default:
      return false
  }
}

/**
 * Filter the active rules whose condition matches `ctx`, ordered by `sequence`.
 * Returns the chain of approver steps; empty array → auto-approved.
 */
export function resolveChain(
  workflows: ApprovalWorkflowRule[],
  ctx: ApprovalContext,
): ResolvedStep[] {
  return workflows
    .filter((w) => w.active !== false)
    .filter((w) => conditionMatches(w, ctx))
    .sort((a, b) => a.sequence - b.sequence)
    .map((w) => ({ approverRole: w.approverRole, sequence: w.sequence }))
}
