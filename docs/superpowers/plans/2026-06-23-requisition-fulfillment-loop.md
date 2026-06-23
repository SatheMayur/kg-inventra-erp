# Store Requisition Fulfillment & Issuance Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the demand→reservation→procurement→receipt→issue loop in KG Inventra so GRN-received stock auto-reserves to the originating requisition, lines advance to `READY_FOR_ISSUE`, and issuance is gated on reserved-and-ready quantity.

**Architecture:** Extend existing fields only — no schema migration, no new table. All decision logic lives in pure, unit-tested helpers in `src/lib/request-fulfillment.ts` and `src/lib/stock.ts`; the four API routes (`requests` create, `requests/[id]/approve`, `requests/[id]/issue`, `purchase-orders/[id]/receive`) call those helpers inside their existing `db.$transaction` blocks. Reservation is the `Item.reservedQty` aggregate; `RequestLine.availableQty` is the per-line reserved total.

**Tech Stack:** Next.js App Router (route handlers), Prisma + SQLite, vitest (`test: vitest run`, glob `src/**/*.test.ts`, `@`→`src` alias), TypeScript strict.

## Global Constraints

- No new tables, no Prisma migration. New states are new `fulfillmentStatus` string values only. (spec §2, §6)
- Every stock change flows through `mutateStock`; every reservation change through `reserveStock` / `releaseReservation`. (spec §3.1)
- All route writes stay inside the existing `db.$transaction`, role-checked, audit-logged. (spec §3)
- Per-line invariants: `approvedQty = availableQty + pendingPurchaseQty`; `issuedQty <= availableQty`; `reservedNow = availableQty − issuedQty`. (spec §2.1)
- No changes to `mutateStock` internals, the ledger, 3-way match, or PO status transitions. (spec §6)
- Tests co-locate next to source as `*.test.ts`, import via `@/...`, environment `node`.

## Pre-flight notes (read before Task 5)

- **Status-literal casing:** `approve/route.ts` sets the header to `'APPROVED'` (upper) while `issue/route.ts` accepts `['Approved','ReadyForPickup','PartiallyIssued']` (PascalCase) and the issuance view lists `status: 'Approved'`. The normal path is approve → mark-ready → issue. This plan does **not** "fix" that pre-existing casing; instead the receive task re-rolls the SR header via the existing `rollupRequestStatus` helper, which returns PascalCase (`'Approved'`/`'PartiallyIssued'`) — the value the issue gate and issuance view accept — so a request becomes issuable again after GRN. Do not hardcode `'APPROVED'` in new code.
- `deriveFulfillmentStatus` replaces the legacy literals `AVAILABLE` (→`READY_FOR_ISSUE`) and `FULFILLED` (→`CLOSED`). Treat `AVAILABLE`/`FULFILLED` as legacy aliases on read in the UI (Task 8); never write them in new code.

---

### Task 1: `reserveStock` helper

**Files:**
- Modify: `src/lib/stock.ts` (add after `releaseReservation`, ~line 109)
- Test: `src/lib/stock.test.ts` (create)

**Interfaces:**
- Produces: `reserveStock(tx: Prisma.TransactionClient, itemId: string, qty: number): Promise<void>` — atomically increments `Item.reservedQty` by `qty`; no-op for non-positive/non-finite `qty`. Mirror of the existing `releaseReservation`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/stock.test.ts
import { describe, it, expect } from 'vitest'
import { reserveStock } from '@/lib/stock'

function fakeTx() {
  const calls: any[] = []
  const tx = { item: { update: async (args: any) => { calls.push(args); return {} } } } as any
  return { tx, calls }
}

describe('reserveStock', () => {
  it('increments reservedQty by a positive qty', async () => {
    const { tx, calls } = fakeTx()
    await reserveStock(tx, 'item1', 5)
    expect(calls).toEqual([{ where: { id: 'item1' }, data: { reservedQty: { increment: 5 } } }])
  })

  it('is a no-op for zero, negative, or non-finite qty', async () => {
    const { tx, calls } = fakeTx()
    await reserveStock(tx, 'item1', 0)
    await reserveStock(tx, 'item1', -3)
    await reserveStock(tx, 'item1', NaN)
    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/stock.test.ts`
Expected: FAIL — `reserveStock` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/stock.ts` immediately after the `releaseReservation` function (after line 109):

```ts
/**
 * Atomically place a reservation hold on an item. Symmetric to releaseReservation.
 * Used when GRN-received stock is re-earmarked to the originating requisition line.
 */
export async function reserveStock(tx: Tx, itemId: string, qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) return;
  await tx.item.update({
    where: { id: itemId },
    data: { reservedQty: { increment: qty } },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/stock.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stock.ts src/lib/stock.test.ts
git commit -m "feat(stock): add reserveStock helper symmetric to releaseReservation"
```

---

### Task 2: Fulfillment-status constants + `deriveFulfillmentStatus`

**Files:**
- Modify: `src/lib/request-fulfillment.ts` (append)
- Test: `src/lib/request-fulfillment.test.ts` (create)

**Interfaces:**
- Produces:
  - `FULFILLMENT_STATUS` — const map of all literals: `PENDING_CHECK`, `PARTIALLY_AVAILABLE`, `PURCHASE_REQUIRED`, `WAITING_FOR_STOCK`, `READY_FOR_ISSUE`, `CLOSED`, `CANCELLED`.
  - `type FulfillmentLine = { requestedQty; approvedQty; issuedQty; availableQty; pendingPurchaseQty; status }` (all `number` except `status: string`).
  - `deriveFulfillmentStatus(line: FulfillmentLine, hasOpenPoForLine: boolean): string` — single derived label by priority (spec §2.2). Uses `committedQty = approvedQty>0 ? approvedQty : requestedQty` so pre-approval lines classify against requested qty.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/request-fulfillment.test.ts
import { describe, it, expect } from 'vitest'
import { deriveFulfillmentStatus, FULFILLMENT_STATUS } from '@/lib/request-fulfillment'

const base = { requestedQty: 10, approvedQty: 10, issuedQty: 0, availableQty: 10, pendingPurchaseQty: 0, status: 'Approved' }

describe('deriveFulfillmentStatus', () => {
  it('cancelled/rejected line -> CANCELLED', () => {
    expect(deriveFulfillmentStatus({ ...base, status: 'Cancelled' }, false)).toBe(FULFILLMENT_STATUS.CANCELLED)
    expect(deriveFulfillmentStatus({ ...base, status: 'Rejected' }, false)).toBe(FULFILLMENT_STATUS.CANCELLED)
  })
  it('fully reserved, nothing pending -> READY_FOR_ISSUE', () => {
    expect(deriveFulfillmentStatus(base, false)).toBe(FULFILLMENT_STATUS.READY_FOR_ISSUE)
  })
  it('fully issued, nothing pending -> CLOSED', () => {
    expect(deriveFulfillmentStatus({ ...base, issuedQty: 10 }, false)).toBe(FULFILLMENT_STATUS.CLOSED)
  })
  it('some reserved + some pending -> PARTIALLY_AVAILABLE', () => {
    expect(deriveFulfillmentStatus({ ...base, approvedQty: 100, requestedQty: 100, availableQty: 30, pendingPurchaseQty: 70 }, false))
      .toBe(FULFILLMENT_STATUS.PARTIALLY_AVAILABLE)
  })
  it('nothing reserved, pending, no PO -> PURCHASE_REQUIRED', () => {
    expect(deriveFulfillmentStatus({ ...base, availableQty: 0, pendingPurchaseQty: 10 }, false))
      .toBe(FULFILLMENT_STATUS.PURCHASE_REQUIRED)
  })
  it('nothing reserved, pending, on a PO -> WAITING_FOR_STOCK', () => {
    expect(deriveFulfillmentStatus({ ...base, availableQty: 0, pendingPurchaseQty: 10 }, true))
      .toBe(FULFILLMENT_STATUS.WAITING_FOR_STOCK)
  })
  it('reserved part fully issued but pending remains on PO -> WAITING_FOR_STOCK', () => {
    expect(deriveFulfillmentStatus({ ...base, approvedQty: 100, requestedQty: 100, availableQty: 30, issuedQty: 30, pendingPurchaseQty: 70 }, true))
      .toBe(FULFILLMENT_STATUS.WAITING_FOR_STOCK)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/request-fulfillment.test.ts`
Expected: FAIL — `deriveFulfillmentStatus` / `FULFILLMENT_STATUS` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/request-fulfillment.ts`:

```ts
export const FULFILLMENT_STATUS = {
  PENDING_CHECK: 'PENDING_CHECK',
  PARTIALLY_AVAILABLE: 'PARTIALLY_AVAILABLE',
  PURCHASE_REQUIRED: 'PURCHASE_REQUIRED',
  WAITING_FOR_STOCK: 'WAITING_FOR_STOCK',
  READY_FOR_ISSUE: 'READY_FOR_ISSUE',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const

export type FulfillmentLine = {
  requestedQty: number
  approvedQty: number
  issuedQty: number
  availableQty: number
  pendingPurchaseQty: number
  status: string
}

/**
 * Single derived fulfillment label for a requisition line, by priority (spec §2.2).
 * `committedQty` falls back to requestedQty pre-approval so a line classifies against
 * demand before it is approved. `reservedNow = availableQty − issuedQty` is the gate.
 */
export function deriveFulfillmentStatus(line: FulfillmentLine, hasOpenPoForLine: boolean): string {
  if (line.status === 'Cancelled' || line.status === 'Rejected') return FULFILLMENT_STATUS.CANCELLED
  const committedQty = line.approvedQty > 0 ? line.approvedQty : line.requestedQty
  const reservedNow = Math.max(0, line.availableQty - line.issuedQty)
  if (committedQty > 0 && line.issuedQty >= committedQty && line.pendingPurchaseQty <= 0) {
    return FULFILLMENT_STATUS.CLOSED
  }
  if (line.pendingPurchaseQty > 0) {
    if (reservedNow > 0) return FULFILLMENT_STATUS.PARTIALLY_AVAILABLE
    return hasOpenPoForLine ? FULFILLMENT_STATUS.WAITING_FOR_STOCK : FULFILLMENT_STATUS.PURCHASE_REQUIRED
  }
  if (reservedNow > 0) return FULFILLMENT_STATUS.READY_FOR_ISSUE
  return FULFILLMENT_STATUS.PENDING_CHECK
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/request-fulfillment.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/request-fulfillment.ts src/lib/request-fulfillment.test.ts
git commit -m "feat(fulfillment): add deriveFulfillmentStatus + status constants"
```

---

### Task 3: `assertReadyToIssue` gate

**Files:**
- Modify: `src/lib/request-fulfillment.ts` (append)
- Test: `src/lib/request-fulfillment.test.ts` (extend)

**Interfaces:**
- Produces: `assertReadyToIssue(availableQty: number, issuedQty: number, qty: number): void` — throws a plain `Error` unless `qty` is a positive integer and `qty <= availableQty − issuedQty` (reserved-and-ready). Caller maps the `Error` to a 400 `ApiError`.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/request-fulfillment.test.ts
import { assertReadyToIssue } from '@/lib/request-fulfillment'

describe('assertReadyToIssue', () => {
  it('allows qty up to reservedNow', () => {
    expect(() => assertReadyToIssue(30, 0, 30)).not.toThrow()
    expect(() => assertReadyToIssue(30, 10, 20)).not.toThrow()
  })
  it('rejects qty over reservedNow', () => {
    expect(() => assertReadyToIssue(30, 10, 21)).toThrow(/only 20 reserved/)
  })
  it('rejects non-positive or non-integer qty', () => {
    expect(() => assertReadyToIssue(30, 0, 0)).toThrow(/positive integer/)
    expect(() => assertReadyToIssue(30, 0, 1.5)).toThrow(/positive integer/)
  })
  it('rejects issuing when nothing is reserved', () => {
    expect(() => assertReadyToIssue(0, 0, 1)).toThrow(/only 0 reserved/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/request-fulfillment.test.ts`
Expected: FAIL — `assertReadyToIssue` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/request-fulfillment.ts`:

```ts
/**
 * Guard an issue against a line's reserved-and-ready balance (spec §3.4):
 * qty must be a positive integer not exceeding `availableQty − issuedQty`.
 * Throws a plain Error the caller maps to an ApiError (kept dependency-free).
 */
export function assertReadyToIssue(availableQty: number, issuedQty: number, qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Issue quantity must be a positive integer')
  }
  const reservedNow = Math.max(0, availableQty - issuedQty)
  if (qty > reservedNow) {
    throw new Error(`Cannot issue ${qty}: only ${reservedNow} reserved and ready`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/request-fulfillment.test.ts`
Expected: PASS (all prior + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/request-fulfillment.ts src/lib/request-fulfillment.test.ts
git commit -m "feat(fulfillment): add assertReadyToIssue reserved-qty gate"
```

---

### Task 4: `allocateReceiptToLines` (GRN→line FIFO allocation)

**Files:**
- Modify: `src/lib/request-fulfillment.ts` (append)
- Test: `src/lib/request-fulfillment.test.ts` (extend)

**Interfaces:**
- Produces:
  - `type AllocatableLine = { id: string; pendingPurchaseQty: number }`
  - `type Allocation = { lineId: string; allocQty: number }`
  - `allocateReceiptToLines(lines: AllocatableLine[], acceptedQty: number): Allocation[]` — distributes `acceptedQty` across lines in array order (caller pre-sorts FIFO), each capped at its `pendingPurchaseQty`; surplus beyond total pending is dropped (left as free stock by the caller).

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/request-fulfillment.test.ts
import { allocateReceiptToLines } from '@/lib/request-fulfillment'

describe('allocateReceiptToLines', () => {
  it('allocates a full single-line receipt (scenario 2)', () => {
    expect(allocateReceiptToLines([{ id: 'l1', pendingPurchaseQty: 10 }], 10)).toEqual([{ lineId: 'l1', allocQty: 10 }])
  })
  it('allocates the purchased remainder (scenario 3)', () => {
    expect(allocateReceiptToLines([{ id: 'l1', pendingPurchaseQty: 70 }], 70)).toEqual([{ lineId: 'l1', allocQty: 70 }])
  })
  it('caps at pending and drops surplus', () => {
    expect(allocateReceiptToLines([{ id: 'l1', pendingPurchaseQty: 70 }], 100)).toEqual([{ lineId: 'l1', allocQty: 70 }])
  })
  it('splits FIFO across multiple lines', () => {
    expect(allocateReceiptToLines([{ id: 'l1', pendingPurchaseQty: 5 }, { id: 'l2', pendingPurchaseQty: 8 }], 10))
      .toEqual([{ lineId: 'l1', allocQty: 5 }, { lineId: 'l2', allocQty: 5 }])
  })
  it('returns nothing for zero receipt or no pending', () => {
    expect(allocateReceiptToLines([{ id: 'l1', pendingPurchaseQty: 5 }], 0)).toEqual([])
    expect(allocateReceiptToLines([{ id: 'l1', pendingPurchaseQty: 0 }], 5)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/request-fulfillment.test.ts`
Expected: FAIL — `allocateReceiptToLines` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/request-fulfillment.ts`:

```ts
export type AllocatableLine = { id: string; pendingPurchaseQty: number }
export type Allocation = { lineId: string; allocQty: number }

/**
 * Distribute an accepted GRN quantity across requisition lines that still need
 * purchasing (spec §3.3). Lines are consumed in array order — caller sorts FIFO.
 * Each line takes at most its pendingPurchaseQty; any surplus is dropped (the
 * caller leaves it as free stock).
 */
export function allocateReceiptToLines(lines: AllocatableLine[], acceptedQty: number): Allocation[] {
  const allocations: Allocation[] = []
  let remaining = Math.max(0, Math.floor(acceptedQty))
  for (const line of lines) {
    if (remaining <= 0) break
    const pend = Math.max(0, line.pendingPurchaseQty)
    if (pend <= 0) continue
    const allocQty = Math.min(remaining, pend)
    allocations.push({ lineId: line.id, allocQty })
    remaining -= allocQty
  }
  return allocations
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/request-fulfillment.test.ts`
Expected: PASS (all prior + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/request-fulfillment.ts src/lib/request-fulfillment.test.ts
git commit -m "feat(fulfillment): add allocateReceiptToLines FIFO helper"
```

---

### Task 5: Issuance gate + status recompute

**Files:**
- Modify: `src/app/api/requests/[id]/issue/route.ts`

**Interfaces:**
- Consumes: `assertReadyToIssue`, `deriveFulfillmentStatus` (Tasks 2–3); `reserveStock`/`releaseReservation` unchanged.

- [ ] **Step 1: Extend the fulfillment import**

In `src/app/api/requests/[id]/issue/route.ts`, change the import block (lines 9–14) to add the two helpers:

```ts
import {
  assertIssuable,
  assertReadyToIssue,
  deriveFulfillmentStatus,
  lineStatusAfterIssue,
  rollupRequestStatus,
  flattenRequest,
} from '@/lib/request-fulfillment';
```

- [ ] **Step 2: Compute open-PO flag once, before the issue loop**

Immediately after `if (plan.length === 0) throw ...` (line 56) and before `let lastItem = ...`, insert:

```ts
      const openPo = await tx.purchaseOrder.findFirst({
        where: { linkedSrId: id, status: { notIn: ['CANCELLED', 'REJECTED', 'CLOSED'] } },
        select: { id: true },
      });
      const hasOpenPo = !!openPo;
```

- [ ] **Step 3: Add the reserved-qty gate**

In the per-line loop, right after the existing `assertIssuable` try/catch (after line 68), insert:

```ts
        try {
          assertReadyToIssue(line.availableQty || 0, line.issuedQty, p.qty);
        } catch (e) {
          throw new ApiError(400, (e as Error).message, 'BAD_REQUEST');
        }
```

- [ ] **Step 4: Recompute fulfillmentStatus via derive**

Replace the block at lines 87–96 (the `newIssued` / `nextFulfillmentStatus` / `requestLine.update`):

```ts
        const newIssued = line.issuedQty + p.qty;
        await tx.requestLine.update({
          where: { id: line.id },
          data: {
            issuedQty: newIssued,
            status: lineStatusAfterIssue(line.approvedQty, newIssued),
            fulfillmentStatus: deriveFulfillmentStatus({ ...line, issuedQty: newIssued }, hasOpenPo),
          },
        });
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `issue/route.ts`.

- [ ] **Step 6: Manual verification (scenario 1)**

With the dev server (`npm run dev`) and an admin session: create a requisition for an item with ample stock, approve it, mark ready, issue the full qty. Confirm: line `fulfillmentStatus` becomes `CLOSED`, header becomes `Issued`, `Item.stock` dropped by issued qty, and one `inventory_transactions` row with `type:'OUT'`, `subType:'ISSUE'`. Then attempt to issue 1 more via the API → expect 400 "only 0 reserved and ready".

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/requests/[id]/issue/route.ts"
git commit -m "feat(issue): gate issuance on reserved-and-ready qty; derive line status"
```

---

### Task 6: Close the GRN loop (re-reserve received stock to the requisition)

**Files:**
- Modify: `src/app/api/purchase-orders/[id]/receive/route.ts`

**Interfaces:**
- Consumes: `reserveStock` (Task 1); `allocateReceiptToLines`, `deriveFulfillmentStatus`, `rollupRequestStatus` (Tasks 2,4 + existing).

- [ ] **Step 1: Extend imports**

In `src/app/api/purchase-orders/[id]/receive/route.ts`, change line 5 and add the fulfillment import:

```ts
import { mutateStock, reserveStock } from '@/lib/stock';
import { allocateReceiptToLines, deriveFulfillmentStatus, rollupRequestStatus } from '@/lib/request-fulfillment';
```

- [ ] **Step 2: Re-reserve received stock to SR lines**

Inside the `for (const item of receivedItems)` loop, immediately after the `POItem.receivedQty` update (after line 126, before the `grnLineItems.push(...)`), insert:

```ts
        // Close the loop: re-reserve accepted stock to the originating requisition lines.
        if (po.linkedSrId && acceptedQty > 0) {
          const srLines = await tx.requestLine.findMany({
            where: { requestId: po.linkedSrId, itemId: item.itemId, pendingPurchaseQty: { gt: 0 } },
            orderBy: { createdAt: 'asc' },
          });
          const allocations = allocateReceiptToLines(
            srLines.map((l) => ({ id: l.id, pendingPurchaseQty: l.pendingPurchaseQty })),
            acceptedQty,
          );
          for (const alloc of allocations) {
            const srLine = srLines.find((l) => l.id === alloc.lineId)!;
            const updated = {
              ...srLine,
              availableQty: srLine.availableQty + alloc.allocQty,
              pendingPurchaseQty: srLine.pendingPurchaseQty - alloc.allocQty,
            };
            await tx.requestLine.update({
              where: { id: srLine.id },
              data: {
                availableQty: updated.availableQty,
                pendingPurchaseQty: updated.pendingPurchaseQty,
                fulfillmentStatus: deriveFulfillmentStatus(updated, updated.pendingPurchaseQty > 0),
              },
            });
            await reserveStock(tx, item.itemId, alloc.allocQty);
          }
        }
```

- [ ] **Step 3: Re-open the SR header for issuance**

After the PO-status `tx.purchaseOrder.update(...)` block (after line 185) and before the audit-log loop, insert:

```ts
      // Received stock makes the requisition issuable again — re-roll its header.
      if (po.linkedSrId) {
        const srFresh = await tx.requestLine.findMany({ where: { requestId: po.linkedSrId } });
        await tx.request.update({
          where: { id: po.linkedSrId },
          data: { status: rollupRequestStatus(srFresh) },
        });
      }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `receive/route.ts`.

- [ ] **Step 5: Manual verification (scenario 2)**

Create a requisition for an item with `stock = 0`, qty 10 → line `PURCHASE_REQUIRED`, `pendingPurchaseQty = 10`. Create + approve a PO linked to that SR for 10. Receive (GRN) 10. Confirm: `Item.stock` +10, `Item.reservedQty` +10, the SR line now has `availableQty = 10`, `pendingPurchaseQty = 0`, `fulfillmentStatus = READY_FOR_ISSUE`, and the SR header is `Approved` (issuable). Then issue 10 → header `Issued`, line `CLOSED`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/purchase-orders/[id]/receive/route.ts"
git commit -m "feat(grn): re-reserve received stock to requisition lines and reopen for issue"
```

---

### Task 7: Create + approve status alignment + invariant clamp

**Files:**
- Modify: `src/app/api/requests/route.ts` (create POST)
- Modify: `src/app/api/requests/[id]/approve/route.ts`

**Interfaces:**
- Consumes: `deriveFulfillmentStatus` (Task 2).

- [ ] **Step 1: Create route — full-available line is READY_FOR_ISSUE**

In `src/app/api/requests/route.ts`, in the create POST, change the "Case 1" branch literal (line 135) from:

```ts
            fulfillmentStatus = "AVAILABLE";
```
to:
```ts
            fulfillmentStatus = "READY_FOR_ISSUE";
```

(The `PARTIALLY_AVAILABLE` and `PURCHASE_REQUIRED` branches already match `deriveFulfillmentStatus` output and stay as-is.)

- [ ] **Step 2: Approve route — import derive**

In `src/app/api/requests/[id]/approve/route.ts`, change line 8:

```ts
import { flattenRequest, deriveFulfillmentStatus } from '@/lib/request-fulfillment';
```

- [ ] **Step 3: Approve route — clamp availableQty on rejection**

In the `approvedQty <= 0` branch, add `availableQty: 0` to the line update (lines 55–58):

```ts
          await tx.requestLine.update({
            where: { id: line.id },
            data: { approvedQty: 0, status: 'Rejected', fulfillmentStatus: 'CANCELLED', availableQty: 0 },
          });
```

- [ ] **Step 4: Approve route — uniform recompute with invariant clamp**

Replace the approve branch body (lines 68–99, from `approvedLineCount += 1;` through the closing of the `releaseQty` block) with:

```ts
        approvedLineCount += 1;

        const available = line.availableQty || 0;
        const newAvailableQty = Math.min(available, approvedQty);
        const newPendingPurchaseQty = approvedQty - newAvailableQty;
        const releaseQty = available - newAvailableQty; // = max(0, available - approvedQty)

        await tx.requestLine.update({
          where: { id: line.id },
          data: {
            approvedQty,
            status: 'APPROVED',
            availableQty: newAvailableQty,
            pendingPurchaseQty: newPendingPurchaseQty,
            fulfillmentStatus: deriveFulfillmentStatus(
              {
                requestedQty: line.requestedQty,
                approvedQty,
                issuedQty: line.issuedQty,
                availableQty: newAvailableQty,
                pendingPurchaseQty: newPendingPurchaseQty,
                status: 'APPROVED',
              },
              false,
            ),
          },
        });

        if (releaseQty > 0) {
          await tx.item.update({
            where: { id: line.itemId },
            data: { reservedQty: { decrement: releaseQty }, version: { increment: 1 } },
          });
        }
```

(This removes the now-unused `newFulfillmentStatus`/`newPendingPurchaseQty` pre-block at lines 70–81; delete those lines.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors; no references to the deleted `newFulfillmentStatus` variable remain.

- [ ] **Step 6: Manual verification (scenario 4 — concurrency + partial approve)**

Item `stock = 10`. Create request A for 8 → reserves 8 (`READY_FOR_ISSUE`), `Item.reservedQty = 8`. Create request B for 8 → reserves only 2 (`PARTIALLY_AVAILABLE`, `availableQty = 2`, `pendingPurchaseQty = 6`). Approve request B at qty 5 → `availableQty` clamps to 2, `pendingPurchaseQty = 3`, surplus reservation released correctly (`reservedQty` reflects 8 + 2).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/requests/route.ts "src/app/api/requests/[id]/approve/route.ts"
git commit -m "feat(requests): align create/approve fulfillment status; clamp availableQty invariant"
```

---

### Task 8: UI — line fulfillment columns + status-driven actions

**Files:**
- Create: `src/components/requests/fulfillment-badge.tsx`
- Modify: `src/components/requests/RequestDetailDialog.tsx`
- Modify: `src/components/views/issuance-view.tsx`

**Interfaces:**
- Consumes: line fields `requestedQty`, `approvedQty`, `issuedQty`, `availableQty`, `pendingPurchaseQty`, `fulfillmentStatus` already returned by the requests API.

> The executor MUST read both target files first and integrate following their existing table/badge/button patterns. Add the self-contained helper below, then wire it in.

- [ ] **Step 1: Add a shared status presenter**

Create `src/components/requests/fulfillment-badge.tsx`:

```tsx
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
```

- [ ] **Step 2: Show per-line columns in the detail dialog**

In `RequestDetailDialog.tsx`, in the per-line list/table, render for each line: `Requested {requestedQty}`, `Reserved {reservedNow(line)}`, `Issued {issuedQty}`, `Pending Purchase {pendingPurchaseQty}`, and `<FulfillmentBadge status={line.fulfillmentStatus} />`. Import `FulfillmentBadge` and `reservedNow` from `./fulfillment-badge`.

- [ ] **Step 3: Status-driven actions**

Drive the per-line action by state:
- `reservedNow(line) > 0` (i.e. `READY_FOR_ISSUE` or the ready part of `PARTIALLY_AVAILABLE`) → show the existing **Issue** action for that line/request.
- `line.fulfillmentStatus === 'WAITING_FOR_STOCK'` → show a **View Purchase Status** link/button that navigates to the linked PO (reuse the existing PO/procurement navigation; the request already links via `linkedPos`).
- `line.fulfillmentStatus === 'PURCHASE_REQUIRED'` → keep the existing create-PO entry path.

- [ ] **Step 4: Header label in issuance view**

In `issuance-view.tsx`, where the header status is rendered, present `Issued` as **"Completed"** and `PartiallyIssued` as **"Partially Issued"** (display-only mapping; do not change the stored value).

- [ ] **Step 5: Build verification**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 6: Manual verification (scenario 3 end-to-end)**

Request 100 of an item with stock 30. In the detail dialog confirm: Requested 100 · Reserved 30 · Issued 0 · Pending Purchase 70 · **Partially Available**. Issue 30 → Reserved 0 · Issued 30 · Pending 70 · **Waiting for Stock** (once a PO exists) and header **Partially Issued**. Create+approve+receive a PO for 70 → line shows Reserved 70 · **Ready for Issue**. Issue 70 → **Completed**, header **Completed**.

- [ ] **Step 7: Commit**

```bash
git add src/components/requests/fulfillment-badge.tsx src/components/requests/RequestDetailDialog.tsx src/components/views/issuance-view.tsx
git commit -m "feat(ui): requisition line fulfillment columns and status-driven actions"
```

---

## Verification (whole feature)

Run the full unit suite and a clean build:

```bash
npm run test        # all pure-helper tests green (Tasks 1–4)
npm run build       # typechecks every modified route + UI
```

Then walk the four spec scenarios end-to-end against `npm run dev` (covered piecewise in Tasks 5–8 manual steps): full-stock, no-stock→PO→GRN→issue, partial (issue 30 now / 70 after GRN), and concurrency (A reserves 8, B sees 2 free). Confirm the `inventory_transactions` ledger shows an `IN/PURCHASE` row per GRN and an `OUT/ISSUE` row per issue, and that `free_stock = Item.stock − Item.reservedQty` stays correct throughout.

## Self-review notes (spec coverage)

- spec §2 state model → Tasks 2 (derive) + 7 (create/approve write the states).
- spec §3.1 reserveStock → Task 1.
- spec §3.2 derive + assertReadyToIssue → Tasks 2, 3.
- spec §3.3 close the loop → Tasks 4 (alloc) + 6 (route).
- spec §3.4 issuance gate → Task 5.
- spec §3.5 create/approve alignment + clamp → Task 7.
- spec §3.6 guards: issue-more-than-reserved → Task 5; close/delete blocked **by construction** (no such endpoints — see Pre-flight notes / spec §3.6), so no task builds them.
- spec §3.7 UI → Task 8.
- spec §5 tests: pure-logic scenarios → Tasks 1–4 unit tests; route scenarios → manual verification (project has no DB integration harness; building one is out of proportion and out of scope).
