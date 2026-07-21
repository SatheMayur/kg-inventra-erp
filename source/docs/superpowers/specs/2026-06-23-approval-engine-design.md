# Centralized Approval Engine & Role Permissions — Design

**Date:** 2026-06-23
**Project:** KG Inventra (`Store_KG/source`, Next.js App Router + Prisma/SQLite)
**Scope:** A **reusable, configurable, multi-step approval engine** layered on the existing role/auth/audit infrastructure. **Extend, don't rewrite** — seeded default workflows reproduce today's approval behavior; existing routes consult the engine instead of flipping status directly.

---

## 1. What already exists (do not rebuild)

- **Roles** live on `User.role`: `admin, employee, STORE_ADMIN, STORE_OPERATOR, DEPT_USER, DEPT_HEAD, PURCHASE_USER, ACCOUNTS_USER, MANAGEMENT`. UI gating via `VIEW_CONFIG.roles` in `app-shell.tsx`; route gating via `authorize(req, [roles])`.
- **Requisition approval**: `requests/[id]/approve` + `reject`, dept-head routing via `canApproveRequest`.
- **PO approval**: `purchase-orders/[id]/approve`, status `PENDING_APPROVAL`, `approvedBy/approvedAt`, a `PO_APPROVAL_LIMIT` concept.
- **Audit**: `createAuditLog` + `AuditLog` + `ApprovalLog` models.
- **Status enum** `DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | CANCELLED` on requests/POs.

**Role mapping (spec role → existing `User.role`):** Employee/User → `employee`/`DEPT_USER`; Department Manager → `DEPT_HEAD`; Store Manager → `STORE_ADMIN`; Purchase Team → `PURCHASE_USER`; Finance → `ACCOUNTS_USER`; Admin → `admin`. **No new role system** — reuse these.

**The genuinely new core:** a configurable engine that, per module + document condition (e.g. amount), produces an ordered **chain** of approver roles (e.g. `>10k → DEPT_HEAD then ACCOUNTS_USER`), tracks per-step progress, blocks self-approval and unapproved downstream actions, and renders a timeline — reusable by any module without engine code changes.

---

## 2. Data model (three new tables)

```
// Rule rows. Multiple rows per module define the chain; conditions select which apply.
ApprovalWorkflow  ->  approval_workflows
  id            String   @id @default(cuid())
  moduleName    String   // STORE_REQUISITION | PURCHASE_REQUIREMENT | PURCHASE_ORDER | INVOICE | TRANSFER | STOCK_ADJUSTMENT | ASSET_REQUEST
  conditionType String   // ALWAYS | AMOUNT_LT | AMOUNT_GTE | FLAG_TRUE
  conditionValue String? // numeric threshold (as string) for AMOUNT_*, or a flag name for FLAG_TRUE (e.g. "isAsset")
  approverRole  String    // a User.role value
  sequence      Int       // step order within the chain (1,2,...)
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([moduleName, active])
  @@map("approval_workflows")

// One per document under approval.
ApprovalInstance  ->  approval_instances
  id            String   @id @default(cuid())
  moduleName    String
  documentType  String    // same as moduleName today; kept distinct for future sub-types
  documentId    String    // the SR / PO / etc. id
  status        String   @default("PENDING_APPROVAL") // DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|CANCELLED
  currentStep   Int      @default(1)
  createdById   String    // requester — used to block self-approval
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  steps         ApprovalStep[]
  @@index([moduleName, documentId])
  @@map("approval_instances")

// One per approver in the chain — drives the timeline + records who/when/comment.
ApprovalStep  ->  approval_instance_steps
  id            String   @id @default(cuid())
  instanceId    String
  sequence      Int
  approverRole  String
  status        String   @default("PENDING") // PENDING | APPROVED | REJECTED | SKIPPED
  approvedById  String?
  approvedAt    DateTime?
  remarks       String?
  instance      ApprovalInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  @@index([instanceId])
  @@map("approval_instance_steps")
```

> **Refinement vs the source spec:** the spec listed `approved_by/approved_at/remarks` on `approval_instances`. Multi-approver chains (Manager **+** Finance) and the timeline UI need *per-step* records, so those fields live on `ApprovalStep`; the instance carries the rolled-up `status` + `currentStep`. One `prisma db push`.

---

## 3. The engine — `src/lib/approvals/` (pure core + thin DB service)

- `rules.ts` (pure) — `resolveChain(workflows, ctx): { approverRole, sequence }[]`. `ctx = { amount?: number; flags?: string[] }`. Filters active workflow rows whose `conditionType`/`conditionValue` match `ctx` (ALWAYS always; AMOUNT_LT/GTE compare `ctx.amount`; FLAG_TRUE when `ctx.flags` includes the value), sorts by `sequence`. Empty chain → auto-approved. Unit-testable with no DB.
- `engine.ts` (DB service, transactional) —
  - `startApproval(tx, { moduleName, documentType, documentId, createdById, ctx }) → ApprovalInstance`: loads the module's workflows, `resolveChain`, creates the instance + its steps. If chain empty → instance `APPROVED` immediately; else `PENDING_APPROVAL`, `currentStep = 1`.
  - `approveStep(tx, { instanceId, userId, userRole, remarks }) → ApprovalInstance`: validates (see §4), marks the current step `APPROVED` (records `approvedById/At/remarks`), advances `currentStep`; when the last step approves → instance `APPROVED`. Writes an audit row.
  - `rejectStep(tx, { instanceId, userId, userRole, remarks })`: current step + instance → `REJECTED`. Audit row.
  - `getInstanceFor(moduleName, documentId)` / `getTimeline(instanceId)` — read for guards + UI.
  - `isApproved(moduleName, documentId): boolean` — guard used by downstream actions.

Document status mirrors instance status: when the engine sets `APPROVED`/`REJECTED`, the calling route updates the SR/PO row accordingly (same literals already used).

---

## 4. Validation rules (engine-enforced)

| Rule | Enforcement |
|---|---|
| User approving own request | `approveStep` rejects when `userId === instance.createdById` (403). |
| Approver must hold the step's role | `approveStep` requires `userRole === currentStep.approverRole` (admin does **not** auto-bypass; admin only approves a step if a workflow names `admin`). |
| Creating PO without approval | PO-create calls `isApproved('PURCHASE_REQUIREMENT'/'STORE_REQUISITION', srId)` (or the SR's instance) before allowing creation, where a workflow requires it. |
| Issuing unapproved requisition | Issue route gates on the SR's instance being `APPROVED` (the existing `Approved` status becomes engine-driven). |
| Stock adjustment without permission | Stock-adjust requires role permission **and**, where configured, an `APPROVED` instance via the engine. |
| Out-of-order / already-decided steps | `approveStep`/`rejectStep` no-op-reject if instance is not `PENDING_APPROVAL` or step ≠ `currentStep`. |

---

## 5. Wrapping existing modules (extend, don't rewrite)

Seed default workflows that **reproduce current behavior**, then point the existing routes at the engine:

- `STORE_REQUISITION`: `ALWAYS → DEPT_HEAD` (seq 1). Optional `AMOUNT_GTE 10000 → ACCOUNTS_USER` (seq 2) for the spec's >10k example.
- `PURCHASE_ORDER`: `ALWAYS → STORE_ADMIN` (seq 1); `AMOUNT_GTE <PO_APPROVAL_LIMIT> → ACCOUNTS_USER` (seq 2).

Integration points (design; code in the future plan): `requests` create → `startApproval`; `requests/[id]/approve` and `reject` → `approveStep`/`rejectStep` (replacing the direct status flip, keeping `canApproveRequest` as the role source); PO create → `startApproval`; `purchase-orders/[id]/approve` → `approveStep`. Because seeded chains equal today's single approver, **behavior is unchanged** until an admin adds steps.

---

## 6. Audit

Every `approveStep`/`rejectStep` writes a `createAuditLog` row: `action` (`APPROVE_STEP`/`REJECT_STEP`), actor, `targetId = documentId`, and metadata `{ module, step, approverRole, oldStatus, newStatus, remarks }`. The `ApprovalStep` rows themselves are the durable who/when/comment record powering the timeline.

---

## 7. UI

- **`<ApprovalTimeline instanceId>`** (reusable) — renders each step: `Created ✓ · Manager Approval ✓ · Finance Approval Pending`, with approver name, time, and comment. Dropped into any document detail page.
- **Workflow admin** (admin-only) — a thin CRUD screen over `approval_workflows` (module, condition, approver role, sequence, active) so approvals are configured, never hardcoded.

---

## 8. Configurability & reuse

The engine is generic over `moduleName`/`documentType`. Adding approval to a **new** module (Asset Request, Invoice, Transfer, Stock Adjustment) is: seed workflow rows + one `startApproval` call on create + one `isApproved`/`approveStep` call on the action — **no engine code changes**. This is what makes it behave like enterprise ERP.

---

## 9. Out of scope (this design)

- Building approval into Asset Request / Invoice / Transfer / Stock Adjustment (engine supports them; wiring is later, per-module).
- Replacing the existing role set or UI role-gating.
- External notifications beyond the existing notification/WhatsApp hooks.
- Parallel (non-sequential) approvals and delegation/escalation — sequential chains only in v1.

## 10. Assumptions

- Approver identity comes from the authenticated user; `userRole` is `User.role`.
- The amount/flags `ctx` is supplied by the calling route (e.g. PO `totalAmount`, SR line value, `isAsset`).
- `PO_APPROVAL_LIMIT` is migrated into a workflow row rather than a separate setting.
- Admin views/cancels any instance but only *approves* a step when a workflow names `admin`.
```
