# KG_inventra Store Management Module Master Plan

## Purpose
This document is the product and implementation blueprint for the enterprise Store Management module in KG_inventra.

It aligns with the current `source/` codebase, which already contains:
- centralized stock mutation in `src/lib/stock.ts`
- request approval logic in `src/lib/approval.ts`
- partial requisition fulfillment in `src/lib/request-fulfillment.ts`
- three-way match logic in `src/lib/three-way-match.ts`
- Next.js App Router API structure under `src/app/api/*`
- Prisma models in `prisma/schema.prisma`

The design below expands that foundation into a production-ready store operations platform.

---

## 1. System Architecture

### 1.1 Architecture style
- Presentation layer: Next.js App Router screens for store operations
- API layer: route handlers with auth, validation, audit logging, transactional writes
- Domain layer: reusable workflow helpers for approval, stock mutation, fulfillment, matching, reorder logic
- Persistence layer: Prisma models, relational integrity, append-only ledger
- Integration layer: barcode/QR, notifications, file upload, optional external procurement/accounting connectors

### 1.2 Core design principles
- Every inventory movement must create exactly one ledger entry
- Stock mutation must go through one transaction helper only
- Requests, purchase orders, GRNs, invoices, and issues must be auditable
- Partial fulfillment is first-class, not a workaround
- Current stock is denormalized for speed, ledger is the source of history
- UI must be optimized for store staff, not ERP power users

### 1.3 Material lifecycle
```text
Item Created
-> Department Request
-> Stock Availability Check
-> Approval
-> Reservation
-> Purchase Trigger (if stock is short)
-> Goods Receipt
-> Invoice Match
-> Stock Update
-> Issue to Department
-> Department Acknowledgement
-> Ledger Update
-> Reports and Audit Trail
```

### 1.4 Service boundaries

#### Store master service
- Item master CRUD
- Barcode and QR generation
- Vendor mapping
- Storage location mapping

#### Requisition service
- Request creation
- Approval routing
- Partial approval and issue
- Reservation management

#### Procurement service
- Purchase request generation
- Purchase order creation and approval
- PO sending and receipt tracking

#### Receiving service
- GRN or challan entry
- Quality check
- Accepted and rejected quantity tracking
- Inventory update on acceptance only

#### Issue and transfer service
- Material issue to department
- Warehouse and department transfers
- Acknowledgement and closure

#### Ledger and analytics service
- Immutable stock ledger
- Reports
- Alerts
- Audit history

---

## 2. Database Schema

### 2.1 Entity relationship overview
```text
User 1---n Request 1---n RequestLine n---1 Item
User 1---n Transaction n---1 Item
User 1---n AuditLog
Supplier 1---n PurchaseOrder 1---n POItem n---1 Item
PurchaseOrder 1---n PurchaseInvoice
PurchaseOrder 1---n GRN 1---n GRNItem n---1 Item
Request 1---n ApprovalLog
Item 1---n ItemVendor n---1 Supplier
Item 1---n ItemLocation
Item 1---n ItemImage
Item 1---n ItemVariant
Item 1---n StockTransferItem
```

### 2.2 Core tables

#### User
Purpose: authentication, roles, department ownership

Key columns:
- `id` primary key
- `empId` unique
- `name`
- `department`
- `floor`
- `role`
- `isDeptHead`
- `active`
- `createdAt`
- `updatedAt`

Indexes:
- unique `empId`
- `role`
- `department`
- `active`

#### Item
Purpose: store item master and current stock snapshot

Key columns:
- `id`
- `name`
- `itemCode` unique
- `barcode` unique
- `category`
- `subCategory`
- `description`
- `unit`
- `stock`
- `reservedQty`
- `minStock`
- `maxStock`
- `reorderQty`
- `safetyStock`
- `preferredSupplierId`
- `alternateVendorIds`
- `hsnCode`
- `gstRate`
- `lastPurchaseRate`
- `avgPurchaseRate`
- `warehouse`
- `rack`
- `shelf`
- `bin`
- `active`
- `deletedAt`
- `version`
- `createdAt`
- `updatedAt`

Indexes:
- unique `itemCode`
- unique `barcode`
- `category`
- `active`
- `minStock`
- `preferredSupplierId`

#### Supplier
Purpose: vendor master

Key columns:
- `id`
- `name`
- `gstNumber`
- `contactPerson`
- `phone`
- `email`
- `address`
- `active`
- `createdAt`
- `updatedAt`

Indexes:
- unique `gstNumber` where applicable
- `name`
- `active`

#### Request
Purpose: requisition header

Key columns:
- `id`
- `requestNumber` unique
- `requestDate`
- `department`
- `requester`
- `concernPerson`
- `machine`
- `costCenter`
- `requiredDate`
- `remarks`
- `status`
- `userId`
- `createdAt`
- `updatedAt`

Indexes:
- unique `requestNumber`
- `status, createdAt`
- `department, createdAt`
- `userId, createdAt`

#### RequestLine
Purpose: item-level request fulfillment tracking

Key columns:
- `id`
- `requestId`
- `itemId`
- `requestedQty`
- `approvedQty`
- `issuedQty`
- `availableQtySnapshot`
- `unit`
- `status`
- `remarks`

Indexes:
- `requestId`
- `itemId`
- `status`

#### ApprovalLog
Purpose: approval timeline and comments

Key columns:
- `id`
- `entityType`
- `entityId`
- `level`
- `action`
- `comment`
- `userId`
- `createdAt`

#### PurchaseOrder
Purpose: procurement header

Key columns:
- `id`
- `poNumber` unique
- `supplierId`
- `sourceType`
- `sourceRefId`
- `status`
- `totalAmount`
- `discountAmount`
- `taxAmount`
- `expectedDeliveryDate`
- `approvedBy`
- `approvedAt`
- `autoGenerated`
- `sentAt`
- `receivedAt`
- `notes`
- `createdAt`
- `updatedAt`

Indexes:
- unique `poNumber`
- `status, createdAt`
- `supplierId, createdAt`
- `expectedDeliveryDate`

#### POItem
Purpose: line items for PO

Key columns:
- `id`
- `purchaseOrderId`
- `itemId`
- `qty`
- `receivedQty`
- `unitPrice`
- `discount`
- `taxRate`
- `lineTotal`

Indexes:
- `purchaseOrderId`
- `itemId`

#### GRN
Purpose: goods receipt header

Key columns:
- `id`
- `grnNumber` unique
- `vendorId`
- `poId`
- `receiptDate`
- `receivedBy`
- `status`
- `remarks`
- `createdAt`
- `updatedAt`

#### GRNItem
Purpose: receipt line items

Key columns:
- `id`
- `grnId`
- `poItemId`
- `itemId`
- `orderedQty`
- `receivedQty`
- `acceptedQty`
- `rejectedQty`
- `remarks`

#### PurchaseInvoice
Purpose: invoice header and matching

Key columns:
- `id`
- `invoiceNumber` unique
- `vendorId`
- `purchaseOrderId`
- `grnId`
- `invoiceDate`
- `paymentMode`
- `grossAmount`
- `additionalCharges`
- `netAmount`
- `status`
- `scanUrl`
- `notes`

Indexes:
- unique `invoiceNumber`
- `purchaseOrderId`
- `vendorId`
- `status`

#### Transaction
Purpose: immutable stock ledger

Key columns:
- `id`
- `type`
- `subType`
- `itemId`
- `itemName`
- `qty`
- `balanceAfter`
- `referenceType`
- `referenceNumber`
- `userId`
- `remarks`
- `date`
- `createdAt`

Indexes:
- `itemId, date`
- `userId, date`
- `type, date`
- `subType, date`
- `referenceType, referenceNumber`

#### AuditLog
Purpose: system-wide audit trail

Key columns:
- `id`
- `action`
- `userId`
- `userName`
- `targetType`
- `targetId`
- `targetName`
- `oldValue`
- `newValue`
- `metadata`
- `ipAddress`
- `createdAt`

Indexes:
- `action`
- `userId`
- `targetType, targetId`
- `createdAt`

### 2.3 Supporting tables
- `ItemVendor`
- `ItemImage`
- `ItemVariant`
- `ItemTag`
- `ItemLocation`
- `Notification`
- `StockTransfer`
- `StockTransferItem`
- `Asset`

### 2.4 Stock ledger architecture
The ledger must be append-only.

Every stock affecting action writes a `Transaction` row:
- opening balance
- purchase inward
- transfer inward
- issue outward
- return
- adjustment
- damage
- scrap

Running balance can be stored in `balanceAfter` for reporting speed, but the ledger remains the authoritative history.

### 2.5 Index strategy
- Use unique constraints for document numbers and barcodes
- Use compound indexes for status plus date filters
- Use item/date indexes for ledger and consumption reports
- Use vendor/date indexes for supplier performance
- Use department/date indexes for request and consumption dashboards

---

## 3. API Design

### 3.1 Store item master
- `GET /api/items`
- `POST /api/items`
- `GET /api/items/:id`
- `PATCH /api/items/:id`
- `DELETE /api/items/:id`
- `GET /api/items/scan/:barcode`
- `GET /api/items/:id/label`
- `GET /api/items/:id/qr`
- `POST /api/items/bulk-import`
- `POST /api/items/labels`
- `GET /api/items/:id/history`
- `GET /api/items/:id/vendors`
- `POST /api/items/:id/vendors`
- `DELETE /api/items/:id/vendors/:vendorId`

### 3.2 Requisition management
- `GET /api/requests`
- `POST /api/requests`
- `GET /api/requests/:id`
- `PATCH /api/requests/:id`
- `POST /api/requests/:id/approve`
- `POST /api/requests/:id/reject`
- `POST /api/requests/:id/ready`
- `POST /api/requests/:id/issue`
- `POST /api/requests/:id/cancel`

### 3.3 Procurement management
- `GET /api/purchase-orders`
- `POST /api/purchase-orders`
- `GET /api/purchase-orders/:id`
- `PATCH /api/purchase-orders/:id`
- `POST /api/purchase-orders/:id/approve`
- `POST /api/purchase-orders/:id/send`
- `POST /api/purchase-orders/:id/receive`

### 3.4 Goods receipt
- `GET /api/challans`
- `POST /api/challans`
- `GET /api/challans/:id`
- `POST /api/challans/:id/confirm`

### 3.5 Invoice management
- `GET /api/invoices`
- `POST /api/invoices`
- `GET /api/invoices/:id`
- `PATCH /api/invoices/:id`
- `POST /api/invoice-validation`
- `GET /api/invoice-intakes`
- `POST /api/invoice-intakes`
- `GET /api/invoice-intakes/:id`

### 3.6 Issue and transfer
- `GET /api/stock-transfers`
- `POST /api/stock-transfers`
- `GET /api/stock-transfers/:id`
- `POST /api/stock-transfers/:id/confirm`
- `POST /api/stock-transfers/:id/reconcile`

### 3.7 Ledger and reports
- `GET /api/transactions`
- `GET /api/reporting/dashboard`
- `GET /api/reporting/inventory-value`
- `GET /api/reporting/stockout-risk`
- `GET /api/reporting/item-flow`
- `GET /api/reporting/department-consumption`
- `GET /api/reporting/period-comparison`
- `GET /api/reporting/supplier-performance`
- `GET /api/reporting/top-items`
- `GET /api/reporting/audit`
- `GET /api/reporting/user-activity`

### 3.8 Auth and admin
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/toggle-active`

### 3.9 API conventions
- All write routes require authentication
- Role checks happen server-side
- Validation uses Zod or equivalent schema guards
- Successful writes create audit logs
- Stock changes happen only inside a transaction
- Failed concurrency checks return 409
- Business validation failures return 400

---

## 4. Frontend Screen List

### 4.1 Primary screens
- Dashboard
- Item Master
- Item Detail
- Requisition Create
- Requisition Queue
- Approval Queue
- Purchase Orders
- Purchase Order Detail
- Goods Receipt
- Invoice Register
- Material Issue
- Stock Transfer
- Stock Ledger
- Vendor Master
- Alerts
- Reports
- Audit Log
- User and Role Management
- Settings

### 4.2 Screen behavior requirements
- Large searchable tables
- Sticky filters and quick search
- Clear status badges
- Keyboard-friendly forms
- Barcode scan-first input on receipt and issue flows
- One primary action per screen
- Mobile responsive cards for operators
- Minimal click paths

### 4.3 Screen responsibilities

#### Item Master
- Add and edit items
- Manage stock thresholds
- Map vendors and locations
- Print barcode and QR labels

#### Requisition
- Raise request
- Add multiple lines
- Show live availability
- Track status and comments

#### Approval Queue
- View pending requests
- Approve, reject, send back
- Show approval history

#### Purchase Orders
- View PO lifecycle
- Create PO from request or low stock
- Approve and send PO

#### Goods Receipt
- Receive against PO
- Enter accepted and rejected quantities
- Attach receipt documents

#### Invoice Register
- Upload invoice
- Match against PO and GRN
- Flag mismatch

#### Material Issue
- Issue full or partial quantity
- Capture receiver acknowledgement

#### Stock Transfer
- Move stock between locations
- Confirm source and destination movement

#### Stock Ledger
- Show running balance
- Filter by item, date, type, subtype

#### Reports
- Inventory, procurement, consumption, audit
- Export to Excel or PDF

---

## 5. Workflow Diagrams

### 5.1 Requisition flow
```text
Draft
-> Submitted
-> Approved
-> Purchase Pending or Issue Pending
-> Partially Issued
-> Completed

Rejected and Cancelled can happen from the pending states.
```

### 5.2 Procurement flow
```text
Request / Low Stock / Manual
-> Purchase Request
-> PO Draft
-> Pending Approval
-> Approved
-> Sent
-> Partially Received
-> Received
-> Closed
```

### 5.3 Goods receipt flow
```text
Vendor delivery
-> GRN created
-> PO reference checked
-> Quantity verified
-> Quality verified
-> Accepted qty posted to stock
-> Rejected qty flagged
-> Invoice matched
```

### 5.4 Issue flow
```text
Approved request
-> Stock reserved
-> Issue full or partial
-> Department acknowledges
-> Request closed
```

### 5.5 Transfer flow
```text
Source location
-> Transfer draft
-> Confirm dispatch
-> Destination receive
-> Reconcile
```

---

## 6. Status Flows

### 6.1 Request
- `Draft`
- `Submitted`
- `Approved`
- `Rejected`
- `Purchase Pending`
- `Issue Pending`
- `Partially Issued`
- `Completed`
- `Cancelled`

### 6.2 Request line
- `Pending`
- `Approved`
- `Partially Issued`
- `Issued`
- `Rejected`
- `Cancelled`

### 6.3 Approval
- `Pending`
- `Approved`
- `Rejected`
- `Sent Back`

### 6.4 Purchase order
- `Draft`
- `Pending Approval`
- `Approved`
- `Sent`
- `Partially Received`
- `Received`
- `Closed`
- `Cancelled`

### 6.5 GRN
- `Draft`
- `Confirmed`
- `Closed`

### 6.6 Invoice
- `Draft`
- `Uploaded`
- `Matched`
- `Mismatch`
- `Verified`
- `Paid`
- `Cancelled`

### 6.7 Issue
- `Pending`
- `Partially Issued`
- `Issued`
- `Acknowledged`
- `Closed`

### 6.8 Transfer
- `Draft`
- `Confirmed`
- `Reconciled`
- `Cancelled`

---

## 7. Permission Matrix

| Action | Store Admin | Store Operator | Department User | Department Head | Purchase User | Accounts User | Management |
|---|---|---|---|---|---|---|---|
| Item master CRUD | Yes | No | View | View | Limited | View | View |
| Raise request | Yes | No | Yes | Yes | No | No | No |
| Approve request | Yes | No | No | Yes, own dept | No | No | No |
| Create PO | Yes | No | No | No | Yes | No | No |
| Approve PO | Yes | No | No | Configurable | Yes, assigned | No | No |
| Receive goods | Yes | Yes | No | No | No | No | No |
| Verify invoice | No | No | No | No | No | Yes | No |
| Issue stock | Yes | Yes | No | No | No | No | No |
| Transfer stock | Yes | Yes | No | No | No | No | No |
| View ledger | Yes | Yes | Own dept | Own dept | Yes | Yes | Yes |
| Reports | Yes | Yes | Own dept | Own dept | Yes | Yes | Yes |
| User management | Yes | No | No | No | No | No | No |

### Server-side rule
Do not rely on hidden buttons. Every permission must be enforced in the API layer.

---

## 8. Business Rules

- Requests can be created by authorized department users
- Approval can only happen by store admin or the matching department head
- Reserved stock must be released on rejection or cancellation
- Approved stock can be issued fully or partially
- Stock cannot go negative
- Purchase orders can be created from a request, low stock trigger, or manual entry
- POs above threshold must pass approval
- GRN must separate accepted and rejected quantity
- Only accepted GRN quantity updates inventory
- Invoice matching must compare PO, GRN, and invoice totals
- Every stock movement writes a transaction row
- Every write action writes an audit log
- Inactive items remain readable but should not be issued
- Deleting items with movement history should be blocked or converted to soft delete

---

## 9. Edge Cases

- Concurrent issue and receipt on the same item
- Issue request for more than approved quantity
- Partial issue followed by cancellation of the remaining balance
- PO partially received and later cancelled
- Supplier delivers fewer or more items than ordered
- Invoice total differs from PO total
- Duplicate barcode or duplicate document number
- Item marked inactive while open requests still exist
- Transfer confirmation while a stock count is underway
- Manual adjustment overlapping with issue
- OCR extraction producing wrong invoice totals
- Reservation not released after a rejected request
- Same item repeated in one request
- Wrong destination location on stock transfer

---

## 10. Implementation Roadmap

### Phase 1: Foundation
- Finalize enterprise roles
- Freeze request header and line model
- Standardize ledger movement subtypes
- Add item master fields and indexes

### Phase 2: Procurement
- Build PO creation and approval
- Add GRN and partial receiving
- Add invoice upload and three-way match

### Phase 3: Issue and transfer
- Complete partial issue flow
- Add department acknowledgement
- Add stock transfer between locations

### Phase 4: Visibility
- Add dashboards
- Add pending work queues
- Add vendor analytics
- Add audit log viewer

### Phase 5: UX hardening
- Barcode-first receiving and issuing
- Better filters and bulk actions
- Mobile operator views

### Phase 6: Enterprise hardening
- Move to Postgres
- Add stronger concurrency handling
- Add backup and document retention strategy
- Add state transition tests and mismatch tests

---

## 11. Recommended build order
1. Requisition header plus lines
2. Transaction subtype and stock ledger enhancements
3. Enterprise RBAC
4. Item master field completion
5. Purchase order approval and GRN
6. Invoice matching
7. Issue and transfer completion
8. Reports and alerts
9. Audit and admin hardening

---

## 12. Notes for implementation
- Prefer extending the current `source/` module structure instead of adding parallel legacy routes
- Keep the stock helper as the only place that mutates stock balances
- Keep document numbering unique and retry-safe
- Keep all audit payloads structured, not plain text
- Keep UI copy simple enough for store staff

