# Inventra Subsystem A — Request Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add department-head approval routing and a "ReadyForPickup" stage to the existing request workflow, without duplicating existing logic.

**Architecture:** Extend the existing `Request` flow (Pending → Approved → Issued). Add `User.isDeptHead`. Introduce an approver-resolver helper used by the approve route. Insert a `ReadyForPickup` status between `Approved` and `Issued`, set via a new `ready` route. The issue route accepts `Approved` or `ReadyForPickup`. Reuse `authorize`, `ApiError`, `createAuditLog`, `db.$transaction`.

**Tech Stack:** Next.js 16 App Router, Prisma + SQLite, Zod, Vitest (added in Phase 0).

This plan is Subsystem A of 4 (spec: `docs/superpowers/specs/2026-06-09-inventra-gaps-design.md`). B, C, D get their own plans after A ships.

---

## Phase 0 — Project setup (one-time, shared by B/C/D too)

### Task 0.1: Initialize an isolated git repo in source/

> ⚠️ Confirm with the user before running — earlier the parent repo was deliberately removed. This re-inits git INSIDE `source/` only (not the parent), so the three projects stay un-mixed.

**Files:** Create `source/.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.next/
out/
dist/
coverage/
*.log
prisma/dev.db
prisma/dev.db.*
.env
.git_combined_backup/
```

- [ ] **Step 2: Init + first commit**

```bash
cd source
git init
git add -A
git commit -m "chore: baseline Inventra (post bug-fix) before subsystem build"
```
Expected: a repo with one commit, `node_modules`/`.env`/`dev.db` ignored.

### Task 0.2: Add Vitest test runner

**Files:** Modify `source/package.json`; Create `source/vitest.config.ts`

- [ ] **Step 1: Install Vitest**

```bash
cd source && npm i -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: Add test script to package.json**

In `scripts`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

- [ ] **Step 4: Verify runner works**

Run: `npx vitest run`
Expected: "No test files found" (exit 0) — runner is wired.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

## Phase A1 — Approver resolver + dept-head field

### Task A1.1: Add `isDeptHead` to User (schema + migration)

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Add field to User model**

In `model User`, after `role`:
```prisma
  isDeptHead Boolean  @default(false)
```

- [ ] **Step 2: Create migration**

```bash
cd source && DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name add_user_isdepthead
```
Expected: migration created + applied; Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add User.isDeptHead"
```

### Task A1.2: Approver-resolver helper (TDD)

**Files:** Create `src/lib/approval.ts`; Test `src/lib/approval.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { canApproveRequest } from './approval'

const admin = { id: 'a', role: 'admin', department: 'IT', isDeptHead: false }
const itHead = { id: 'h', role: 'employee', department: 'IT', isDeptHead: true }
const itStaff = { id: 's', role: 'employee', department: 'IT', isDeptHead: false }
const hrHead = { id: 'x', role: 'employee', department: 'HR', isDeptHead: true }

describe('canApproveRequest', () => {
  it('admin can approve any department', () => {
    expect(canApproveRequest(admin, 'HR')).toBe(true)
  })
  it('dept head can approve own department', () => {
    expect(canApproveRequest(itHead, 'IT')).toBe(true)
  })
  it('dept head cannot approve another department', () => {
    expect(canApproveRequest(hrHead, 'IT')).toBe(false)
  })
  it('ordinary employee cannot approve', () => {
    expect(canApproveRequest(itStaff, 'IT')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/approval.test.ts`
Expected: FAIL — `canApproveRequest` is not defined.

- [ ] **Step 3: Implement the helper**

```ts
export interface Approver {
  id: string
  role: string
  department: string
  isDeptHead: boolean
}

/** True if `user` may approve a request belonging to `requestDepartment`. */
export function canApproveRequest(user: Approver, requestDepartment: string): boolean {
  if (user.role === 'admin') return true
  return user.isDeptHead && user.department === requestDepartment
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/approval.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/approval.ts src/lib/approval.test.ts
git commit -m "feat(approval): add canApproveRequest resolver"
```

---

## Phase A2 — Wire resolver into approve route

### Task A2.1: Use resolver in approve route

**Files:** Modify `src/app/api/requests/[id]/approve/route.ts`

Context: the route currently authorizes with `authorize(request, ['admin'])`. Replace the admin-only gate with: authenticate (any role), load the request, then `canApproveRequest`. The auth helper `getAuthUser` returns the JWT payload (id, role, department); `isDeptHead` is NOT in the JWT, so re-read the user from the DB inside the transaction.

- [ ] **Step 1: Replace the authorization block**

Current (top of `PATCH`):
```ts
const auth = await authorize(request, ['admin']);
if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
const { id } = await params;
```
Replace with:
```ts
const auth = await authorize(request); // any authenticated user; fine-grained check below
if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
const { id } = await params;
```

- [ ] **Step 2: Add the dept-head check inside the transaction, after loading the request**

Add a static import at the top of the file:
```ts
import { canApproveRequest } from '@/lib/approval';
```
Find where the request is loaded (`const req = await tx.request.findUnique(...)` and its status check). Immediately after confirming the request exists, add:
```ts
const approver = await tx.user.findUnique({ where: { id: auth.user!.id } });
if (!approver) throw new ApiError(401, 'Unknown user', 'UNAUTHORIZED');
if (!canApproveRequest(
  { id: approver.id, role: approver.role, department: approver.department, isDeptHead: approver.isDeptHead },
  req.department
)) {
  throw new ApiError(403, 'You can only approve requests for your department', 'FORBIDDEN');
}
```

- [ ] **Step 3: Manual verification (no DB unit test for the route here)**

Run dev server (`DATABASE_URL="file:./prisma/dev.db" npm run dev`), log in as `nitintailor` (employee, not dept head) → approving a request returns 403. Set a user `isDeptHead=true` in the same department → approval succeeds. Admin always succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/requests/[id]/approve/route.ts
git commit -m "feat(requests): dept-head approval routing"
```

---

## Phase A3 — ReadyForPickup status

### Task A3.1: `ready` route (Approved → ReadyForPickup)

**Files:** Create `src/app/api/requests/[id]/ready/route.ts`

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { canApproveRequest } from '@/lib/approval';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const req = await tx.request.findUnique({ where: { id } });
      if (!req) throw new ApiError(404, 'Request not found', 'NOT_FOUND');
      if (req.status !== 'Approved') {
        throw new ApiError(400, 'Only approved requests can be marked ready', 'BAD_REQUEST');
      }
      const u = await tx.user.findUnique({ where: { id: auth.user!.id } });
      if (!u || !canApproveRequest(
        { id: u.id, role: u.role, department: u.department, isDeptHead: u.isDeptHead },
        req.department,
      )) {
        throw new ApiError(403, 'Not authorized for this department', 'FORBIDDEN');
      }
      return tx.request.update({ where: { id }, data: { status: 'ReadyForPickup' } });
    });

    await createAuditLog({
      action: 'ISSUE_REQUEST', // reuse existing action vocabulary; metadata distinguishes the step
      user: auth.user,
      targetId: id,
      targetName: result.itemName,
      metadata: { step: 'ready_for_pickup', qty: result.qty },
    });

    return NextResponse.json({ request: result });
  } catch (error) {
    return handleApiError(error);
  }
}
```
Note: no new AuditAction enum value is added (avoids a type change); `metadata.step` records the transition. If a dedicated action is preferred later, add `READY_FOR_PICKUP` to `src/lib/audit.ts` in its own task.

- [ ] **Step 2: Manual verification**

Approve a request, then PATCH `/api/requests/<id>/ready` → status becomes `ReadyForPickup`. Calling it on a non-approved request → 400.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/requests/[id]/ready/route.ts
git commit -m "feat(requests): add ReadyForPickup transition"
```

### Task A3.2: Issue route accepts Approved or ReadyForPickup

**Files:** Modify `src/app/api/requests/[id]/issue/route.ts`

- [ ] **Step 1: Loosen the status guard**

Current:
```ts
if (req.status !== 'Approved') {
  throw new ApiError(400, 'Only approved requests can be issued', 'BAD_REQUEST');
}
```
Replace with:
```ts
if (req.status !== 'Approved' && req.status !== 'ReadyForPickup') {
  throw new ApiError(400, 'Only approved or ready-for-pickup requests can be issued', 'BAD_REQUEST');
}
```

- [ ] **Step 2: Manual verification**

Issue from `Approved` → works. Issue from `ReadyForPickup` → works. Issue from `Pending` → 400.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/requests/[id]/issue/route.ts
git commit -m "feat(requests): allow issuing from ReadyForPickup"
```

---

## Phase A4 — Frontend wiring

### Task A4.1: API client + UI for ready + new status

**Files:** Modify `src/lib/api.ts` (requests section); Modify `src/components/views/issuance-view.tsx` (the view that renders request action buttons)

- [ ] **Step 1: Add client method**

In the `requests` object of `lib/api.ts`, add:
```ts
markReady: (id: string) => request<{ request: unknown }>('PATCH', `/api/requests/${id}/ready`),
```
(Use the in-scope `request()` helper, matching the existing DELETE-with-body pattern.)

- [ ] **Step 2: Render a "Mark ready" action for Approved requests**

In the requests/issuance row actions, where status === 'Approved', add a button calling `api.requests.markReady(req.id)` then refresh. Add `ReadyForPickup` to the status-badge map (label "Ready for pickup", a distinct colour). Reuse the existing `statusBadge` helper — extend it, don't duplicate.

- [ ] **Step 3: Manual verification**

In the UI: approve → "Mark ready" appears → click → badge shows "Ready for pickup" → "Issue" still works.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts src/components/views/issuance-view.tsx
git commit -m "feat(ui): mark-ready action + ReadyForPickup badge"
```

---

## Self-Review

- **Spec coverage:** A = dept-head routing (A1–A2) ✅, ReadyForPickup (A3) ✅, UI (A4) ✅. Stock math unchanged (reuses `mutateStock` in issue) ✅.
- **No duplication:** reuses `authorize`, `ApiError`, `createAuditLog`, `request()` helper, `statusBadge`; no new auth/stock/audit engine.
- **Type consistency:** `canApproveRequest(Approver, string)` used identically in approve route and ready route. `Approver` shape matches User fields (id, role, department, isDeptHead).
- **Placeholders:** none — all steps contain real code/commands.
- **Open dependency:** Task 0.1 (git) needs user confirmation before running.

## Out of scope for Plan A
Subsystems B (procurement), C (assets), D (reports/alerts) — each gets its own plan after A is merged.
