# KG_inventra — Store Management Module Design

> Material lifecycle blueprint: Item → Requisition → Stock Check → PO → Goods Receipt/Invoice → Issue/Transfer → Stock Ledger → Reports & Alerts.
> Grounded in the existing codebase (`prisma/schema.prisma`, `src/lib/*`, `src/app/api/*`, `src/components/views/*`).
> Related narrow build spec: `docs/superpowers/specs/2026-06-09-inventra-gaps-design.md`.
> Status legend: 🟢 mostly built · 🟡 partial · 🔴 weak/missing.

## Locked decisions (this revision)

1. **Requisition = full header + lines split** (`Request` + `RequestLine`). Enables multi-item carts, partial fulfillment, and pending balance.
2. **RBAC = migrate `User.role` to the 6-role enum now** and enforce in the API layer (not just UI).
3. This document is the source-of-truth blueprint; implementation is phased per §10.

---

## 0. What exists vs. what's missing

Most of the lifecycle is already implemented. The work is to **fill gaps**, not rebuild.

| Lifecycle stage | Status | Already built | Key gaps to add |
|---|---|---|---|
| 1. Item Master | 🟡 | `Item` model, `/api/items`, `inventory-view`, barcode (`barcode-listener`, `QRCodeDialog`), variants, images, tags, `customFields` | `itemCode`, `hsnCode`, `gstRate`, `maxStock`, `storageLocation`, `description`, explicit `active` flag |
| 2. Requisition | 🟡 | `Request` model, `/api/requests` + approve/reject/cancel/ready/issue, `requests-view`, `reservedQty` hold | Header+lines split; `requestedQty/approvedQty/issuedQty`; `requiredDate`; `machine`/cost-center; `PartiallyIssued` status |
| 3. Purchase Order | 🟢 | `PurchaseOrder` + `POItem` (`receivedQty` already supports partial receipt), approve route, auto-PO via `reorder.ts`, `procurement-view` | Per-line `discount`/`taxRate`; requisition→PO link; `PENDING_APPROVAL`/`APPROVED`/`PARTIALLY_RECEIVED` statuses |
| 4. Goods Receipt / Invoice | 🟢 | `DeliveryChallan` (GRN), `PurchaseInvoice`, `InvoiceIntake` (OCR via `gemini-invoice`), `three-way-match.ts`, `/po/[id]/receive` → stock IN | Per-line `acceptedQty`/`rejectedQty` (`ChallanItem`), `paymentMode`, `transportCharges`, tax breakup, scan URL |
| 5. Issue / Transfer | 🟢 | `/requests/[id]/issue`, `issuance-view`, `StockTransfer` (location→location), `GatePass` (receiverName) | Partial issue + pending balance (depends on #2) |
| 6. Stock Ledger | 🟢 | `Transaction` (IN/OUT), `mutateStock()` single source of truth + optimistic lock, `transactions-view` | Movement `subType` (OPENING/PURCHASE/TRANSFER_IN/ISSUE/TRANSFER_OUT/RETURN/ADJUST); optional stored running balance |
| Audit | 🟢 | `AuditLog`, `lib/audit.ts` | Broaden action enum |
| Alerts | 🟢 | `/api/alerts`, `alerts-view`, `notifications`, `mailer/slack/teams/webhook-dispatcher` | Aging alerts (pending req / overdue PO) |
| Reports | 🟢 | dept-consumption, supplier-performance, stockout-risk, inventory-value, top-items, item-flow, period-comparison, audit, dashboard | Machine/cost-center consumption, last/avg purchase rate, pending-req, pending-PO |
| RBAC | 🔴 | `role=admin\|employee` + `isDeptHead` | 6-role enum + API enforcement |

**Three biggest gaps:** (A) requisition partial fulfillment, (B) ledger movement subtypes, (C) 6-role RBAC. The rest are field additions.

---

## 1. Feature list

**Core (lifecycle)**
- Item master CRUD + soft-delete, barcode/QR scan + label print
- Department requisition: multi-line, partial fulfillment, pending balance
- Live stock check at request time (reserved-aware: `stock − reservedQty`)
- Approval / rejection / partial / pending tracking
- Auto-PO when `stock ≤ minStock` (reorder engine exists)
- PO: vendor, line qty/rate/discount/tax, delivery date, approval, partial receipt
- Goods receipt (challan) + purchase invoice + OCR intake + 3-way match
- Stock IN only on receipt confirm; stock OUT only on issue confirm
- Issue/transfer to department: full/partial, receiver, acknowledgement, gate pass
- Full stock ledger per item (opening/purchase/transfer/issue/adjust/return/balance)

**Supporting**
- Low-stock + out-of-stock alerts (email/Slack/Teams already wired)
- Pending requisition + pending PO tracking
- Vendor purchase history, last purchase rate, average purchase rate
- Department-wise + machine/cost-center-wise consumption
- Audit trail on every write
- 6-role RBAC
- Management dashboards, Excel import/export

---

## 2. User workflow (lifecycle spine)

```
[Store Admin] creates Item  ──────────────────────────────────┐
                                                               ▼
[Dept User] raises Requisition  ──►  live stock shown (stock − reserved)
                                                               │
                          ┌────────────────────────────────────┤
                          ▼                                     ▼
              stock available                          stock short / ≤ min
                          │                                     │
[Dept Head] Approve ──────┤                          [Purchase User] makes PR/PO
   (reserves qty)         │                                     │
                          │                          [Dept Head/Mgmt] Approve PO
                          │                                     │
                          │                          Vendor ships ──► Goods Receipt
                          │                          (Challan): accepted/rejected qty
                          │                                     │
                          │                          [Accounts] verify Invoice (3-way match)
                          │                                     │
                          │                          Stock IN  ◄─┘ (Transaction IN / PURCHASE)
                          ▼                                     │
[Store Admin] Issue to dept ◄────────────────────────────────┘
   full or partial → pending balance stays open
   Stock OUT (Transaction OUT / ISSUE)
                          │
[Dept User] Acknowledge receipt (receiver name, date)
                          │
                          ▼
        Stock Ledger updated  ──►  Reports + Alerts + Dashboards
```

Per-role daily flow:
- **Dept User:** raise request → track status → acknowledge on receipt.
- **Dept Head:** approve/reject pending requests for own department.
- **Store Admin:** receive goods, issue material, adjust stock, manage items.
- **Purchase User:** see shortfalls → create PO → track delivery.
- **Accounts User:** verify invoice vs PO vs GRN → mark payment.
- **Management:** dashboards only, no edits.

---

## 3. Screen-wise module design

Reuse existing views; extend/add where marked.

| Screen | File | Key elements |
|---|---|---|
| Item Master | `inventory-view.tsx` (extend) | Table + filters; add itemCode, HSN, GST%, maxStock, location, description, active toggle; barcode/QR print (exists). |
| Requisition | `requests-view.tsx` (rework) | Multi-line cart: item picker showing live `available = stock − reserved`, qty, requiredDate, machine/cost-center, remarks; status chips. |
| Approvals | within `requests-view` | Dept-Head queue: Approve / Reject / Approve-partial (per-line `approvedQty`). |
| Procurement / PO | `procurement-view.tsx` (extend) | Shortfall list → Create PO; vendor select, line qty/rate/discount/tax, delivery date; submit for approval; partial-receipt progress. |
| Goods Receipt | extend `procurement` or new `goods-receipt-view` | Against PO: per-line received/accepted/rejected qty; attach scanned invoice; transport charges; confirm → stock IN. |
| Invoice / Accounts | `invoice-intakes` + new accounts screen | OCR intake review, 3-way-match result, paymentMode, mark PAID. |
| Issuance | `issuance-view.tsx` (extend) | Approved-request queue; full/partial issue; receiver name; gate pass; pending balance shown. |
| Stock Ledger | `transactions-view.tsx` (extend) | Per-item ledger: opening, IN/OUT by subtype, running balance, reference, user, date. |
| Alerts | `alerts-view.tsx` | Low / out-of-stock / pending req / pending PO tabs. |
| Reports | `reporting-view.tsx` | All reports in §7. |
| Dashboard | `dashboard-view.tsx` | Management KPIs (stock health, pending, consumption, spend). |
| Admin/Users | `users-view.tsx`, `settings-view.tsx` | 6-role assignment, feature flags. |

**UX rules for non-technical staff:** one primary action per screen; big color-coded status chips; step labels ("Step 2 of 3"); scan-to-fill inputs; confirm dialogs on every stock-affecting action; plain bilingual labels.

---

## 4. Database schema changes

Existing models are kept. Changes below.

### Item — add columns
```prisma
itemCode        String?  @unique   // human code e.g. ITM-0001 (auto-gen)
description     String?
hsnCode         String?
gstRate         Float    @default(0)
maxStock        Int      @default(0)
storageLocation String?            // promote from loose `folder`
active          Boolean  @default(true)
```

### Requisition — header + lines split (locked decision)
```prisma
model Request {            // header
  id          String   @id @default(cuid())
  userId      String
  employee    String
  department  String
  status      String   @default("Pending") // Pending | Approved | PartiallyIssued | Issued | Rejected | Cancelled
  requiredDate DateTime?
  machine     String?    // machine / cost-center
  note        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id])
  lines       RequestLine[]
  gatePasses  GatePass[]
  @@index([status, createdAt])
  @@index([userId, createdAt])
}

model RequestLine {
  id           String @id @default(cuid())
  requestId    String
  itemId       String
  itemName     String
  requestedQty Int
  approvedQty  Int    @default(0)
  issuedQty    Int    @default(0)   // pendingBalance = approvedQty − issuedQty
  status       String @default("Pending")
  request      Request @relation(fields: [requestId], references: [id], onDelete: Cascade)
  item         Item    @relation(fields: [itemId], references: [id])
  @@index([requestId])
  @@index([itemId])
}
```

### POItem — add
```prisma
discount Float @default(0)
taxRate  Float @default(0)
```
Add PO statuses: `PENDING_APPROVAL`, `APPROVED`, `PARTIALLY_RECEIVED` alongside existing `DRAFT|SENT|RECEIVED|CANCELLED`.

### Goods Receipt line detail — new model
```prisma
model ChallanItem {
  id          String @id @default(cuid())
  challanId   String
  poItemId    String
  itemId      String
  receivedQty Int
  acceptedQty Int
  rejectedQty Int
}
```

### PurchaseInvoice — add
```prisma
paymentMode      String?
transportCharges Float   @default(0)
discount         Float   @default(0)
taxAmount        Float   @default(0)
scanUrl          String?
```

### Transaction — add movement subtype (gap B)
```prisma
subType      String @default("ADJUST")
// OPENING | PURCHASE | TRANSFER_IN | ISSUE | TRANSFER_OUT | RETURN | ADJUST
balanceAfter Int?  // optional stored running balance
```
Thread `subType` through `mutateStock()` so every ledger row is classified.

### User — migrate role enum (locked decision, gap C)
```prisma
role String @default("DEPT_USER")
// STORE_ADMIN | DEPT_USER | DEPT_HEAD | PURCHASE_USER | ACCOUNTS_USER | MANAGEMENT
```
Migration mapping: `admin → STORE_ADMIN`; `employee + isDeptHead=true → DEPT_HEAD`; `employee → DEPT_USER`. Assign PURCHASE_USER / ACCOUNTS_USER / MANAGEMENT manually after migration.

---

## 5. Status flow

**Requisition (line-level rolls up to header)**
```
Pending ─approve→ Approved ─issue(part)→ PartiallyIssued ─issue(rest)→ Issued
   │                  │
   └─reject→ Rejected └─cancel→ Cancelled
```

**Purchase Order**
```
DRAFT ─submit→ PENDING_APPROVAL ─approve→ APPROVED ─send→ SENT
SENT ─receive(part)→ PARTIALLY_RECEIVED ─receive(rest)→ RECEIVED
any ─cancel→ CANCELLED
```

**Goods Receipt (Challan):** `PENDING → CONFIRMED` (confirm = stock IN, accepted qty only).
**Invoice:** `PENDING → VERIFIED (3-way match) → UNPAID → PAID` (or `CANCELLED`).
**InvoiceIntake (exists):** validation `READY_FOR_STOCK | WARNING_RETAINED | REJECTED_MATH_ERROR`; review `PENDING | AUTO_POSTED | NEEDS_REVIEW | REJECTED | RESOLVED`.
**Stock Transfer:** `DRAFT → CONFIRMED → RECONCILED`.

---

## 6. Permission matrix

Enforce in the API layer (`lib/api-utils`, `lib/auth-server`), not just UI.

| Action | Store Admin | Dept User | Dept Head | Purchase | Accounts | Mgmt |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Item master CRUD | ✅ | 👁 | 👁 | 👁 | 👁 | 👁 |
| Raise requisition | ✅ | ✅ | ✅ | — | — | — |
| Approve/reject requisition | ✅ | — | ✅ (own dept) | — | — | — |
| Create / edit PO | ✅ | — | — | ✅ | — | 👁 |
| Approve PO | ✅ | — | ✅* | — | — | ✅* |
| Goods receipt (GRN) | ✅ | — | — | ✅ | — | 👁 |
| Verify invoice / payment | 👁 | — | — | — | ✅ | 👁 |
| Issue / transfer material | ✅ | — | — | — | — | — |
| Acknowledge receipt | — | ✅ | ✅ | — | — | — |
| Stock adjustment | ✅ | — | — | — | — | — |
| Vendor master | ✅ | — | — | ✅ | 👁 | 👁 |
| Reports / dashboard | ✅ | 👁 own | 👁 dept | ✅ | ✅ | ✅ |
| User mgmt / settings | ✅ | — | — | — | — | — |

✅ full · 👁 view · — none · * approval thresholds configurable.

---

## 7. Reports required

| Report | Source (exists?) |
|---|---|
| Current stock + valuation | `inventory-value` ✅ |
| Low / out-of-stock | `stockout-risk` ✅ + alerts |
| Stock ledger / item flow | `item-flow` ✅ (extend with subtype) |
| Pending requisitions | new (Request status ≠ Issued) |
| Pending POs / partial receipts | new (PO status SENT / PARTIALLY_RECEIVED) |
| Department-wise consumption | `department-consumption` ✅ |
| Machine / cost-center consumption | new (needs `Request.machine`) |
| Vendor purchase history | `supplier-performance` ✅ (extend) |
| Last purchase rate / Avg purchase rate | new (from `POItem.unitPrice`) |
| Top items | `top-items` ✅ |
| Period comparison | `period-comparison` ✅ |
| Audit trail | `reporting/audit` ✅ |
| Management dashboard (MIS) | `reporting/dashboard` ✅ |

---

## 8. Alerts required

- **Low stock:** `stock ≤ minStock` → Store Admin + Purchase (drives auto-PO via `reorder.ts`).
- **Out of stock:** `stock = 0` → high priority.
- **Pending requisition aging:** approved-but-not-issued > N days → Store Admin.
- **Pending PO:** sent-but-not-received past `expectedDeliveryDate` → Purchase.
- **Invoice mismatch:** 3-way-match fail / math error → Accounts (`InvoiceIntake` already flags this).
- **Reservation conflict:** requested qty > available → blocked at request time.
- Channels already wired: `lib/notifications.ts`, `mailer.ts`, `slack.ts`, `teams.ts`, `webhook-dispatcher.ts`.

---

## 9. Edge cases

- **Concurrent issue/receipt** → handled by `mutateStock()` optimistic lock (`version`), throws 409.
- **Negative stock** → blocked in `mutateStock` (`stock + delta < 0` → 409).
- **Partial receipt then PO cancel** → keep received stock, close PO short, log variance.
- **Reject after partial issue** → cancel only the remaining `approvedQty − issuedQty`; release that reservation only.
- **Reservation leak** → release on reject/cancel (`releaseReservation`) and on issue completion.
- **Duplicate invoice number** → `@unique` on `invoiceNumber` blocks it.
- **Item soft-deleted with open requests/POs** → block delete or warn; `deletedAt` guard already in `mutateStock`.
- **Rejected goods on GRN** → only `acceptedQty` hits stock; `rejectedQty` → vendor return (RETURN subtype).
- **Sequential number collision** (`nextSequentialNumber`) → surfaces P2002; retry.
- **OCR wrong total** → `InvoiceIntake` math validation catches it; routes to NEEDS_REVIEW.
- **Unit mismatch** (variant packs) → `ItemVariant.packQty` conversion before ledger write.
- **SQLite NULL-unique** on item name/category → API-layer dedupe (already noted in schema comments).

---

## 10. Implementation priority

**P0 — fill lifecycle-breaking gaps**
1. Requisition header+lines split (`Request` + `RequestLine`) with `requestedQty/approvedQty/issuedQty` and `PartiallyIssued` status. Rewire `/requests/*` routes, `requests-view`, `issuance-view`.
2. Ledger movement `subType` on `Transaction`, threaded through `mutateStock()`.
3. 6-role RBAC: migrate `User.role`, enforce in API + nav guards.

**P1 — spec-completeness fields**
4. Item master: `itemCode, hsnCode, gstRate, maxStock, storageLocation, description, active`.
5. PO line `discount/taxRate`; GRN `ChallanItem` accepted/rejected; invoice `paymentMode/transportCharges/tax/scan`.
6. Requisition `requiredDate` + `machine`/cost-center.

**P2 — visibility**
7. New reports: pending requisition, pending PO, machine consumption, last/avg purchase rate.
8. Alert aging jobs (pending requisition / overdue PO).

**P3 — polish**
9. Excel import/export across modules, label/QR batch print, dashboard MIS widgets, vendor history drill-down.

---

## Migration notes

- SQLite + Prisma: new non-null columns need defaults or a backfill step in the migration.
- `Request` → `Request` + `RequestLine` split is a **data migration**: move each existing `Request.qty` into one `RequestLine`; map `Issued` status to `issuedQty = requestedQty`.
- Role migration: see §4 mapping. Run as a one-off script before flipping API enforcement on.
- All schema changes go through `prisma migrate`; never edit the DB by hand.
