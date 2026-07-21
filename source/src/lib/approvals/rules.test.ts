import { describe, it, expect } from 'vitest'
import { resolveChain, type ApprovalWorkflowRule } from '@/lib/approvals/rules'

// Default STORE_REQUISITION chain from the spec: always a dept head, plus finance over 10k.
const srRules: ApprovalWorkflowRule[] = [
  { conditionType: 'ALWAYS', approverRole: 'DEPT_HEAD', sequence: 1 },
  { conditionType: 'AMOUNT_GTE', conditionValue: '10000', approverRole: 'ACCOUNTS_USER', sequence: 2 },
]

describe('resolveChain', () => {
  it('ALWAYS rule is always in the chain', () => {
    expect(resolveChain(srRules, {}).map((s) => s.approverRole)).toEqual(['DEPT_HEAD'])
  })

  it('AMOUNT_GTE adds the step at or above the threshold', () => {
    expect(resolveChain(srRules, { amount: 15000 }).map((s) => s.approverRole)).toEqual([
      'DEPT_HEAD',
      'ACCOUNTS_USER',
    ])
    expect(resolveChain(srRules, { amount: 10000 }).map((s) => s.approverRole)).toEqual([
      'DEPT_HEAD',
      'ACCOUNTS_USER',
    ])
  })

  it('AMOUNT_GTE is excluded below the threshold', () => {
    expect(resolveChain(srRules, { amount: 5000 }).map((s) => s.approverRole)).toEqual(['DEPT_HEAD'])
  })

  it('AMOUNT_LT included only below the threshold', () => {
    const r: ApprovalWorkflowRule[] = [
      { conditionType: 'AMOUNT_LT', conditionValue: '500', approverRole: 'DEPT_USER', sequence: 1 },
    ]
    expect(resolveChain(r, { amount: 100 })).toHaveLength(1)
    expect(resolveChain(r, { amount: 900 })).toHaveLength(0)
  })

  it('FLAG_TRUE included only when the flag is present', () => {
    const r: ApprovalWorkflowRule[] = [
      { conditionType: 'FLAG_TRUE', conditionValue: 'isAsset', approverRole: 'MANAGEMENT', sequence: 3 },
    ]
    expect(resolveChain(r, { flags: ['isAsset'] })).toHaveLength(1)
    expect(resolveChain(r, { flags: [] })).toHaveLength(0)
    expect(resolveChain(r, {})).toHaveLength(0)
  })

  it('inactive rules are excluded', () => {
    const r: ApprovalWorkflowRule[] = [
      { conditionType: 'ALWAYS', approverRole: 'DEPT_HEAD', sequence: 1, active: false },
    ]
    expect(resolveChain(r, {})).toHaveLength(0)
  })

  it('sorts by sequence regardless of input order', () => {
    const r: ApprovalWorkflowRule[] = [
      { conditionType: 'AMOUNT_GTE', conditionValue: '0', approverRole: 'ACCOUNTS_USER', sequence: 2 },
      { conditionType: 'ALWAYS', approverRole: 'DEPT_HEAD', sequence: 1 },
    ]
    expect(resolveChain(r, { amount: 1 }).map((s) => s.sequence)).toEqual([1, 2])
  })

  it('AMOUNT_* rules are excluded when amount is undefined', () => {
    const r: ApprovalWorkflowRule[] = [
      { conditionType: 'AMOUNT_GTE', conditionValue: '10', approverRole: 'X', sequence: 1 },
    ]
    expect(resolveChain(r, {})).toHaveLength(0)
  })

  it('empty chain when nothing matches → caller auto-approves', () => {
    expect(resolveChain([], {})).toEqual([])
  })
})
