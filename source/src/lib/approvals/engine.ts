/**
 * Transactional approval engine (spec: 2026-06-23-approval-engine-design.md §3–4).
 *
 * Thin DB service over the pure `resolveChain` core. The mutating operations take
 * the caller's Prisma transaction client so the approval state changes atomically
 * with the document (SR/PO) status flip in the same `db.$transaction`. Guard
 * violations throw `ApiError`, which the routes' `handleApiError` maps to HTTP.
 *
 * Audit: the engine deliberately does NOT call `createAuditLog` itself. That helper
 * writes via the global `db` connection; invoking it inside an interactive SQLite
 * transaction risks a write-lock deadlock. Instead each mutating op returns the
 * affected `step`, and the calling route writes the audit row after the tx commits
 * (matching the existing approve-route pattern, where audit is fire-and-forget).
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api-utils'
import { resolveChain, type ApprovalContext } from '@/lib/approvals/rules'

type Tx = Prisma.TransactionClient
type InstanceWithSteps = Prisma.ApprovalInstanceGetPayload<{ include: { steps: true } }>

/** Identity of the user acting on a step — `id` blocks self-approval, `role` matches the step. */
export type StepActor = { id: string; role: string; isDeptHead?: boolean }

export type StartApprovalArgs = {
  moduleName: string
  documentType: string
  documentId: string
  createdById: string
  ctx: ApprovalContext
}

export type StepActionArgs = {
  instanceId: string
  user: StepActor
  remarks?: string
}

/** What a mutating op did — returned so the route can audit + flip the document status. */
export type StepResult = {
  instance: InstanceWithSteps
  step: { sequence: number; approverRole: string }
}

/**
 * Load the module's active workflows, resolve the chain for `ctx`, and create the
 * instance. Empty chain → the instance is created already `APPROVED` (no approval
 * required). Otherwise `PENDING_APPROVAL` with one step per resolved approver,
 * re-numbered to a contiguous 1..N sequence so `currentStep` advances cleanly.
 */
export async function startApproval(tx: Tx, args: StartApprovalArgs): Promise<InstanceWithSteps> {
  const { moduleName, documentType, documentId, createdById, ctx } = args

  const workflows = await tx.approvalWorkflow.findMany({ where: { moduleName, active: true } })
  const chain = resolveChain(workflows, ctx)

  if (chain.length === 0) {
    return tx.approvalInstance.create({
      data: { moduleName, documentType, documentId, status: 'APPROVED', currentStep: 1, createdById },
      include: { steps: true },
    })
  }

  return tx.approvalInstance.create({
    data: {
      moduleName,
      documentType,
      documentId,
      status: 'PENDING_APPROVAL',
      currentStep: 1,
      createdById,
      steps: {
        create: chain.map((step, i) => ({
          sequence: i + 1,
          approverRole: step.approverRole,
          status: 'PENDING',
        })),
      },
    },
    include: { steps: true },
  })
}

async function loadPendingInstance(tx: Tx, instanceId: string): Promise<InstanceWithSteps> {
  const instance = await tx.approvalInstance.findUnique({
    where: { id: instanceId },
    include: { steps: true },
  })
  if (!instance) throw new ApiError(404, 'Approval instance not found', 'NOT_FOUND')
  if (instance.status !== 'PENDING_APPROVAL') {
    throw new ApiError(400, 'This document is not pending approval', 'BAD_REQUEST')
  }
  return instance
}

function currentStepOf(instance: InstanceWithSteps) {
  const step = instance.steps.find((s) => s.sequence === instance.currentStep)
  if (!step) throw new ApiError(400, 'No pending step found for this document', 'BAD_REQUEST')
  return step
}

/**
 * Approve the current step. Guards: instance must be pending, the actor cannot be
 * the requester (self-approval), and must hold the step's role. The last step
 * approving rolls the instance up to `APPROVED`; otherwise `currentStep` advances.
 */
export async function approveStep(tx: Tx, { instanceId, user, remarks }: StepActionArgs): Promise<StepResult> {
  const instance = await loadPendingInstance(tx, instanceId)
  if (user.id === instance.createdById) {
    throw new ApiError(403, 'You cannot approve your own request', 'FORBIDDEN')
  }
  const step = currentStepOf(instance)
  const isSuperUser = user.role === 'admin' || user.role === 'STORE_ADMIN' || user.role === 'MANAGEMENT'
  const isRoleMatched = user.role === step.approverRole || (step.approverRole === 'DEPT_HEAD' && (user.role === 'DEPT_HEAD' || !!user.isDeptHead))

  if (!isSuperUser && !isRoleMatched) {
    throw new ApiError(403, `This approval step requires the ${step.approverRole} role`, 'FORBIDDEN')
  }

  await tx.approvalStep.update({
    where: { id: step.id },
    data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date(), remarks: remarks ?? null },
  })

  const isLastStep = instance.currentStep >= instance.steps.length
  const updated = await tx.approvalInstance.update({
    where: { id: instanceId },
    data: isLastStep ? { status: 'APPROVED' } : { currentStep: instance.currentStep + 1 },
    include: { steps: true },
  })

  return { instance: updated, step: { sequence: step.sequence, approverRole: step.approverRole } }
}

/**
 * Reject the current step → the whole instance is `REJECTED`. The actor must hold
 * the step's role; the requester may reject (cancel) their own document.
 */
export async function rejectStep(tx: Tx, { instanceId, user, remarks }: StepActionArgs): Promise<StepResult> {
  const instance = await loadPendingInstance(tx, instanceId)
  const step = currentStepOf(instance)
  
  const isRejectSuperUser = user.role === 'admin' || user.role === 'STORE_ADMIN' || user.role === 'MANAGEMENT'
  const isRejectRoleMatched = user.role === step.approverRole || (step.approverRole === 'DEPT_HEAD' && (user.role === 'DEPT_HEAD' || !!user.isDeptHead))

  if (!isRejectSuperUser && !isRejectRoleMatched) {
    throw new ApiError(403, `This approval step requires the ${step.approverRole} role`, 'FORBIDDEN')
  }

  await tx.approvalStep.update({
    where: { id: step.id },
    data: { status: 'REJECTED', approvedById: user.id, approvedAt: new Date(), remarks: remarks ?? null },
  })

  const updated = await tx.approvalInstance.update({
    where: { id: instanceId },
    data: { status: 'REJECTED' },
    include: { steps: true },
  })

  return { instance: updated, step: { sequence: step.sequence, approverRole: step.approverRole } }
}

/** Latest approval instance for a document (read-only; uses the global client). */
export function getInstanceFor(moduleName: string, documentId: string) {
  return db.approvalInstance.findFirst({
    where: { moduleName, documentId },
    orderBy: { createdAt: 'desc' },
    include: { steps: { orderBy: { sequence: 'asc' } } },
  })
}

/** Ordered steps powering the timeline UI. */
export function getTimeline(instanceId: string) {
  return db.approvalStep.findMany({ where: { instanceId }, orderBy: { sequence: 'asc' } })
}

/** Guard for downstream actions (PO create, issue): is the document fully approved? */
export async function isApproved(moduleName: string, documentId: string): Promise<boolean> {
  const instance = await getInstanceFor(moduleName, documentId)
  return instance?.status === 'APPROVED'
}
