# Operational Intelligence Layer (No Paid AI) — Design

**Date:** 2026-06-23
**Project:** KG Inventra (`Store_KG/source`, Next.js App Router + Prisma/SQLite)
**Scope:** Make KG Inventra **proactive** across six signals — low stock, purchase needs, slow-moving items, excess inventory, consumption trends, supplier performance — using **internal data + rule-based calculation only**. No paid AI/LLM, no external service. **Delivery model: C (hybrid)** — event hooks where natural + an Insights dashboard + a manual recompute trigger (no dependency on a cron/scheduler that may not exist).

---

## 1. What already exists (reuse, don't rebuild)

- **Low stock / auto-reorder:** `src/lib/reorder.ts` (`shouldReorder`/`checkReorder`) fires on stock-out paths; `rop` computed in `api/items`.
- **Purchase needs:** requisition `pendingPurchaseQty` + auto-PO; (a purchase-requirements view is separately designed).
- **Consumption + reports:** `inventory_transactions` ledger (ISSUE/OUT rows); endpoints for stock-out risk, dept/machine consumption, inventory value, **supplier performance**, period comparison, top items, item flow.
- **Alerts:** `Alert` model + `api/alerts` + `alerts-view.tsx`.
- **Documented formulas** in `CLAUDE.md`: `calcROP`, `riskScore`, dead-stock query, margin/shrinkage.

**Genuinely new:** **slow-moving** + **excess inventory** detection (not surfaced today), a consolidated **intelligence module** of pure calculators, an **Insights dashboard**, **alert generation** for actionable signals, and a **manual recompute** trigger.

---

## 2. Module — `src/lib/intelligence/` (pure calculators + thin service)

Pure, unit-testable, zero deps:

- `formulas.ts`
  - `avgDailyConsumption(issuedQtyInWindow, windowDays): number`
  - `daysOfCover(stock, avgDaily): number` (`Infinity` when `avgDaily === 0`)
  - `reorderPoint(avgDaily, leadDays, variabilityPct): number` — `ceil(avgDaily*leadDays + avgDaily*leadDays*(variabilityPct/100)*1.65)` (the `CLAUDE.md` `calcROP`).
  - `consumptionTrend(prevWindowQty, currWindowQty): { direction: 'up'|'down'|'flat'; pct: number }`.
- `classify.ts` — `classifyItem(item, stats, cfg): Signal[]` where `Signal ∈ { LOW_STOCK, SLOW_MOVING, EXCESS, HEALTHY }`:
  - `LOW_STOCK`: `stock - reserved <= reorderPoint` (fallback `minStock` when no consumption history).
  - `SLOW_MOVING`: `avgDaily < cfg.slowDailyThreshold` AND `stock > 0` AND last issue older than `cfg.slowDays`.
  - `EXCESS`: `daysOfCover > cfg.excessDays` OR (`maxStock > 0` AND `stock > maxStock`).
  - else `HEALTHY`.
- `supplier.ts` — `supplierScore(pos): { avgDelayDays, fulfillmentAccuracy, poCount }` (delay = `receivedAt − expectedDeliveryDate`; accuracy = `ΣreceivedQty/Σqty`) — same math as the existing supplier-performance report, centralized.

`config.ts` — one place for thresholds: `windowDays` (e.g. 30), `slowDays` (e.g. 60), `slowDailyThreshold`, `excessDays` (e.g. 180), `variabilityPct` default, `leadDays` default. **Not hardcoded scattered**; later promotable to settings rows.

`engine.ts` (DB service, the only DB-touching file):
- `computeInsights(): Promise<InsightsReport>` — loads active items + their windowed ISSUE transactions + supplier PO/GRN data, runs the pure calculators, returns `{ lowStock[], purchaseNeeds[], slowMoving[], excess[], trends[], suppliers[] }`.
- `generateAlerts(tx): Promise<number>` — for `LOW_STOCK`, `EXCESS`, `SLOW_MOVING` items, upsert `Alert` rows (dedupe by `itemId + type`, refresh stale), returns count raised. Reuses the existing `Alert` model.

---

## 3. Delivery (approach C — hybrid, zero scheduler dependency)

- **Event hook (already partly live):** `checkReorder` on stock-out keeps raising low-stock reorder POs. No new event wiring required for v1.
- **Manual recompute trigger:** `POST /api/intelligence/recompute` (admin / STORE_ADMIN) → runs `computeInsights` + `generateAlerts` in a transaction; returns the report + alert count. Callable from a dashboard button **or** by any external scheduler later — but depends on none.
- **Insights dashboard:** `GET /api/intelligence` → `computeInsights()`; rendered by a new `intelligence-view.tsx` with six panels:
  1. **Low stock** (item, on-hand, reserved, ROP, suggested order qty)
  2. **Purchase needs** (open `pendingPurchaseQty` rollup — reuses requirement data)
  3. **Slow-moving** (item, days since last issue, stock, avg/day)
  4. **Excess inventory** (item, stock, days-of-cover, over-max amount)
  5. **Consumption trends** (top movers + up/down %, from the ledger)
  6. **Supplier scorecard** (avg delay, accuracy, PO count — reuses supplier-performance)

   Panels 1, 2, 5, 6 reuse existing report logic; only 3 (slow-moving) and 4 (excess) are net-new calculators.

---

## 4. Validation / correctness rules

- All signals derive from `inventory_transactions` (OUT/ISSUE) + `Item` fields — **internal data only**.
- `avgDaily === 0` ⇒ `daysOfCover = Infinity` ⇒ candidate for SLOW_MOVING/EXCESS, never a divide-by-zero.
- Alerts are **deduped** (one open alert per item+type); recompute refreshes rather than duplicates.
- `recompute` is role-gated (admin/STORE_ADMIN) and audit-logged via `createAuditLog`.
- Reserved stock is excluded from "available" in low-stock math (`stock − reservedQty`), consistent with `reorder.ts`.

---

## 5. Testing (vitest, pure calculators)

- `formulas.ts`: `avgDailyConsumption`, `daysOfCover` (incl. zero-velocity → Infinity), `reorderPoint` (matches `calcROP`), `consumptionTrend` (up/down/flat + pct).
- `classify.ts`: each signal's boundary (just-below/just-above thresholds; LOW_STOCK fallback to minStock with no history; EXCESS via days-of-cover vs via maxStock).
- `supplier.ts`: delay + accuracy math, empty-PO guard.

---

## 6. Out of scope

- Forecasting / ML / any paid AI.
- Setting up an actual OS-level cron/scheduler (we expose the `recompute` route; wiring it to a scheduler is ops, optional).
- Margin/shrinkage analytics (already documented + reportable — reuse, don't rebuild here).
- Per-item threshold overrides UI (thresholds centralized in `config.ts`; settings-row promotion is a later step).

## 7. Assumptions

- Consumption history lives in `inventory_transactions` with `subType = 'ISSUE'` (OUT) — the windowed source for velocity.
- Thresholds in `config.ts` are sensible defaults (window 30d, slow 60d, excess 180d, variability 20%, lead 7d) and tunable in one place.
- "Purchase needs" reuses the requisition `pendingPurchaseQty` data rather than recomputing demand.
```
