# Inventra — Business Asset Overview

**Asset owner:** Mayur Sathe, Developer & Project Lead
**What it is:** A web-based inventory system that is the single, role-controlled, auditable source of truth for stock, requests, issuance, transfers, purchase orders, and history — replacing spreadsheets and manual logs.

> Treated as a business asset, not a project: it runs continuously, has one accountable owner, and is judged by money and risk outcomes reviewed monthly — not by features shipped.

## Value scorecard (review monthly)
| # | Outcome metric | Baseline | Target | Owner |
|---|----------------|----------|--------|-------|
| 1 | Working capital tied in stock (₹) | measure (TBD) | −15% in 6 mo | Owner + Purchasing |
| 2 | Shrinkage / write-off rate (% of stock value) | measure (TBD) | <2% | Owner |
| 3 | Stock-out rate on critical items (%) | measure (TBD) | −50% in 3 mo | Owner |
| 4 | Stock accuracy (system vs physical count) | measure (TBD) | ≥99% | Owner |
| 5 | Staff hours on manual stock admin | ~19 hrs/wk | ~7 hrs/wk | Owner |
| 6 | Reorder decision latency (low → PO placed) | measure (TBD) | <1 business day | Purchasing |

*Baselines must be measured for ~2 weeks before improvement is claimed.*

## Financial impact
- **Labor reclaimed:** ~31 hrs/mo (~378 hrs/yr). At an assumed ₹300/hr loaded cost ≈ **₹113k/yr** freed.
- **Working capital:** faster stock-turns release cash currently locked in slow/excess stock.
- **Loss avoided:** lower shrinkage and fewer stock-outs convert directly to retained margin.
- **Audit effort:** complete write-level audit trail cuts reconciliation and compliance time.

## Outcomes it drives (why it matters)
- Reliable numbers → better purchasing → less cash locked in stock.
- Fewer stock-outs → fewer lost sales and rush orders.
- Lower shrinkage → retained margin.
- Faster, traceable decisions → less firefighting.

## Capabilities (the enablers behind the outcomes)
- Item master: categories, variants, barcodes, tags, custom fields, photos.
- Stock movements through one ledger: restock (IN), issuance (OUT), transfers, checkouts/returns.
- Request → approve/reject/cancel → issue, with stock reservation.
- Purchase orders, goods receipt, invoices, delivery challans, gate passes (auto-numbered).
- Excel bulk import/export with per-row validation.
- Reports: dashboard, stock-out risk, inventory value, department consumption, audit.
- Low-stock alerts via webhooks + Slack/Teams.

## Requirements (concise)
- **Non-functional:** reports <2s; concurrency-safe transactional stock writes; business-hours availability + backup recovery; scales single→multi-store via Postgres.
- **Data & integration:** internal DB (items, transactions, requests, users, audit); REST + Slack/Teams webhooks; optional Petpooja PO sync; JSON + XLSX.
- **Security & compliance:** JWT + role-based access (admin/employee), admin-only on sensitive writes; SSRF protection on outbound URLs; full audit logging; HTTPS; secrets in env vars.

## Run cost & ROI
- **Build (MVP):** ~10–12 dev person-weeks + ~2 QA + ~1 DevOps.
- **Run:** hosting + maintenance + deferred fixes (report price-at-time, timezone, perf, UI dedup).
- **ROI test:** monthly value from scorecard (capital freed + loss avoided + labor saved) vs run cost. Asset is "earning" only while the scorecard improves.

## Risks & mitigation
- Data accuracy drift → all movements through one ledger + periodic physical counts.
- Concurrency errors at scale → transactional writes + migrate SQLite→Postgres before multi-store.
- Adoption resistance → simple UI, role-based views, short training.

## Author's contributions — Mayur Sathe, Developer & Project Lead
- Lead developer: owns architecture, delivery, and ongoing health of the asset.
- Full security & correctness audit (70+ API routes, 40+ views).
- Fixed 6 critical bugs: PO-receipt double-stock race, checkout/return not moving stock, SSRF in webhooks/integrations, broken delete operations, async-param routing faults.
- Built shared helpers (`mutateStock`, `releaseReservation`, SSRF `assertSafeUrl`) removing duplicated stock logic.
- Hardened auth/role checks and input validation across imports, invoices, gate passes, pick lists.

## Next steps
- Measure the 6 baselines (2 weeks) so improvement is provable.
- Assign the monthly scorecard review to the asset owner.
- Finish deferred report fixes (price-at-time, timezone) + plan Postgres migration.

## Assumptions
- Tech stack: Next.js (App Router) + Prisma + SQLite (Postgres for scale).
- ₹300/hr loaded labor cost and volume figures (1 store, ~500 SKUs, 2 staff) are illustrative — replace with actuals.
- Project name "Inventra" taken from the codebase.
