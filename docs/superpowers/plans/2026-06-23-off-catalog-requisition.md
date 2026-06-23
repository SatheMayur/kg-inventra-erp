# Off-Catalog (Custom) Requisition Items — Implementation Plan

> Executes spec `docs/superpowers/specs/2026-06-23-off-catalog-requisition-design.md` (Approach B: proposed `Item` flagged `active:false`/`sourceChannel:'REQUISITION'`, promote-on-approval, hidden until promoted). Each task: run `npm run test` (lib tests stay green) + `npx tsc --noEmit` (only the task's files must be clean — repo has unrelated prior WIP). Commit each task's files individually; never `git add -A`.

**Stack:** Next.js App Router routes, Prisma + SQLite, vitest (`src/**/*.test.ts`, `@`→`src`), TS strict. **No schema migration.**

## Constants
- Proposed item marker: `active: false` + `sourceChannel: 'REQUISITION'`.
- Proposed item defaults: `stock:0, reservedQty:0, reorderQty:0, price:0, category:'Custom Request'`, `unit` from input, `createdBy` = requester id.

---

### Task 1: Validation — custom-or-catalog line schema

**Files:** Modify `src/lib/validation.ts`; create `src/lib/validation.test.ts`.

- **Step 1 (test first):** write `src/lib/validation.test.ts` covering `requestLineInputSchema`:
  - accepts `{ itemId: 'i1', qty: 2 }`
  - accepts `{ customItemName: 'Water Bottle', unit: 'pcs', qty: 1 }`
  - accepts custom line without `unit` (defaults applied / optional)
  - rejects `{ qty: 1 }` (neither itemId nor customItemName)
  - rejects `{ itemId: 'i1', customItemName: 'x', qty: 1 }` (both)
  - rejects `{ customItemName: '   ', qty: 1 }` (blank name) and `qty: 0`
- **Step 2:** run test → fails.
- **Step 3:** rewrite `requestLineInputSchema`:
  ```ts
  export const requestLineInputSchema = z.object({
    itemId: z.string().min(1).optional(),
    customItemName: z.string().trim().min(1).max(120).optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    qty: z.number().int().min(1, 'Quantity must be at least 1'),
  }).refine(
    (l) => (l.itemId ? 1 : 0) + (l.customItemName ? 1 : 0) === 1,
    { message: 'Each line must have either itemId or customItemName, not both' },
  );
  ```
- **Step 4:** run test → passes.
- **Commit:** `feat(validation): allow custom (off-catalog) requisition lines`

---

### Task 2: Create route — materialize proposed items

**Files:** Modify `src/app/api/requests/route.ts`.

- **Step 1:** read the current POST; locate the `normalized.lines` parse and the `qtyByItem`/per-item loop.
- **Step 2:** immediately inside the `$transaction`, before `qtyByItem` is built, materialize custom lines: for each parsed line with `customItemName`, `tx.item.create` a proposed item (Constants above) and replace that line's identity with the new `itemId` (build a working line array where every line has a real `itemId` and the custom name is preserved for `itemName`). Catalog lines pass through untouched.
- **Step 3:** ensure the downstream item lookup uses the proposed item (it will: stock 0 → Case 2 `PURCHASE_REQUIRED`, `pendingPurchaseQty = qty`, `availableQty = 0`, no reservation). Set `itemName` to the custom name (already the created item's `name`).
- **Step 4:** `npx tsc --noEmit` clean on this file.
- **Manual:** propose a custom item via API → request `UNDER_REVIEW`, line `PURCHASE_REQUIRED`; item row exists `active:false`.
- **Commit:** `feat(requests): create proposed Item for off-catalog requisition lines`

---

### Task 3: Approve route — promote on approve, clean up on reject

**Files:** Modify `src/app/api/requests/[id]/approve/route.ts`.

- **Step 1:** in the approve branch (after the line update), promote: `await tx.item.updateMany({ where: { id: line.itemId, active: false, sourceChannel: 'REQUISITION' }, data: { active: true } })`.
- **Step 2:** in the reject branch (`approvedQty <= 0`), after the line update, cleanup: `await tx.item.updateMany({ where: { id: line.itemId, active: false, sourceChannel: 'REQUISITION', stock: 0 }, data: { deletedAt: new Date() } })`.
- **Step 3:** `npx tsc --noEmit` clean.
- **Manual:** approve a custom line → item `active:true`; reject another → item `deletedAt` set.
- **Commit:** `feat(approve): promote proposed items on approval; clean up rejected proposals`

---

### Task 4: Segregation — hide proposed items from user-facing surfaces

**Files (add `active: true` to the Item query `where`):**
- `src/app/api/items/route.ts` (GET list — the requisition picker source) — **primary**.
- `src/lib/alert-runner.ts:11`; `src/app/api/alerts/route.ts:13`.
- `src/app/api/command/route.ts:19,51`.
- `src/lib/reorder.ts` (checkReorder candidate query).
- `src/app/api/reporting/inventory-value/route.ts:11`; `src/app/api/reporting/stockout-risk/route.ts:14`.

- **Step 1:** for each, read the query and add `active: true` alongside `deletedAt: null` (keep existing clauses). For `items/route.ts` confirm the `where` builder and add it there.
- **Step 2:** `npx tsc --noEmit` clean on touched files; `npm run test` green.
- **Manual:** a proposed item does not appear in the item list, low-stock alerts, command search, or reorder candidates; appears in the catalog only after promotion.
- **Commit:** `fix(items): exclude proposed (inactive) items from user-facing item surfaces`

---

### Task 5: API client + types

**Files:** Modify `src/lib/api.ts`.

- **Step 1:** extend the request-create line input type so a line is `{ itemId: string; qty: number } | { customItemName: string; unit?: string; qty: number }` (or `itemId?`, `customItemName?`, `unit?`, `qty` to match the schema). Update `api.requests.create` payload typing.
- **Step 2:** `npx tsc --noEmit` clean.
- **Commit:** `feat(api): typed off-catalog line input for request create`

---

### Task 6: UI — custom-item affordance in NewRequestDialog

**Files:** Modify `src/components/requests/NewRequestDialog.tsx`.

- **Step 1:** add local state for a custom entry (`customName`, `customUnit` default `pcs`, `customQty`, optional uses existing note). Add a "Can't find it? Request a custom item" section under the catalog search with inputs + an "Add custom item" button.
- **Step 2:** extend the cart model to hold custom entries (e.g. `CartItem` gains an optional `custom?: { name; unit }` and `item?` becomes optional, or a discriminated union). Render custom entries with a distinct "Custom" tag.
- **Step 3:** in `handleCreateRequest`, map custom entries to `{ customItemName, unit, qty }` and catalog entries to `{ itemId, qty }` in the `lines` payload.
- **Step 4:** `npx tsc --noEmit` clean on this file.
- **Manual:** add a custom "water bottle" + a catalog item in one request; confirm both submit and the request is created.
- **Commit:** `feat(ui): request off-catalog custom items from the new-request dialog`

---

### Task 7: UI — "Custom" tag on proposed lines

**Files:** Modify `src/app/api/requests/route.ts` (GET) + the request flatten/list query to `include` per-line `item: { select: { sourceChannel: true, active: true } }`; `src/components/requests/RequestDetailDialog.tsx`; `src/components/views/issuance-view.tsx`.

- **Step 1:** ensure the requests list/detail query includes the minimal per-line item select (check `flattenRequest` passes it through; expose `line.item?.sourceChannel`).
- **Step 2:** in `RequestDetailDialog` line rows and `issuance-view` allocation rows, render a small **"Custom"** badge when `line.item?.sourceChannel === 'REQUISITION'`, beside the existing status/`FulfillmentBadge`.
- **Step 3:** `npx tsc --noEmit` clean on touched files.
- **Commit:** `feat(ui): mark off-catalog (custom) requisition lines`

---

## Whole-feature verification
- `npm run test` — all green (validation tests + existing suite).
- `npx tsc --noEmit` — no new errors in touched files.
- Manual e2e (spec §8): propose → approve(promote) → PO → GRN → reserve → issue; rejected proposal soft-deleted; proposed item hidden pre-promotion.
