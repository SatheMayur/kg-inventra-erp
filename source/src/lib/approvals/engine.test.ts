import { describe, it, expect, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { startApproval, approveStep, rejectStep } from '@/lib/approvals/engine'

// A minimal faked transaction client exercising only the decision points — no DB.
function makeTx() {
  return {
    approvalWorkflow: { findMany: vi.fn().mockResolvedValue([]) },
    approvalInstance: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'inst1', ...data })),
      findUnique: vi.fn(),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'inst1', ...data, steps: [] })),
    },
    approvalStep: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
    },
  }
}
type FakeTx = ReturnType<typeof makeTx>
const asTx = (tx: FakeTx) => tx as unknown as Prisma.TransactionClient

function pendingInstance(over: Record<string, unknown> = {}) {
  return {
    id: 'inst1',
    moduleName: 'STORE_REQUISITION',
    documentType: 'STORE_REQUISITION',
    documentId: 'd1',
    status: 'PENDING_APPROVAL',
    currentStep: 1,
    createdById: 'creator',
    steps: [
      { id: 'step1', instanceId: 'inst1', sequence: 1, approverRole: 'DEPT_HEAD', status: 'PENDING', approvedById: null, approvedAt: null, remarks: null },
      { id: 'step2', instanceId: 'inst1', sequence: 2, approverRole: 'ACCOUNTS_USER', status: 'PENDING', approvedById: null, approvedAt: null, remarks: null },
    ],
    ...over,
  }
}

describe('startApproval', () => {
  it('empty chain → instance created already APPROVED with no steps', async () => {
    const tx = makeTx()
    tx.approvalWorkflow.findMany.mockResolvedValue([])
    await startApproval(asTx(tx), {
      moduleName: 'X', documentType: 'X', documentId: 'd1', createdById: 'u1', ctx: {},
    })
    const arg = tx.approvalInstance.create.mock.calls[0][0]
    expect(arg.data.status).toBe('APPROVED')
    expect(arg.data.steps).toBeUndefined()
  })

  it('resolved chain → PENDING instance with contiguous 1..N steps', async () => {
    const tx = makeTx()
    tx.approvalWorkflow.findMany.mockResolvedValue([
      { conditionType: 'ALWAYS', approverRole: 'DEPT_HEAD', sequence: 1, active: true },
      { conditionType: 'AMOUNT_GTE', conditionValue: '10000', approverRole: 'ACCOUNTS_USER', sequence: 2, active: true },
    ])
    await startApproval(asTx(tx), {
      moduleName: 'STORE_REQUISITION', documentType: 'STORE_REQUISITION',
      documentId: 'd1', createdById: 'u1', ctx: { amount: 15000 },
    })
    const arg = tx.approvalInstance.create.mock.calls[0][0]
    expect(arg.data.status).toBe('PENDING_APPROVAL')
    const steps = arg.data.steps as { create: Array<Record<string, unknown>> }
    expect(steps.create).toEqual([
      { sequence: 1, approverRole: 'DEPT_HEAD', status: 'PENDING' },
      { sequence: 2, approverRole: 'ACCOUNTS_USER', status: 'PENDING' },
    ])
  })
})

describe('approveStep', () => {
  it('blocks self-approval (403)', async () => {
    const tx = makeTx()
    tx.approvalInstance.findUnique.mockResolvedValue(pendingInstance())
    await expect(
      approveStep(asTx(tx), { instanceId: 'inst1', user: { id: 'creator', role: 'DEPT_HEAD' } }),
    ).rejects.toThrow(/your own/i)
  })

  it('requires the current step role (403)', async () => {
    const tx = makeTx()
    tx.approvalInstance.findUnique.mockResolvedValue(pendingInstance())
    await expect(
      approveStep(asTx(tx), { instanceId: 'inst1', user: { id: 'someone', role: 'ACCOUNTS_USER' } }),
    ).rejects.toThrow(/DEPT_HEAD/)
  })

  it('rejects when the instance is not pending (400)', async () => {
    const tx = makeTx()
    tx.approvalInstance.findUnique.mockResolvedValue(pendingInstance({ status: 'APPROVED' }))
    await expect(
      approveStep(asTx(tx), { instanceId: 'inst1', user: { id: 'head', role: 'DEPT_HEAD' } }),
    ).rejects.toThrow(/not pending/i)
  })

  it('approving a non-final step advances currentStep', async () => {
    const tx = makeTx()
    tx.approvalInstance.findUnique.mockResolvedValue(pendingInstance())
    await approveStep(asTx(tx), { instanceId: 'inst1', user: { id: 'head', role: 'DEPT_HEAD' } })
    expect(tx.approvalStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step1' },
        data: expect.objectContaining({ status: 'APPROVED', approvedById: 'head' }),
      }),
    )
    expect(tx.approvalInstance.update.mock.calls[0][0].data).toEqual({ currentStep: 2 })
  })

  it('approving the final step marks the whole instance APPROVED', async () => {
    const tx = makeTx()
    const single = pendingInstance({ steps: [pendingInstance().steps[0]] })
    tx.approvalInstance.findUnique.mockResolvedValue(single)
    await approveStep(asTx(tx), { instanceId: 'inst1', user: { id: 'head', role: 'DEPT_HEAD' } })
    expect(tx.approvalInstance.update.mock.calls[0][0].data).toEqual({ status: 'APPROVED' })
  })
})

describe('rejectStep', () => {
  it('marks the current step and the instance REJECTED', async () => {
    const tx = makeTx()
    tx.approvalInstance.findUnique.mockResolvedValue(pendingInstance())
    await rejectStep(asTx(tx), {
      instanceId: 'inst1', user: { id: 'head', role: 'DEPT_HEAD' }, remarks: 'no budget',
    })
    expect(tx.approvalStep.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', remarks: 'no budget' }) }),
    )
    expect(tx.approvalInstance.update.mock.calls[0][0].data).toEqual({ status: 'REJECTED' })
  })
})
