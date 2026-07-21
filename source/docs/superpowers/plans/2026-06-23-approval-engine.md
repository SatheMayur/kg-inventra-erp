# Centralized Approval Engine — Implementation Plan

> Executes spec `docs/superpowers/specs/2026-06-23-approval-engine-design.md`. Read it for full detail; this plan is the build order. Each task: `npm run test` (lib tests stay green) + `npx tsc --noEmit` (only the task's files must be clean — repo has unrelated prior WIP). Commit each task's files individually; **never `git add -A`**. Several target files carry prior WIP (`prisma/schema.prisma`, `prisma/seed*.ts`) — apply edits but expect they can't be cleanly isolated for commit (see notes).

**Stack:** Next.js App Router, Prisma + SQLite, vitest (`src/**/*.test.ts`, `@`→`src`), TS strict.

---

### Task 1 — Pure rules core ✅ DONE (committed)
`src/lib/approvals/rules.ts` + `rules.test.ts` — `resolveChain(workflows, ctx)`, 9 tests green. No further work.

---

### Task 2 — Schema: three new models + db push  ⚠️ touches prior-WIP `schema.prisma` + mutates the DB
**Files:** `prisma/schema.prisma`.
- Add models exactly per spec §2: `ApprovalWorkflow` (`approval_workflows`), `ApprovalInstance` (`approval_instances`), `ApprovalStep` (`approval_instance_steps`) with the `steps`/`instance` relation and indexes.
- Do **not** remove the existing `ApprovalLog` model (legacy; left in place).
- Run `npx prisma db push` then `npx prisma generate`. **Confirm with the user before db push** — the schema file holds their prior WIP and the DB is live.
- Verify: `npx tsc --noEmit` sees the new Prisma client types.
- Commit note: `schema.prisma` is prior WIP; if it can't be isolated, record the additions in a changelog doc (as done for off-catalog) rather than committing the WIP.

---

### Task 3 — `engine.ts` DB service
**Files:** `src/lib/approvals/engine.ts` (+ optional `engine.test.ts` with a faked `tx` for the pure decision points).
Implement (spec §3–4), all transactional, using `resolveChain`:
- `startApproval(tx, { moduleName, documentType, documentId, createdById, ctx })` → loads active workflows for `moduleName`, `resolveChain(ctx)`; empty chain → instance `APPROVED`; else create instance (`PENDING_APPROVAL`, `currentStep:1`) + one `ApprovalStep` per resolved step. Returns the instance.
- `approveStep(tx, { instanceId, userId, userRole, remarks })` — guards: instance must be `PENDING_APPROVAL`; `userId !== instance.createdById` (else throw → 403 self-approval); `userRole === currentStep.approverRole`; step must equal `currentStep`. Mark step `APPROVED` (`approvedById/At/remarks`), advance `currentStep`; last step → instance `APPROVED`. `createAuditLog('APPROVE_STEP', …)`.
- `rejectStep(tx, { instanceId, userId, userRole, remarks })` — current step + instance → `REJECTED`. `createAuditLog('REJECT_STEP', …)`.
- `getInstanceFor(moduleName, documentId)`, `getTimeline(instanceId)`, `isApproved(moduleName, documentId): boolean`.
- Throw plain `Error`s the routes map to `ApiError` (match existing pattern).
- Commit: `feat(approvals): transactional engine (start/approve/reject/isApproved)`.

---

### Task 4 — Seed default workflows (reproduce today's behavior)
**Files:** a small idempotent seeder — prefer a new `prisma/seed-approvals.mjs` (avoids touching prior-WIP `seed.ts`).
- `STORE_REQUISITION`: `ALWAYS → DEPT_HEAD` (seq 1); `AMOUNT_GTE 10000 → ACCOUNTS_USER` (seq 2).
- `PURCHASE_ORDER`: `ALWAYS → STORE_ADMIN` (seq 1); `AMOUNT_GTE <PO_APPROVAL_LIMIT> → ACCOUNTS_USER` (seq 2).
- Upsert by (`moduleName`,`sequence`,`approverRole`) so re-running is safe. Run once after Task 2.
- Commit: `feat(approvals): seed default approval workflows`.

---

### Task 5 — Wire requisition routes to the engine
**Files:** `src/app/api/requests/route.ts` (create), `requests/[id]/approve/route.ts`, `requests/[id]/reject/route.ts`, `requests/[id]/issue/route.ts`.
- Create POST: after creating the request, `startApproval(tx, { moduleName:'STORE_REQUISITION', documentType:'STORE_REQUISITION', documentId: req.id, createdById: userId, ctx: { amount: <sum of line value> } })`. If the instance is immediately `APPROVED` (empty chain), keep current auto-status; else header `UNDER_REVIEW`/`PENDING_APPROVAL`.
- approve/reject: call `approveStep`/`rejectStep`; keep `canApproveRequest` as the **role source** (engine enforces self-approval + sequence; dept routing still applies). On instance `APPROVED`, set request status `Approved` (existing literal). **Preserve the off-catalog promote-on-approve `updateMany`** already in the approve route.
- issue: gate on `isApproved('STORE_REQUISITION', id)` in addition to existing checks.
- ⚠️ `requests/route.ts` and the approve route are already committed (mine) — these are clean to commit. `reject`/`issue` may be prior WIP.
- Commit: `feat(approvals): route store requisitions through the approval engine`.

---

### Task 6 — Wire PO routes
**Files:** `src/app/api/purchase-orders/route.ts` (create), `purchase-orders/[id]/approve/route.ts`.
- create: `startApproval('PURCHASE_ORDER', poId, createdById, { amount: totalAmount })`; block creation where the SR requires approval first (`isApproved`).
- approve: `approveStep`; on instance `APPROVED`, set PO `APPROVED` (+ existing `approvedBy/At`).
- Commit: `feat(approvals): route purchase orders through the approval engine`.

---

### Task 7 — UI: ApprovalTimeline
**Files:** `src/components/approvals/ApprovalTimeline.tsx` (presentational; props = steps array). Wire into `RequestDetailDialog` and the PO detail view; fetch timeline via a small `GET /api/approvals/[instanceId]` or include steps in the request/PO payload.
- Renders `Created ✓ · Manager ✓ · Finance Pending` with name/time/comment per step.
- Commit: `feat(approvals): approval timeline component`.

---

### Task 8 — Workflow admin CRUD (admin-only)
**Files:** `src/app/api/approval-workflows/route.ts` (+ `[id]`), `src/components/views/approval-workflows-view.tsx`, register in `app-shell.tsx` (admin roles only).
- Thin CRUD over `approval_workflows` (module, condition, value, approverRole, sequence, active). `authorize(req, ['admin','STORE_ADMIN','MANAGEMENT'])`.
- Commit: `feat(approvals): admin workflow configuration screen`.

---

## Whole-feature verification
- `npm run test` green (rules + any engine tests + existing 100).
- `npx tsc --noEmit` clean on touched files.
- Manual: requisition with default chain behaves exactly as today; add an `AMOUNT_GTE 10000 → ACCOUNTS_USER` step and confirm a >10k request needs two approvals in order, blocks self-approval, and the timeline renders.

## Notes for the executor
- Behavior must be **unchanged** until an admin configures multi-step chains (seeded chains = today's single approver).
- Respect the prior-WIP commit discipline: commit only files you touch; for entangled prior-WIP files (`schema.prisma`, seeds), record edits in a changelog doc if they can't be isolated.
