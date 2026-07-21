# Off-Catalog (Custom) Requisition Items — Design Spec

**Date:** 2026-06-23
**Status:** Approved (Approach B)

## 1. Problem

Employees can only requisition items that already exist in the store catalog. The "New Multi-Item Request" dialog sources lines exclusively from existing `Item` rows, and the create route requires every line's `itemId` to resolve to a real `Item`. There is no way to request something the store doesn't stock — e.g. a "water bottle". The need still has to be captured, approved, procured, and issued.

## 2. Goal

Let an employee request an item that is not in the catalog. The request flows through the **existing** demand → approval → procurement (PO) → GRN → reservation → issue loop with no special-casing of the loop itself. An admin vets the request at approval; vetting promotes the proposed item into the real catalog.

## 3. Core constraint that drives the design

Everything downstream is keyed on a real `Item.id`:
- `RequestLine.itemId` — required FK to `Item`.
- `POItem.itemId` — required FK to `Item` (procurement is impossible without an item).
- GRN / `mutateStock` / the reservation loop all operate on `Item.id`.

Therefore an off-catalog request **must become a real `Item`** to be fulfilled. The design materializes that item up front and gates its visibility, rather than threading a null `itemId` through the whole loop.

## 4. Approach B — "proposed Item" (chosen)

When an employee adds a custom line, create a real `Item` immediately, flagged as **proposed / uncatalogued**:

| Field | Value |
|-------|-------|
| `name` | the custom item name the employee typed |
| `unit` | employee-chosen (default `pcs`) |
| `category` | sentinel `"Custom Request"` (required field; keeps proposed items grouped) |
| `stock` | `0` |
| `reservedQty` | `0` |
| `reorderQty` | `0` | (disables auto-PO for the proposal) |
| `active` | `false` | ← hides it from all user-facing surfaces |
| `sourceChannel` | `"REQUISITION"` | ← durable provenance marker (survives promotion) |
| `createdBy` | requesting user's id |
| `price` | `0` |

The `RequestLine` links to this item normally. Because the proposed item has `stock = 0`, it is born **`PURCHASE_REQUIRED`** with `pendingPurchaseQty = requestedQty` and `availableQty = 0` — identical to the existing zero-stock ("Case 2") line path in the create route. The request header becomes `UNDER_REVIEW` (it has a deficit).

**No schema migration** — reuses existing `active`, `sourceChannel`, `createdBy`, `unit`, `category`.

### Why not the alternatives
- **Nullable `itemId` + free-text line:** touches every part of the fulfillment loop (derive/approve/issue/receive all assume `itemId`), and a PO still can't be raised without an `Item`, so an item gets created at procurement anyway — more branching for less.
- **Free-text wishlist note only:** minimal code but breaks linkage/audit and forces fully manual handling.

## 5. Lifecycle

```
Employee proposes "water bottle"
   └─ Item created: active:false, sourceChannel:REQUISITION, stock:0  (hidden from catalog)
   └─ RequestLine → that item, fulfillmentStatus PURCHASE_REQUIRED, header UNDER_REVIEW
Admin approves the line (approvedQty > 0)
   └─ Item PROMOTED: active:true  (now a real catalog item)
   └─ line stays PURCHASE_REQUIRED (no stock yet)
Admin rejects the line (approvedQty <= 0)
   └─ proposed Item soft-deleted (deletedAt) if still inactive, stock 0, no other live references
Procure → GRN → reserve → issue   (UNCHANGED — the existing loop runs on the now-real item)
   └─ line: WAITING_FOR_STOCK → READY_FOR_ISSUE → CLOSED
```

**Who can propose:** all employees (consistent with existing self-request). Proposed items are `active:false` and admin-gated, so no privilege is escalated — an employee cannot publish a catalog item, only propose one.

## 6. Changes

### 6.1 Validation (`src/lib/validation.ts`)
Extend `requestLineInputSchema` so a line is **either** a catalog line or a custom line:
- catalog: `{ itemId: string, qty: int>=1 }`
- custom: `{ customItemName: string (1..120), unit?: string, qty: int>=1 }`

Implemented as `itemId` and `customItemName` both optional + a `.refine` requiring **exactly one** of them present. `unit` optional (default `pcs`), capped length.

### 6.2 Create route (`src/app/api/requests/route.ts`)
Before the existing per-item processing, **materialize custom lines**: for each line with `customItemName`, create the proposed `Item` (section 4) inside the existing `$transaction` and set the line's `itemId` to the new item id. After that, the existing aggregation/reservation logic runs **unchanged** (each proposed item is a zero-stock item → `PURCHASE_REQUIRED`). `itemName` on the line is the custom name. Do not reserve stock for proposed items (none to reserve).

### 6.3 Approve route (`src/app/api/requests/[id]/approve/route.ts`)
- **Promote on approve:** for each approved line, `tx.item.updateMany({ where: { id: line.itemId, active: false, sourceChannel: 'REQUISITION' }, data: { active: true } })`. Idempotent; no-op for normal catalog items.
- **Cleanup on reject branch** (`approvedQty <= 0`): `tx.item.updateMany({ where: { id: line.itemId, active: false, sourceChannel: 'REQUISITION', stock: 0 }, data: { deletedAt: <now> } })` — soft-delete an orphan proposal that was never promoted.

### 6.4 Segregation — exclude proposed items from user-facing Item surfaces
Proposed items are `active:false`; user-facing Item list/search/alert/reorder/report queries currently filter `deletedAt: null` but **not** `active`. Add `active: true` to each user-facing query so proposed items stay hidden until promoted. Surfaces (exact files enumerated in the plan):
- **Item catalog / requisition picker** — `GET /api/items` (the source for `NewRequestDialog`) — **must**.
- **Low-stock alerts** — `src/lib/alert-runner.ts`, `src/app/api/alerts/route.ts`.
- **Command search / low-stock** — `src/app/api/command/route.ts` (2 queries).
- **Reorder / auto-PO** — `src/lib/reorder.ts` (`reorderQty:0` already disables auto-PO for proposals; add the filter for defense).
- **Reporting** — `inventory-value`, `stockout-risk` (`dashboard` already filters `stock > 0`, which excludes stock-0 proposals).

Internal/non-user-facing queries (historical-importer dedupe, single-id `findUnique`) are out of scope.

### 6.5 API client + types (`src/lib/api.ts`)
Extend the request-create line input type to allow `{ customItemName, unit }` lines. No change to response types (a proposed item is a normal `Item`).

### 6.6 UI
- **`NewRequestDialog.tsx`:** add a "Can't find it? Request a custom item" affordance below the catalog search — inputs for name (required), unit (default `pcs`), qty, optional note. Adds a visually distinct "Custom" entry to the cart. On submit, custom entries are sent as `{ customItemName, unit, qty }`.
- **"Custom" tag:** the requests API includes a minimal per-line `item: { sourceChannel, active }` select; `RequestDetailDialog.tsx` and `issuance-view.tsx` render a small **"Custom"** tag beside the `FulfillmentBadge` when `line.item?.sourceChannel === 'REQUISITION'` (provenance survives promotion). Helps the admin recognise an off-catalog ask and that approving it adds a catalog item.

## 7. Edge cases / guards
- Custom name required and trimmed; reject empty/whitespace via schema.
- A custom line never reserves stock (item stock is 0) — no over-reservation risk.
- Two identical custom names create two distinct proposed items (no auto-dedupe in v1 — admin reconciles). Stated, not silently handled.
- Reject cleanup only soft-deletes proposals that were never promoted and carry no stock — never touches a real catalog item or one with received stock.
- Promotion is idempotent (`updateMany` guarded by `active:false && sourceChannel:'REQUISITION'`).

## 8. Testing
- **Unit (vitest, pure):** `requestLineInputSchema` — accepts a catalog line, accepts a custom line, rejects a line with neither `itemId` nor `customItemName`, rejects a line with both, rejects empty `customItemName`.
- **Manual e2e:** propose "water bottle" → request is `UNDER_REVIEW`, line `PURCHASE_REQUIRED`, item absent from catalog/alerts/reorder → admin approves → item now `active:true` and visible in catalog, line still `PURCHASE_REQUIRED` → raise PO → GRN → line reserved → `READY_FOR_ISSUE` → issue → `CLOSED`. Confirm a rejected proposal is soft-deleted.
- Route-level integration tests are out of scope (project has no DB integration harness — consistent with the requisition-loop spec).

## 9. Out of scope
- De-duplicating custom requests against existing catalog items.
- Editing a proposed item's details before promotion (admin can edit via normal item edit once promoted).
- Photos/attachments on proposed items.
- A separate "proposed items" review queue (approval of the requisition is the review).
```
