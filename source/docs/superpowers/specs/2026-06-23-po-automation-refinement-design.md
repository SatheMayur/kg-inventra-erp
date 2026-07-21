# Demand-Driven Purchase Order Refinement — Design

**Date:** 2026-06-23
**Project:** KG Inventra (Store_KG/source)
**Scope:** Refine PO automation so procurement is demand-driven from Store Requisitions. Extend existing models — do **not** add a `PurchaseRequirement` table, do **not** rewrite SR/issue/GRN internals.

---

## 1. Context & decision

The existing system already implements most of the target flow:

- `PurchaseOrder.status` already carries the full workflow: `DRAFT → PENDING_APPROVAL → APPROVED → SENT_TO_SUPPLIER → SUPPLIER_CONFIRMED → PARTIALLY_RECEIVED → FULLY_RECEIVED → CLOSED` (+ `REJECTED`, `CANCELLED`, `ON_HOLD`, `INVOICE_PENDING`, `NEEDS_REVIEW`).
- `PurchaseOrder.linkedSrId → Request` = source Store Requisition.
- `POItem.qty` / `POItem.receivedQty` = ordered / received.
- `GoodsReceipt` + `GoodsReceiptItem` (GRN) exist.
- `RequestLine.pendingPurchaseQty` + `RequestLine.fulfillmentStatus` already track shortage per line.
- `api/purchase-orders` POST already requires `linkedSrId`, only allows `APPROVED` SRs, prevents duplicate PO per SR, builds PO items from line shortfall, creates `DRAFT`.
- `api/purchase-orders/[id]/receive` already creates a GRN, blocks over-receiving, updates stock **only on GRN** (via `mutateStock`, `subType: 'PURCHASE'`), sets `PARTIALLY_RECEIVED`/`FULLY_RECEIVED`, runs 3-way match.

**Decision (chosen):** Reuse `RequestLine` as the purchase-requirement entity. No new table. The requisition line's `pendingPurchaseQty` + `fulfillmentStatus` *is* the purchase requirement. This is the lightest "extend, don't rewrite" path and avoids duplicating data.

**Product decisions:**
- Qty override (PO qty > shortage): allowed only for roles **`admin` and `STORE_ADMIN`**; all other roles hard-capped at `pendingPurchaseQty` per line.
- Duplicate-PO rule: **per-line until covered** — multiple POs per SR allowed as long as each shortfall line is covered only once (supports supplier split). Block re-ordering a line already on an active PO.

---

## 2. Requirement lifecycle (single `fulfillmentStatus` chain)

`RequestLine.fulfillmentStatus` is a free `String` today — no migration required, only new literal values + a shared constant set.

```
PENDING_CHECK
   │ (SR approve)
   ├── AVAILABLE              (full stock; no purchase needed)
   ├── PARTIALLY_AVAILABLE    (some stock issued; pendingPurchaseQty > 0)
   ├── PURCHASE_REQUIRED      (no stock; pendingPurchaseQty = requestedQty)
   └── CANCELLED

   short lines (PARTIALLY_AVAILABLE | PURCHASE_REQUIRED, pendingPurchaseQty > 0):
        │ (PO created from this line)
        └── PO_CREATED
              │ (GRN accepts < pendingPurchaseQty cumulatively)
              ├── PARTIALLY_RECEIVED
              │ (GRN accepts ≥ pendingPurchaseQty cumulatively)
              └── FULLY_RECEIVED
```

New literal values added: `PO_CREATED`, `PARTIALLY_RECEIVED`, `FULLY_RECEIVED`.
Shared constant set + helpers live in `src/lib/purchase-requirement.ts` (new, small, dependency-free for unit testing).

"Pending purchase requirement" = a `RequestLine` with `pendingPurchaseQty > 0` and `fulfillmentStatus ∈ {PURCHASE_REQUIRED, PARTIALLY_AVAILABLE}` (i.e. short and not yet on a PO).

---

## 3. Changes by component

### 3.1 PO create — `src/app/api/purchase-orders/route.ts` (POST)

1. **Qty cap.** For each PO line, look up the matching SR `RequestLine` (by `linkedSrId` + `itemId`). Require `qty ≤ pendingPurchaseQty`. If exceeded and `auth.user.role ∉ {admin, STORE_ADMIN}` → `400 BAD_REQUEST` (`"Purchase qty (X) exceeds shortage (Y) for <item>"`). Override roles may exceed.
2. **Item membership.** Every PO line item must correspond to a short SR line. Reject items not in the SR shortfall → `400`.
3. **Per-line duplicate block.** Remove the current "one active PO per SR" check. Instead, reject any line whose SR `RequestLine.fulfillmentStatus` is already `PO_CREATED` / `PARTIALLY_RECEIVED` / `FULLY_RECEIVED` → `400` (`"Item <name> is already on an active PO"`). Lines still short remain orderable on a new PO.
4. **On create (inside the existing `$transaction`):** set each covered `RequestLine.fulfillmentStatus = 'PO_CREATED'`. Replace the blanket `Request.status = 'CONVERTED_TO_PO'` with: set it only when **all** short lines of the SR are now `PO_CREATED`+; otherwise leave SR status as `APPROVED`.

### 3.2 Receive / GRN — `src/app/api/purchase-orders/[id]/receive/route.ts` (PATCH)

Already handles GRN creation, over-receive block, stock-on-GRN, PO status, 3-way match. **Add one step** inside the transaction, after `POItem.receivedQty` is updated:

- If `po.linkedSrId` is set, for each received item find the SR `RequestLine` (`linkedSrId` + `itemId`). Compute cumulative accepted qty for that item across the SR's POs. Set the line `fulfillmentStatus`:
  - `FULLY_RECEIVED` when cumulative accepted ≥ `pendingPurchaseQty`,
  - else `PARTIALLY_RECEIVED`.

No change to stock logic, 3-way match, or PO status transitions.

### 3.3 Pending Purchase Requirements — `src/app/api/purchase-requirements/route.ts` (NEW, GET)

- Query `RequestLine` where `pendingPurchaseQty > 0` and `fulfillmentStatus ∈ {PURCHASE_REQUIRED, PARTIALLY_AVAILABLE}`, include `request` + `item`.
- Return two shapes:
  - `lines`: per-line `{ requestLineId, srId, srNumber, department, requestedBy, itemId, itemName, requiredQty (=pendingPurchaseQty), unit, reason (= request.purpose ?? request.note), createdAt }`.
  - `rollup`: per-item `{ itemId, itemName, totalRequiredQty, lineCount }`.
- Add `purchaseRequirements.list()` to `src/lib/api.ts` with matching types.

### 3.4 UI — `src/components/views/procurement-view.tsx`

- Rename action **"Create Purchase Order" → "Create PO From Purchase Requirement"**.
- Drive the create dialog from the pending-requirements list: select an SR (or its short lines), lines pre-fill with `qty = pendingPurchaseQty`, qty input read-only unless role ∈ {admin, STORE_ADMIN}.
- Remove the free-form "add arbitrary item" entry path for normal users (custom items now only meaningful for the override roles, still qty/membership-validated server-side).
- PO list/detail row shows: `PO# · Source SR · Department · Requested By · Item · Ordered · Received · Pending · Reason · Status`.

### 3.5 Dashboard — `src/components/views/dashboard-view.tsx`

- Add a "Pending Purchase Requirements" card: total count + top items from the `rollup` (e.g. `Laptop — 5`, `Cable — 100`). Links to the procurement view.

---

## 4. Validation matrix (server-enforced)

| Rule | Status |
|---|---|
| PO without `linkedSrId` | Blocked (already) |
| PO line qty > shortage | Blocked unless role ∈ {admin, STORE_ADMIN} (new) |
| PO line item not in SR shortfall | Blocked (new) |
| Re-ordering a line already on active PO | Blocked (new, replaces per-SR block) |
| Receiving > PO line remaining | Blocked (already) |
| Partial receiving / multiple GRNs | Allowed (already) |
| Multiple items per PO | Allowed (already) |
| Multiple POs per SR (different lines) | Allowed (new) |

---

## 5. Testing

- Unit (`vitest`): `src/lib/purchase-requirement.ts` — status transitions, qty-cap check, "is pending requirement" predicate, cumulative-received → status mapping.
- Route-level: PO create qty cap (capped role vs override role), per-line duplicate block, `PO_CREATED` set; receive → line `PARTIALLY_RECEIVED`/`FULLY_RECEIVED`; `GET /api/purchase-requirements` shape.

## 6. Out of scope

- No `PurchaseRequirement` DB table.
- No changes to invoice / 3-way-match / stock-mutation internals.
- No changes to SR creation/approve/issue beyond the line-status writes described.
- No PO-status enum changes (already complete).
