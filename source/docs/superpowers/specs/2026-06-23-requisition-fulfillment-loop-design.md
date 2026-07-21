# Store Requisition Fulfillment & Issuance Loop — Design

**Date:** 2026-06-23
**Project:** KG Inventra (`Store_KG/source`, Next.js App Router + Prisma/SQLite)
**Scope:** Close the demand→reservation→procurement→receipt→issue→ledger loop on top of the existing modules. Extend in place — **no new tables, no schema migration, no redesign** of Store Requisition, Inventory, PO, GRN, or Issuance internals.

---

## 1. Context & decision

Most of the target pipeline already exists and works:

- `Request` → `store_requisitions`; `RequestLine` → `store_requisition_items` carry `requestedQty`, `approvedQty`, `issuedQty`, `availableQty`, `pendingPurchaseQty`, `fulfillmentStatus`, `status`.
- Stock availability is checked and **reserved automatically at request creation** (`api/requests` POST), via the `Item.reservedQty` aggregate. `free_stock = Item.stock − Item.reservedQty` (used in `reorder.ts`).
- Partial fulfillment is modeled: `PARTIALLY_AVAILABLE` + `pendingPurchaseQty`.
- PO is created from SR shortfall and linked via `PurchaseOrder.linkedSrId`.
- GRN (`api/purchase-orders/[id]/receive`) increases stock **only on receipt** via `mutateStock(subType:'PURCHASE')`, writing the `inventory_transactions` ledger; runs 3-way match; sets PO status.
- Issuance (`api/requests/[id]/issue`) decrements stock via `mutateStock(subType:'ISSUE')` (ledger type `OUT`, `balanceAfter`, `reference: "Request <id>"`), releases reservation, and rolls header status up to `PartiallyIssued`/`Issued`.

**The genuine gaps** (verified against code):

1. **The loop never closes after GRN.** `api/purchase-orders/[id]/receive` has **zero** reference to requisitions/reservations — received stock lands in general `Item.stock`, and the originating `RequestLine` is never advanced, re-reserved, or made issuable.
2. **The fulfillment states needed don't exist.** `READY_FOR_ISSUE`, `WAITING_FOR_STOCK` appear nowhere in code; issuance is not gated on a "ready" state.
3. **Issuance guards are partial** — blocks issuing more than *approved* and negative stock, but not "only when ready" or "no more than *reserved*."

**Decisions (confirmed with product owner):**

- **Reservation model:** Extend existing fields. No `inventory_reservations` table. `RequestLine.availableQty` is the per-line reserved quantity; `Item.reservedQty` is the synced aggregate. (Reservation history remains inferable from line fields + the `inventory_transactions` ledger.)
- **Reservation trigger:** Automatic at request creation (today's behavior) — strongest concurrency story.
- **Partial issue:** The in-stock portion is issuable immediately; the purchased portion becomes issuable after GRN.

This supersedes the unbuilt §3.2 ("GRN → SR line status") of the `2026-06-23-po-automation-refinement-design.md`, which is implemented here as part of loop-closing.

---

## 2. State model (no migration)

Every field the requirement lists already exists on `store_requisition_items`. `fulfillmentStatus` is a free `String`, so new states are **new literal values only — no migration**.

### 2.1 Per-line quantity invariants (source of truth)

```
approvedQty       = availableQty + pendingPurchaseQty       // committed fulfillment
issuedQty        <= availableQty                             // cannot issue more than reserved
reservedNow       = availableQty − issuedQty                 // "Reserved" column in UI
Item.reservedQty  = Σ(availableQty − issuedQty) over live lines   // free_stock = stock − reservedQty
```

Notes:
- `availableQty` = total quantity ever reserved from stock for this line (initial reservation at creation + any re-reservation from GRN). It is **not** decremented on issue; `reservedNow` is derived as `availableQty − issuedQty`.
- On approval that grants less than was reserved, `availableQty` is **clamped down to `approvedQty`** and the surplus released from `Item.reservedQty` (fix to an existing inconsistency — see §3.5).

### 2.2 Derived `fulfillmentStatus` (single label, computed by priority)

Let `reservedNow = availableQty − issuedQty`. `deriveFulfillmentStatus(line, hasOpenPoForLine)` returns the **first** matching rule:

| # | Condition | State | Note |
|---|---|---|---|
| 1 | line cancelled | `CANCELLED` | existing |
| 2 | `approvedQty == 0` (not yet approved) | `PENDING_CHECK` | existing (transient) |
| 3 | `issuedQty >= approvedQty` AND `pendingPurchaseQty == 0` | `CLOSED` | **replaces** `FULFILLED` |
| 4 | `pendingPurchaseQty > 0` AND `reservedNow > 0` | `PARTIALLY_AVAILABLE` | existing — some issuable now, some still to source |
| 5 | `pendingPurchaseQty > 0` AND `reservedNow == 0` AND a PO covers the line | `WAITING_FOR_STOCK` | **new** — nothing issuable now; on order, awaiting GRN |
| 6 | `pendingPurchaseQty > 0` AND `reservedNow == 0` AND no PO yet | `PURCHASE_REQUIRED` | existing |
| 7 | `pendingPurchaseQty == 0` AND `reservedNow > 0` | `READY_FOR_ISSUE` | **new** — fully sourced; reserved stock awaiting issue |

**Issuance is permitted whenever `reservedNow > 0`** (i.e. `PARTIALLY_AVAILABLE` or `READY_FOR_ISSUE`), gated to `qty ≤ reservedNow` — the label is a summary; `reservedNow` is the gate. A partial line is therefore issuable for its in-stock portion immediately ("issue available now"). After GRN re-reserves the remainder (`pendingPurchaseQty → 0`), the line becomes `READY_FOR_ISSUE`. This matches the requirement's own examples: a freshly-created 30-of-100 line is `PARTIALLY_AVAILABLE`; after the 70 is received it moves to `READY_FOR_ISSUE`.

Because reservation is automatic, the requirement's `STOCK_CHECKED` and the `AVAILABLE → RESERVED` split collapse into "reserved at creation"; a fully-available line goes straight to `READY_FOR_ISSUE`. Only `WAITING_FOR_STOCK`, `READY_FOR_ISSUE`, `CLOSED` are newly introduced; existing spellings (`PARTIALLY_AVAILABLE`, `PURCHASE_REQUIRED`, `PENDING_CHECK`, `CANCELLED`) are retained to avoid churn.

The full set of literals is centralized in `src/lib/request-fulfillment.ts` as a shared constant + the `deriveFulfillmentStatus` helper (pure, unit-testable).

---

## 3. Changes by component

### 3.1 `src/lib/stock.ts` — add `reserveStock`

Add a helper symmetric to the existing `releaseReservation`:

```ts
export async function reserveStock(tx: Tx, itemId: string, qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) return;
  await tx.item.update({
    where: { id: itemId },
    data: { reservedQty: { increment: qty } },
  });
}
```

No change to `mutateStock` or the ledger.

### 3.2 `src/lib/request-fulfillment.ts` — status derivation + issue gate

- `FULFILLMENT_STATUS` constant set (all literals above).
- `deriveFulfillmentStatus(line, hasOpenPoForLine)` per §2.2.
- `assertReadyToIssue(line, qty)` — throws unless `qty > 0` and `qty <= line.availableQty − line.issuedQty`. (Complements the existing `assertIssuable`, which checks against `approvedQty`.)
- `rollupRequestStatus` unchanged in logic; terminal remains the existing `Issued` literal (surfaced as "Completed" in the UI — see §3.6).

### 3.3 `src/app/api/purchase-orders/[id]/receive/route.ts` — close the loop

Inside the existing `$transaction`, **after** `mutateStock(PURCHASE)` and `POItem.receivedQty` update, **only when `po.linkedSrId` is set**, add:

```
for each received item with acceptedQty > 0:
  remaining = acceptedQty
  lines = RequestLine where requestId = po.linkedSrId AND itemId = item.itemId
          AND pendingPurchaseQty > 0, ordered by createdAt ASC   // FIFO
  for each line while remaining > 0:
    allocQty = min(remaining, line.pendingPurchaseQty)
    line.availableQty       += allocQty
    line.pendingPurchaseQty -= allocQty
    await reserveStock(tx, item.itemId, allocQty)          // re-earmark received stock
    line.fulfillmentStatus = deriveFulfillmentStatus(line, hasOpenPo)
    remaining -= allocQty
  // surplus (remaining > 0, e.g. admin over-order) stays as free stock
```

- Auto-reorder POs (`linkedSrId == null`) are untouched — received stock becomes free stock.
- **No change** to stock math, 3-way match, PO status transitions, or audit logging already in the route.
- After line updates, refresh the parent `Request.status` so a request whose remainder just arrived returns to / stays in the issuance queue (`Approved`/`PartiallyIssued`), never stranded in `CONVERTED_TO_PO`.

### 3.4 `src/app/api/requests/[id]/issue/route.ts` — issuance gate

For each planned line:
- Add `assertReadyToIssue(line, qty)` (`qty <= availableQty − issuedQty`), in addition to the existing `assertIssuable` and `mutateStock` negative-stock guard.
- After `issuedQty += qty`, recompute `line.fulfillmentStatus` via `deriveFulfillmentStatus` (→ `CLOSED` when complete, back to `WAITING_FOR_STOCK` if a purchase remainder is still outstanding).
- Reservation release logic unchanged.

### 3.5 `src/app/api/requests/route.ts` (create) + `[id]/approve/route.ts`

- **Create:** set initial `fulfillmentStatus` via `deriveFulfillmentStatus` (fully-available line → `READY_FOR_ISSUE`).
- **Approve:** when `approvedQty < availableQty`, **clamp `line.availableQty = approvedQty`** in addition to the existing `Item.reservedQty` surplus release, preserving the §2.1 invariant. Recompute `fulfillmentStatus`.

### 3.6 Guards against invalid actions

| Block | Enforcement |
|---|---|
| Issue without approved requisition | existing header gate (`Approved`/`ReadyForPickup`/`PartiallyIssued`) — kept |
| Issue more than reserved | **new** `assertReadyToIssue` (§3.4) |
| Issue more than available stock | existing `mutateStock` negative-stock guard |
| Close request with pending qty | satisfied by construction: there is **no manual-close endpoint**; the header only reaches the terminal `Issued`/"Completed" via `rollupRequestStatus` when `Σissued == Σapproved`. No code path can close a request with outstanding qty. |
| Delete request after reservation | satisfied by construction: there is **no `DELETE` endpoint** for requests. The only terminal action is `PATCH /api/requests/[id]/cancel`, which releases reservations before terminating — no destructive delete can leak a held reservation. |

**Endpoint reality (verified):** requests expose `GET`/`POST` and the PATCH sub-routes `approve`, `ready`, `issue`, `reject`, `cancel`. There is no `DELETE` and no `close`. The two "block" requirements are therefore met structurally; **if** a manual close/delete is ever added, it must carry the `409` guards described above. No new endpoint is built for this task.

### 3.7 UI — `src/components/requests/RequestDetailDialog.tsx` (+ issuance view)

- Per-line row: **Requested · Reserved (`availableQty − issuedQty`) · Issued · Pending Purchase · Status**.
- Status-driven actions:
  - `reservedNow > 0` (`READY_FOR_ISSUE`, or the in-stock portion of `PARTIALLY_AVAILABLE`) → **[Create Issue]**
  - `WAITING_FOR_STOCK` → **[View Purchase Status]** (links to the linked PO/GRN)
  - `PURCHASE_REQUIRED` (no PO) → existing create-PO path
- Header terminal `Issued` rendered as **"Completed"**; `PartiallyIssued` as **"Partially Issued"**.

---

## 4. Validation matrix (server-enforced)

| Rule | Status |
|---|---|
| Reserve free stock only (`stock − reservedQty`) at creation | Already; unchanged |
| Concurrent request sees reduced free stock | Already (reservation at creation) |
| GRN re-reserves received qty to originating SR line | **New (§3.3)** |
| Line advances to `READY_FOR_ISSUE` when its qty is reserved | **New (§3.2/3.3)** |
| Issue only a `READY_FOR_ISSUE` line, qty ≤ reserved-now | **New (§3.4)** |
| Issue ≤ available stock | Already (`mutateStock`) |
| Close with pending qty | **Blocked (new, §3.6)** |
| Delete after reservation | **Blocked (new, §3.6)** |
| OUT ledger row on issue / IN ledger row on GRN | Already; unchanged |

---

## 5. Testing (vitest)

**Unit (pure helpers):**
- `deriveFulfillmentStatus` — every row of the §2.2 table, including priority ordering.
- `assertReadyToIssue` — at/over/under the reserved-now boundary.
- `reserveStock` — increments aggregate; ignores non-positive qty.

**Route-level (the 4 required scenarios):**
1. **Full stock** — request 10, stock 20 → reserve 10, `READY_FOR_ISSUE`; issue 10 → header Completed; stock 10; one OUT ledger row.
2. **No stock** — request 10, stock 0 → `PURCHASE_REQUIRED`; PO; GRN 10 → re-reserve 10, `READY_FOR_ISSUE`; issue 10 → Completed. IN then OUT ledger rows.
3. **Partial** — request 100, stock 30 → reserve 30 (`PARTIALLY_AVAILABLE`, reservedNow 30), pending 70; issue 30 (header `PartiallyIssued`; line → `WAITING_FOR_STOCK` once the 70 is on a PO); GRN 70 → re-reserve 70 → `READY_FOR_ISSUE`; issue 70 → Completed.
4. **Concurrency** — stock 10; request A 8 → reserve 8 (free 2); request B 8 → reserves only 2, pending 6, `PARTIALLY_AVAILABLE`.

**Guard tests:** issue more than reserved → 400; close with pending → 409; delete with reservation → 409.

---

## 6. Out of scope (explicitly not built)

- No `inventory_reservations` table; no schema migration.
- No changes to `mutateStock`, the ledger, 3-way match, or PO status transitions.
- PO qty-cap-by-role, the `purchase-requirements` listing endpoint, and per-line duplicate-PO blocking (separately designed in `2026-06-23-po-automation-refinement-design.md`) — flagged if any becomes necessary, otherwise untouched.

---

## 7. Build order

1. `reserveStock` helper (`stock.ts`) + unit test.
2. `deriveFulfillmentStatus` + `assertReadyToIssue` (`request-fulfillment.ts`) + unit tests.
3. Close the GRN loop (`receive/route.ts`) + scenario 2 & 3 receive tests.
4. Issuance gate (`issue/route.ts`) + guard tests.
5. Create/approve status alignment + invariant clamp.
6. Close/delete guards.
7. UI (`RequestDetailDialog` + issuance view).
8. Verify end-to-end against all 4 scenarios + ledger correctness.
