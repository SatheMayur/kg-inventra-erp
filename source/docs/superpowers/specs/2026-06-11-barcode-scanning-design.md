# Barcode Scanning — Design Spec

**Date:** 2026-06-11
**Project:** StoreHub / KG_inventra (`source/` — Next.js 16 + Prisma + SQLite)
**Status:** Approved by user (all four sections)

## Goal

Complete the half-built barcode feature: scan an item (USB HID scanner or phone/webcam camera) to look it up anywhere in the app, speed up issuance and PO receiving, and print labels that actually scan back. Barcodes are auto-generated (system item id) plus optional manually entered manufacturer barcodes; both resolve to the same item.

## Current state (what exists / what's broken)

| Piece | State |
|---|---|
| `src/components/barcode-listener.tsx` | Global keyboard-wedge listener gated by `flags.barcode`. Only shows a stock toast. First line is `'use strict'` instead of `'use client'`. Listens even when focus is in a form input. Contains a dead `api.items.list` call. |
| `src/components/inventory/LabelPrintDialog.tsx` | Prints QR + CODE128. QR encodes the **raw item id**, but the listener expects `storehub:<id>` — printed QR labels scan as "Unknown scan". |
| `src/app/api/items/[id]/label/route.ts` | Returns QR SVG of raw `item.id`. |
| Prisma schema | `ItemVariant.barcode` exists; `Item` has **no** barcode field. |
| Lookup API | None — no way to resolve a scanned code to an item. |
| Issuance / PO receiving | No scan support. |
| Camera scanning | None. |

## Approach (chosen: Global dispatcher)

One scan-resolution endpoint; the global listener stays and dispatches to whichever view/dialog registered a scan handler; flow dialogs also carry their own auto-focused scan inputs; camera scanning feeds the same path. Alternatives considered and rejected: per-view scan boxes only (loses scan-anywhere UX, deletes existing listener), minimal patch (doesn't deliver issuance/receiving/camera flows the user chose).

## 1. Data model + scan resolution

### Schema change

```prisma
model Item {
  // ... existing fields
  barcode String? @unique   // manufacturer/manual barcode; null allowed (SQLite treats NULLs as distinct)
}
```

Apply via `prisma db push` (project does not use migration files).

### New endpoint: `GET /api/items/scan/[code]`

Auth required (same `authorize` pattern as other routes). Resolution order:

1. Code starts with `storehub:` → strip prefix → match `Item.id`
2. Raw match on `Item.id` (covers already-printed CODE128 labels which encode the id)
3. Match `Item.barcode`
4. Match `ItemVariant.barcode` → return parent item + the variant
5. No match → 404 `{ error: 'NOT_FOUND' }`

Deleted items (`deletedAt != null`) are treated as not found at every step.

Response shape:

```json
{
  "item": { "id", "name", "category", "unit", "stock", "reservedQty", "minStock", "price" },
  "variant": { "id", "name", "packSize", "stock" },
  "available": 42
}
```

(`variant` present only when resolved via a variant barcode; `available` = stock − reservedQty.)

### Label encoding fix

- QR encodes `storehub:<item.id>` (what the listener already expects)
- CODE128 encodes `item.barcode ?? item.id`
- Label API response gains `barcode` field so the dialog knows which to render

### Manual barcode entry

- Item add/edit form (inventory view) gains optional **Barcode** text field
- Items API create/update validates uniqueness among non-deleted items; duplicate → 409 with field error message

## 2. Scan dispatch architecture

### `useScanResolver()` hook (`src/hooks/use-scan-resolver.ts`)

Takes a raw code string → calls `GET /api/items/scan/[code]` → returns resolved result or null (with error toast). Single path used by the USB listener, camera dialog, and manual scan inputs.

### Zustand store additions (`src/lib/store.ts`)

```ts
scanHandler: ((result: ScanResult) => void) | null   // NOT persisted
setScanHandler: (h) => void
```

A view/dialog registers its handler on mount/open and unregisters (sets null) on unmount/close. Last registration wins; nesting is not needed.

### `BarcodeListener` fixes (existing file)

- `'use strict'` → `'use client'`
- Ignore keydown events when `document.activeElement` is an input, textarea, select, or contentEditable element — no interference with form typing
- Remove the dead `api.items.list` call
- Keep the existing 50 ms inter-key timing gate and Enter terminator (length > 3)
- On scan: resolve via the resolver. If `scanHandler` registered → call it. Else → open global `ScanResultDialog`.

### Per-dialog scan inputs

Issuance and PO-receive dialogs render a visible, auto-focused "Scan or type code" input. Enter → same resolver → same handler logic. This makes scanning work predictably even while a form has focus (where the global listener is intentionally inert).

### `CameraScanDialog` (`src/components/camera-scan-dialog.tsx`)

- Wraps `html5-qrcode` (new dependency), decodes QR + 1D barcodes from camera
- Opened from: a scan button in the app-shell topbar (visible when `flags.barcode` is on), plus buttons inside the issuance and receive dialogs
- Decoded text → same resolver/dispatch path as USB scans
- Camera permission denied → inline help text inside the dialog (not a toast)

## 3. Flow integrations

### Item lookup (global default)

Scan with no handler registered → `ScanResultDialog` (`src/components/scan-result-dialog.tsx`): item name, category, stock / reserved / available with RAG coloring (red = 0 available, amber ≤ minStock), and actions: **View in inventory** (navigates + filters to the item), **Print label** (opens existing `LabelPrintDialog`).

### Issuance

- Issuance view registers a scan handler while active: scan → filter the approved-requests list to that item
- Inside the issue dialog: scan confirms/selects the item being issued; scanning a *different* item than the request's → warning toast, no action

### Receiving (PO)

- PO receive dialog registers a handler: scan → find matching PO line → increment its `receivedQty` by 1 (capped at ordered qty, warning toast at cap) → success toast with running count
- Scanned item not on the PO → warning toast "Item not on this PO"

### Label generation

Existing `LabelPrintDialog` kept; only encodings fixed (section 1). No bulk label printing — out of scope (YAGNI).

## 4. Error handling

| Case | Behavior |
|---|---|
| Unknown / unmatched code | Toast: `No item matches "<code>"` |
| Deleted item scanned | Same as unknown |
| Duplicate barcode on item save | 409 → field-level error in the form |
| Camera permission denied | Inline help text in camera dialog |
| Scan API network failure | Error toast, scan ignored |
| Scanned item not on PO (receive) | Warning toast, no mutation |
| Receive scan beyond ordered qty | Capped, warning toast |

## 5. Testing

- **Scan endpoint unit tests** — all five resolution branches + deleted-item exclusion + auth required
- **Listener buffer logic** — extract the buffer/timing logic to a pure function so it's testable (fast keystrokes + Enter → emits code; slow typing → no emit; focused input → no emit)
- No existing FE test harness in the project → manual verification checklist for UI flows:
  1. Toggle `flags.barcode` on in Settings
  2. Print a label, scan its QR and its CODE128 → both open `ScanResultDialog` with correct item
  3. Enter a manufacturer barcode on an item, scan it → resolves
  4. Type rapidly in an open form input → listener does not fire
  5. Issuance view: scan filters request list; issue dialog scan input works
  6. PO receive: scan increments line, caps at ordered qty, rejects foreign item
  7. Camera dialog decodes a QR from a second screen/phone

## 6. Out of scope

- Bulk label printing
- Barcode fields beyond `Item` + existing `ItemVariant`
- EAN-13 check-digit generation (CODE128 of item id / stored code suffices)
- Scanning in stock transfers, pick lists, checkouts (can register handlers later via the same dispatcher)

## 7. New/changed files (summary)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `Item.barcode String? @unique` |
| `src/app/api/items/scan/[code]/route.ts` | **New** — resolution endpoint |
| `src/app/api/items/[id]/label/route.ts` | QR → `storehub:<id>`, return `barcode` |
| `src/app/api/items/route.ts`, `[id]/route.ts` | Accept + uniqueness-check `barcode` |
| `src/lib/store.ts` | `scanHandler` slot |
| `src/lib/api.ts` | `api.items.scan(code)` client method |
| `src/hooks/use-scan-resolver.ts` | **New** — shared resolver hook |
| `src/components/barcode-listener.tsx` | Fix directive, input-focus guard, dispatch |
| `src/components/scan-result-dialog.tsx` | **New** — global lookup result |
| `src/components/camera-scan-dialog.tsx` | **New** — html5-qrcode wrapper |
| `src/components/inventory/LabelPrintDialog.tsx` | Encoding fix |
| Inventory item form | Barcode field |
| `src/components/views/issuance-view.tsx` | Handler + scan input in dialog |
| Procurement PO receive dialog | Handler + scan input |
| `src/components/app-shell.tsx` | Topbar camera-scan button |
