# Off-Catalog Requisitions — uncommitted edits in prior-WIP files

These feature edits were **applied to the working tree** but **not committed**, because each
file also contains unrelated prior WIP that can't be isolated from these lines non-interactively
(`git add -p` is unavailable in the build environment). They are recorded here exactly so they
can be verified or re-applied after the surrounding WIP is committed.

All edits are verified `tsc`-clean and covered by `npm run test` (91 passing). Committed parts of
this feature: validation, create route, approve route, reporting segregation, categories leak fix
(see `git log`). Spec: `docs/superpowers/specs/2026-06-23-off-catalog-requisition-design.md`.

---

## 1. `src/lib/api.ts` — request-create line type (Task 5)
```diff
-      lines?: Array<{ itemId: string; qty: number }>
+      lines?: Array<{ itemId: string; qty: number } | { customItemName: string; unit?: string; qty: number }>
```

## 2. `src/components/requests/NewRequestDialog.tsx` — custom-item UI (Task 6)
- `CartItem` interface now: `{ key: string; item?: ItemResponse; custom?: { name: string; unit: string }; qty: number }`.
- New state: `customName`, `customUnit` (default `'pcs'`), `customQty`; reset on dialog close.
- `getAvailableStock`: `cart.find((c) => c.item?.id === item.id)` (was `c.item.id`).
- `handleAddToCart`: matches on `c.item?.id`; pushes `{ key: \`cat:${id}\`, item, qty }`.
- New `handleAddCustom()`: validates name+qty, pushes `{ key: \`custom:${name}:${i}:${Date.now()}\`, custom: { name, unit }, qty }`.
- `handleRemoveFromCart(key)`: filters by `c.key` (was `c.item.id`).
- `handleCreateRequest` lines map: `c.item ? { itemId: c.item.id, qty } : { customItemName: c.custom!.name, unit: c.custom!.unit, qty }`.
- New UI panel "Can't find it? Request a custom item" (name / unit / qty + Add) above the cart separator.
- Cart row renders `key={c.key}`, shows a **New / Custom (Purchase Required)** marker for `!c.item` entries.

## 3. Segregation filter — exclude proposed (`active:false`) items (Task 4)
Add `active: true` to the user-facing item queries:

- `src/app/api/items/route.ts` — GET `where: Prisma.ItemWhereInput`: add `active: true` (next to `deletedAt: null`).
- `src/app/api/alerts/route.ts` — `db.item.findMany({ where: { deletedAt: null, active: true } })`.
- `src/lib/alert-runner.ts` — `db.item.findMany({ where: { deletedAt: null, active: true } })`.
- `src/app/api/command/route.ts` — both `db.item.findMany({ where: { deletedAt: null, active: true }, take: 1000 })`.
- `src/lib/reorder.ts` — guard: `if (!item || item.deletedAt || !item.active) return`.

## 4. WhatsApp name-lookup leak fix
Add `active: true` so inbound matching can't hit an unpromoted proposal:

- `src/app/api/v1/wa/inbound/route.ts` — both `where: { name: parseResult.item_name, deletedAt: null, active: true }`.
- `src/app/api/integrations/whatsapp/route.ts` — both `where: { name: parseResult.item_name, deletedAt: null, active: true }`.
- `src/lib/whatsapp-parser.ts` — `db.item.findMany({ where: { deletedAt: null, active: true }, select: { name: true } })`.

---

### How to commit cleanly later
After committing your own WIP in these files, the lines above are already in the tree — just
`git add` each file. If you ever revert one of these files, re-apply from this record.
