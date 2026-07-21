# Daily Procurement Master-Data Overhaul — Plan & Handoff

Living handoff doc so any fresh coding session can continue without re-investigating.
Original spec: rebuild the "Add Daily Procurement Item" flow into proper master-data
governance (Quick Add vs Advanced, duplicate/alias prevention, unit master + conversions,
category defaults, canonical itemNature, quality specs, vendor eligibility, pricing-mode
workflow, location applicability, planning/receiving rules, review workflow).

## App under change
**Inventra = `source/`** (Next.js 16, Prisma + SQLite, vitest). This is NOT the `backend/`
Express/knex app (that one got an unrelated code-review pass, committed separately).

## Status
Branch: `code-review-and-daily-procurement-fixes`
- ✅ **Phase 2** (commit `26d6472`) — cross-category + alias-aware duplicate detection
  (`findItemDuplicateMatches` scores item name AND aliases across all categories).
- ✅ **Phase 3** (commit `26d6472`) — canonical `itemNature`; `perishable` derived on every
  create/update (self-heals drift); redundant UI Perishable toggle removed.
- ✅ Backend code-review fixes (commit `8a62b37`) — separate `backend/` app, unrelated.
- ⏭️ **NEXT: Phase 4.**

## Conventions (must follow — see `source/CLAUDE.md`)
- Think before coding; simplicity; **surgical changes**; **test-first (red → green)**.
- DB is **SQLite via `prisma db push`** (NO migration history). Add columns **nullable + backfill**;
  **no destructive drops** — deprecate a column (keep it populated) rather than remove it.
- "Enums" are `String` columns + Zod unions (const arrays in `src/lib/item-master.ts`); the schema
  defines **zero Prisma enums** — match that pattern.
- Permissions are enforced **server-side** in API routes via helpers in `item-master.ts` /
  `daily-procurement.ts`; custom JWT (`src/lib/jwt.ts`, middleware `src/proxy.ts`).

## Verify
- `npm test` (= `vitest run`) — API-route tests run against `prisma/test.db`.
- `npx tsc --noEmit` — vitest does NOT type-check, so run tsc separately.

## Key files
- Data model: `source/prisma/schema.prisma` — `Item` (~L58), `ItemAlias` (~L766, generic single
  `aliasText` + `sourceType` + optional `vendorId`), `ItemCategory` (~L45, only `procurementType`),
  `Supplier` (~L155, single `Item.preferredSupplierId` string — no mapping table).
- Item service / permissions / duplicate detection: `source/src/lib/item-master.ts`
- Zod validation: `source/src/lib/validation.ts`
- Item APIs: `source/src/app/api/items/route.ts`, `items/[id]/route.ts`, `items/daily-import/route.ts`
- Daily procurement: `source/src/lib/daily-procurement.ts` (has `canonicalUnit`/`UNIT_ALIASES`,
  used only for quote normalization today), `source/src/app/api/daily-procurement/**`
- UI: `source/src/components/procurement/DailyProcurementPanel.tsx` (Quick Add / Add New / Import dialogs)
- Tests to extend: `source/src/lib/daily-item-master-api.test.ts`

## Remaining phases
- **Phase 4 — Unit Master + conversions (§4, §5).** Canonicalize units at item creation (reuse
  `canonicalUnit` from `daily-procurement.ts`); introduce a Unit lookup; conversion rules
  (fixed / variable-weight / pack / none). Today units are free-text on `Item` and `unitConversion`
  is a scalar Float.
- **Phase 5 — masterStatus workflow (§14).** Add String status
  `DRAFT|PENDING_REVIEW|APPROVED|REJECTED|INACTIVE` + review screen. Today only `requiresMasterReview`
  bool + `active`. NOTE: `isDailyProcurementEligibleItem` ignores `requiresMasterReview` by design
  (Quick Add items are usable immediately but flagged) — keep that behavior.
- **Phase 6 — Category defaults (§6).** Add config fields to `ItemCategory` (default unit / itemNature /
  pricingMode / flags) + apply-on-category-select, override-with-reason. `ItemCategory` is not linked to
  `Item` (category is a free string) — decide whether to keep string + defaults lookup, or add a relation.
- **Phase 7 — Multilingual aliases + structured quality specs (§3, §8).** EXTEND the existing `ItemAlias`
  model (add language / richer sourceType taxonomy) — do NOT build a second alias system. Replace the
  `qualityGradeEnabled` boolean with structured grades + templates.
- **Phase 8 — Vendor eligibility, pricing-mode workflow, location, planning, receiving (§9–§13).** Largest:
  new Supplier↔Item mapping model (priority/preferred/vendor unit/MOQ/lead time/rate mode/contract ref/
  quality/delivery locations); Location model + item-location join; pricing-mode state machine that drives
  workflow (today `pricingMode` is persisted but display-only). Keep `preferredSupplierId` readable during transition.

## Open decisions carried forward
- Phase 2 left cross-category exact-name as a **soft** suggestion; revisit **hard-blocking** after Phase 5
  (`masterStatus`) lands.
- PATCH duplicate check (`items/[id]/route.ts`) is weaker than POST (exact/case-sensitive, no fuzzy) —
  harden in a later phase.

## Kickoff prompt for the next session
> Continue the Inventra Daily Procurement master-data work on branch
> `code-review-and-daily-procurement-fixes`. Read `source/docs/daily-procurement-master-data-plan.md`
> first. Phases 2–3 are done; implement **Phase 4 (Unit Master + conversions)** test-first per
> `source/CLAUDE.md`.
