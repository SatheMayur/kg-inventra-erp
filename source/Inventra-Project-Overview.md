# Inventra — Inventory & Stock Operations Platform

**Author:** Mayur Sathe, Developer & Project Lead

## Executive summary
Inventra is a web-based inventory system that tracks stock, requests, issuance, transfers, purchase orders, and audit history in one place. It replaces spreadsheets and manual logs with a single, role-controlled, auditable source of truth.

## Objectives
- Maintain real-time stock accuracy across all items (target: ≥99% vs physical count).
- Cut stock-out incidents on critical items by ≥50% within 3 months.
- Route every stock movement (in/out/transfer/checkout) through one ledger (100% coverage).
- Enforce role-based access on all write actions (0 unauthorized writes).
- Auto-number purchase orders, gate passes, and challans (0 duplicates).
- Raise low-stock/reorder alerts within 1 minute of threshold breach.
- Log every create/update/delete to an audit trail (100% of writes).
- Serve department, item-flow, and inventory-value reports on demand (<2s load).
- Support Excel bulk import with per-row validation (reject bad rows, report why).
- Prevent overselling/double-processing under concurrent use (0 negative-stock events).
- Block server-side requests to internal/private addresses (0 SSRF exposures).
- Pass type-check and build on every release (0 type errors).

## Benefits
**Business**
- Fewer stock-outs and write-offs; faster fulfilment; reliable data for purchasing; lower audit effort.
- ~30–40% less time on manual stock reconciliation.

**Technical / operational**
- One shared stock-mutation path → consistent, race-safe inventory math.
- SSRF guard + role enforcement reduce security exposure.
- Structured errors + audit log speed up incident diagnosis.

## Time savings (assumes 1 store, ~500 SKUs, 2 staff)
| Task | Now | After | Saved/mo | Saved/yr |
|------|-----|-------|----------|----------|
| Stock reconciliation | 8 hrs/wk | 5 hrs/wk | ~12 hrs | ~144 hrs |
| PO + challan + gate-pass paperwork | 5 hrs/wk | 1.5 hrs/wk | ~14 hrs | ~168 hrs |
| Monthly reporting | 6 hrs/mo | 0.5 hrs/mo | ~5.5 hrs | ~66 hrs |
| **Total** | | | **~31 hrs** | **~378 hrs** |

## Requirements — Functional
- Item master: categories, variants, barcodes, tags, custom fields, photos.
- Stock movements: restock (IN), issuance (OUT), transfers, checkouts/returns.
- Request → approve/reject/cancel → issue, with stock reservation.
- Purchase orders, goods receipt, invoices, delivery challans, gate passes.
- Excel bulk import/export with validation.
- Reports: dashboard, stock-out risk, inventory value, department consumption, audit.
- Webhooks + Slack/Teams alerts.

## Requirements — Non-functional
- Report endpoints respond <2s at typical volumes.
- Concurrency-safe stock writes (transactional + optimistic locking).
- Available in business hours; recoverable from backup.
- Scales single-store → multi-store via managed Postgres path.
- Consistent, structured API error handling.

## Data & Integration
- Sources: internal app database (items, transactions, requests, users, audit).
- APIs: internal REST; outbound Slack/Teams webhooks; optional Petpooja PO sync.
- Sync: real-time on action; alerts near-real-time.
- Formats: JSON (API), XLSX (import/export).

## Security & Compliance
- JWT auth + role-based access (admin / employee); admin-only on sensitive writes.
- SSRF protection on all user-supplied outbound URLs.
- Full audit logging of writes (who, what, when).
- Encryption in transit (HTTPS); secrets via environment variables, never sent to clients.

## Resources & Roles
- Full-stack developer (Next.js/Prisma): ~10–12 person-weeks (MVP).
- QA/test: ~2 person-weeks.
- DevOps (deploy, DB, backups): ~1 person-week.

## Author's contributions — Mayur Sathe, Developer & Project Lead
- Lead developer: owns architecture and delivery of the Inventra platform.
- Ran a full security & correctness audit (70+ API routes, 40+ views).
- Fixed 6 critical bugs: PO-receipt double-stock race, checkout/return not moving stock, SSRF in webhooks/integrations, broken delete operations, async-param routing faults.
- Built shared helpers (`mutateStock`, `releaseReservation`, SSRF `assertSafeUrl`) to remove duplicated, divergent stock logic.
- Hardened auth/role checks and input validation across imports, invoices, gate passes, pick lists.
- Verified all changes via type-check and committed them with documented rationale.

## Timeline
- MVP (core inventory + requests + reporting): 8–12 weeks.
- Beta (integrations, hardening, UAT): 3–4 weeks.
- Rollout (training, production deploy): 2 weeks.

## Risks & Mitigation
- Data accuracy drift → all movements through one ledger + periodic physical counts.
- Concurrency errors at scale → transactional writes + migrate SQLite→Postgres before multi-store.
- Adoption resistance → simple UI, role-based views, short training.

## Next steps
- Approve scope; confirm single-store vs multi-store target.
- Finish deferred report fixes (price-at-time, timezone); plan Postgres migration.
- Schedule UAT with store staff.

## Assumptions
- Tech stack: Next.js (App Router) + Prisma + SQLite (Postgres for scale).
- Volume figures (1 store, ~500 SKUs, 2 staff) and time savings are illustrative — swap in actuals.
- Project name "Inventra" taken from the codebase.
