# Barcode Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete StoreHub's half-built barcode feature: scan resolution API, fixed global USB-scanner listener, camera scanning, label encoding fixes, manual barcode entry, and scan integration in issuance + PO receiving.

**Architecture:** One scan-resolution endpoint backed by a pure, dependency-injected resolver (`src/lib/scan.ts`). A global keyboard-wedge listener dispatches resolved scans to whichever view registered a handler in the Zustand store; fallback is a lookup dialog. Camera scans feed the same dispatch path.

**Tech Stack:** Next.js 16 App Router, Prisma + SQLite, Zustand, vitest (node env, pure-logic tests in `src/lib/*.test.ts`), jsbarcode + qrcode (present), html5-qrcode (new dep).

**Spec:** `docs/superpowers/specs/2026-06-11-barcode-scanning-design.md`

**Known deviation from spec:** The spec assumed a per-line PO receive dialog persisting `receivedQty`. The codebase's receive API (`api.procurement.pos.receive(id)`) receives the *whole PO* in one call and there is no receive dialog. To stay minimal we add a **scan-verification dialog**: scanning checks lines off locally (capped at ordered qty), then Confirm calls the existing whole-PO receive API. `POItem.receivedQty` persistence is out of scope.

**Working directory for all commands:** `D:\Store_KG\Store_KG\source`

**Note on dev server:** Windows has user/machine-level `DATABASE_URL` env vars pointing at Postgres. Always run dev/test commands with the override: `$env:DATABASE_URL='file:./prisma/dev.db'` first (PowerShell).

---

### Task 1: Schema — add `Item.barcode`

**Files:**
- Modify: `prisma/schema.prisma` (Item model, ~line 45)

- [ ] **Step 1: Add field**

In `model Item`, after the `name` field, add:

```prisma
  barcode      String?   @unique
```

- [ ] **Step 2: Push schema + regenerate client**

Run (PowerShell):
```powershell
$env:DATABASE_URL='file:./prisma/dev.db'; npx prisma db push; npx prisma generate
```
Expected: "Your database is now in sync with your Prisma schema" + client generated.

Note: `@unique` is DB-global (includes soft-deleted rows). The friendly per-active-item check lives in the API layer (Task 4); the constraint is the safety net.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(barcode): add Item.barcode unique field"
```

---

### Task 2: Pure scan resolver + tests

**Files:**
- Create: `src/lib/scan.ts`
- Test: `src/lib/scan.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/scan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeScanCode, resolveScan, type ScanDeps, type ScanItem } from './scan'

const item = (over: Partial<ScanItem> = {}): ScanItem => ({
  id: 'item1', name: 'Pen', category: 'Stationery', unit: 'pcs',
  stock: 10, reservedQty: 2, minStock: 5, price: 3, deletedAt: null, ...over,
})

const deps = (over: Partial<ScanDeps> = {}): ScanDeps => ({
  findItemById: async () => null,
  findItemByBarcode: async () => null,
  findVariantByBarcode: async () => null,
  ...over,
})

describe('normalizeScanCode', () => {
  it('strips storehub: prefix', () => {
    expect(normalizeScanCode('storehub:abc123')).toBe('abc123')
  })
  it('trims and passes raw codes through', () => {
    expect(normalizeScanCode('  8901234 ')).toBe('8901234')
  })
})

describe('resolveScan', () => {
  it('resolves storehub: QR code by item id', async () => {
    const d = deps({ findItemById: async (id) => (id === 'abc' ? item({ id: 'abc' }) : null) })
    const r = await resolveScan('storehub:abc', d)
    expect(r?.item.id).toBe('abc')
    expect(r?.available).toBe(8)
  })
  it('resolves raw item id (legacy CODE128 labels)', async () => {
    const d = deps({ findItemById: async () => item() })
    expect((await resolveScan('item1', d))?.item.id).toBe('item1')
  })
  it('resolves manufacturer barcode on Item', async () => {
    const d = deps({ findItemByBarcode: async (b) => (b === '890' ? item() : null) })
    expect((await resolveScan('890', d))?.item.id).toBe('item1')
  })
  it('resolves variant barcode and includes variant', async () => {
    const d = deps({
      findVariantByBarcode: async () => ({
        variant: { id: 'v1', name: 'Box of 10', packSize: '10', stock: 4 },
        item: item(),
      }),
    })
    const r = await resolveScan('vbar', d)
    expect(r?.variant?.id).toBe('v1')
    expect(r?.item.id).toBe('item1')
  })
  it('returns null on no match', async () => {
    expect(await resolveScan('nope', deps())).toBeNull()
  })
  it('treats deleted items as not found on every path', async () => {
    const dead = item({ deletedAt: new Date() })
    const d = deps({
      findItemById: async () => dead,
      findItemByBarcode: async () => dead,
      findVariantByBarcode: async () => ({ variant: { id: 'v1', name: 'x', packSize: '', stock: 0 }, item: dead }),
    })
    expect(await resolveScan('item1', d)).toBeNull()
  })
  it('returns null for empty code', async () => {
    expect(await resolveScan('  ', deps())).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```powershell
npx vitest run src/lib/scan.test.ts
```
Expected: FAIL — cannot resolve `./scan`.

- [ ] **Step 3: Implement `src/lib/scan.ts`**

```typescript
// Pure scan-code resolution. DB access is injected so this is unit-testable.

export interface ScanItem {
  id: string
  name: string
  category: string
  unit: string
  stock: number
  reservedQty: number
  minStock: number
  price: number
  deletedAt: Date | null
}

export interface ScanVariant {
  id: string
  name: string
  packSize: string
  stock: number
}

export interface ScanDeps {
  findItemById(id: string): Promise<ScanItem | null>
  findItemByBarcode(code: string): Promise<ScanItem | null>
  findVariantByBarcode(code: string): Promise<{ variant: ScanVariant; item: ScanItem } | null>
}

export interface ScanResolution {
  item: ScanItem
  variant?: ScanVariant
  available: number
}

export function normalizeScanCode(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith('storehub:') ? trimmed.slice('storehub:'.length) : trimmed
}

function alive(item: ScanItem | null): ScanItem | null {
  return item && !item.deletedAt ? item : null
}

export async function resolveScan(raw: string, deps: ScanDeps): Promise<ScanResolution | null> {
  const code = normalizeScanCode(raw)
  if (!code) return null

  const byId = alive(await deps.findItemById(code))
  if (byId) return { item: byId, available: byId.stock - byId.reservedQty }

  const byBarcode = alive(await deps.findItemByBarcode(code))
  if (byBarcode) return { item: byBarcode, available: byBarcode.stock - byBarcode.reservedQty }

  const byVariant = await deps.findVariantByBarcode(code)
  if (byVariant && !byVariant.item.deletedAt) {
    return {
      item: byVariant.item,
      variant: byVariant.variant,
      available: byVariant.item.stock - byVariant.item.reservedQty,
    }
  }

  return null
}
```

- [ ] **Step 4: Run tests, verify pass**

```powershell
npx vitest run src/lib/scan.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scan.ts src/lib/scan.test.ts
git commit -m "feat(barcode): pure scan resolver with injected deps"
```

---

### Task 3: Scan API endpoint

**Files:**
- Create: `src/app/api/items/scan/[code]/route.ts`

- [ ] **Step 1: Create route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { resolveScan } from '@/lib/scan';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { code } = await params;

    const result = await resolveScan(decodeURIComponent(code), {
      findItemById: (id) => db.item.findUnique({ where: { id } }),
      findItemByBarcode: (b) => db.item.findFirst({ where: { barcode: b } }),
      findVariantByBarcode: async (b) => {
        const v = await db.itemVariant.findFirst({ where: { barcode: b }, include: { item: true } });
        return v ? { variant: v, item: v.item } : null;
      },
    });

    if (!result) throw new ApiError(404, 'No item matches scanned code', 'NOT_FOUND');

    const { item, variant, available } = result;
    return NextResponse.json({
      item: {
        id: item.id, name: item.name, category: item.category, unit: item.unit,
        stock: item.stock, reservedQty: item.reservedQty, minStock: item.minStock, price: item.price,
      },
      ...(variant ? { variant: { id: variant.id, name: variant.name, packSize: variant.packSize, stock: variant.stock } } : {}),
      available,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: Manual verification (server running with SQLite override)**

```powershell
# login first to get cookie, then:
curl.exe -s -b cookies.txt http://localhost:3000/api/items/scan/storehub%3A<some-item-id>
```
Expected: JSON with `item`, `available`. Unknown code → 404 `{"error":"No item matches scanned code","code":"NOT_FOUND"}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/items/scan
git commit -m "feat(barcode): scan resolution endpoint"
```

---

### Task 4: Items API accepts `barcode` (create + update)

**Files:**
- Modify: `src/lib/validation.ts:3-9` (itemSchema)
- Modify: `src/app/api/items/route.ts:57-102` (POST)
- Modify: `src/app/api/items/[id]/route.ts:8-75` (PATCH)
- Modify: `src/lib/api.ts:409-427` (create/update signatures) and `src/lib/api.ts:80-92` (ItemResponse)

- [ ] **Step 1: Extend itemSchema**

In `src/lib/validation.ts`, add to `itemSchema`'s object (after `minStock`):

```typescript
  barcode: z.string().trim().min(1).max(100).optional(),
```

- [ ] **Step 2: POST uniqueness check**

In `src/app/api/items/route.ts`, after the existing name/category duplicate check (after line 79's closing `}`), add:

```typescript
    if (validated.barcode) {
      const barcodeClash = await db.item.findFirst({
        where: { barcode: validated.barcode },
      });
      if (barcodeClash) {
        throw new ApiError(409, `Barcode "${validated.barcode}" is already assigned to "${barcodeClash.name}"`, 'BARCODE_CONFLICT');
      }
    }
```

(`validated` already spreads into `db.item.create` — barcode flows through automatically.)

- [ ] **Step 3: PATCH accepts barcode**

In `src/app/api/items/[id]/route.ts`:

Line 18, extend destructure:
```typescript
    const { name, category, unit, minStock, barcode } = body;
```

After line 32 (`if (minStock !== undefined) ...`), add:
```typescript
      if (barcode !== undefined) updateData.barcode = barcode === '' || barcode === null ? null : String(barcode).trim();
```

After the existing name/category duplicate check block (after line 48), add:
```typescript
      if (barcode) {
        const barcodeClash = await tx.item.findFirst({
          where: { barcode: String(barcode).trim(), id: { not: id } },
        });
        if (barcodeClash) {
          throw new ApiError(409, `Barcode is already assigned to "${barcodeClash.name}"`, 'BARCODE_CONFLICT');
        }
      }
```

- [ ] **Step 4: Client types**

In `src/lib/api.ts`:
- `ItemResponse` (line 80): add `barcode: string | null` after `unit: string`.
- `items.create` data type (line 409): add `barcode?: string`.
- `items.update` data type (line 419): add `barcode?: string | null`.

- [ ] **Step 5: Run full test suite (regression)**

```powershell
npx vitest run
```
Expected: all existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation.ts src/app/api/items/route.ts "src/app/api/items/[id]/route.ts" src/lib/api.ts
git commit -m "feat(barcode): accept manual barcode on item create/update with 409 on clash"
```

---

### Task 5: Fix label encodings

**Files:**
- Modify: `src/app/api/items/[id]/label/route.ts:20-31`
- Modify: `src/components/inventory/LabelPrintDialog.tsx:14-23,55-67,124-126`

- [ ] **Step 1: Label API — QR gets `storehub:` prefix, expose barcode**

In `src/app/api/items/[id]/label/route.ts` replace lines 20-31 with:

```typescript
    const qrSvg = await QRCode.toString(`storehub:${item.id}`, { type: 'svg', margin: 1 });

    return NextResponse.json({
      item: {
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        stock: item.stock,
        barcode: item.barcode,
      },
      qrSvg,
    });
```

- [ ] **Step 2: Dialog — CODE128 encodes `barcode ?? id`**

In `src/components/inventory/LabelPrintDialog.tsx`:

`LabelData` interface (line 14): add `barcode: string | null` inside `item`.

JsBarcode effect (line 58): change first two args to:
```typescript
      JsBarcode('#barcode-svg', data.item.barcode ?? data.item.id, {
```

The footer item-id line (lines 124-126) — change content to show the encoded value:
```tsx
              <p className="text-center font-mono text-[10px] text-gray-400 break-all">
                {data.item.barcode ?? data.item.id}
              </p>
```

- [ ] **Step 3: Manual check**

Open app → Inventory → print label on any item. QR should now encode `storehub:<id>` (verify with phone QR reader if available; otherwise verified end-to-end in Task 7).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/items/[id]/label/route.ts" src/components/inventory/LabelPrintDialog.tsx
git commit -m "fix(barcode): label QR encodes storehub: prefix, CODE128 prefers manual barcode"
```

---

### Task 6: Keyboard buffer logic + tests

**Files:**
- Create: `src/lib/barcode-buffer.ts`
- Test: `src/lib/barcode-buffer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/barcode-buffer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { initialBufferState, processKey, type BufferState } from './barcode-buffer'

function type(keys: string[], startTime = 1000, gapMs = 10): { state: BufferState; emits: string[] } {
  let state = initialBufferState()
  const emits: string[] = []
  let t = startTime
  for (const k of keys) {
    const r = processKey(state, k, t)
    state = r.state
    if (r.emit) emits.push(r.emit)
    t += gapMs
  }
  return { state, emits }
}

describe('processKey', () => {
  it('emits buffered code on Enter when typed fast', () => {
    expect(type(['A', 'B', 'C', '1', 'Enter']).emits).toEqual(['ABC1'])
  })
  it('does not emit codes of length <= 3', () => {
    expect(type(['A', 'B', 'Enter']).emits).toEqual([])
  })
  it('resets buffer when keys are slower than 50ms apart', () => {
    // slow human typing: 200ms gaps — buffer resets each key, Enter emits nothing
    expect(type(['A', 'B', 'C', '1', 'Enter'], 1000, 200).emits).toEqual([])
  })
  it('ignores modifier keys without breaking the buffer', () => {
    expect(type(['A', 'Shift', 'B', 'C', '1', 'Enter']).emits).toEqual(['ABC1'])
  })
  it('clears buffer after emit', () => {
    const r = type(['A', 'B', 'C', '1', 'Enter'])
    expect(r.state.buffer).toBe('')
  })
})
```

- [ ] **Step 2: Run, verify fail**

```powershell
npx vitest run src/lib/barcode-buffer.test.ts
```
Expected: FAIL — cannot resolve `./barcode-buffer`.

- [ ] **Step 3: Implement `src/lib/barcode-buffer.ts`**

```typescript
// Keyboard-wedge buffer: USB scanners type characters <50ms apart and end with Enter.
// Pure state machine so the timing logic is unit-testable.

const MAX_INTERKEY_MS = 50
const MIN_CODE_LENGTH = 4
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

export interface BufferState {
  buffer: string
  lastKeyTime: number
}

export function initialBufferState(): BufferState {
  return { buffer: '', lastKeyTime: 0 }
}

export function processKey(
  state: BufferState,
  key: string,
  now: number
): { state: BufferState; emit: string | null } {
  let buffer =
    now - state.lastKeyTime > MAX_INTERKEY_MS && state.buffer.length > 0 ? '' : state.buffer

  if (MODIFIER_KEYS.has(key)) {
    return { state: { buffer, lastKeyTime: state.lastKeyTime }, emit: null }
  }

  if (key === 'Enter') {
    const emit = buffer.length >= MIN_CODE_LENGTH ? buffer : null
    return { state: { buffer: '', lastKeyTime: now }, emit }
  }

  if (key.length === 1) buffer += key

  return { state: { buffer, lastKeyTime: now }, emit: null }
}

export function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable === true
  )
}
```

- [ ] **Step 4: Run, verify pass**

```powershell
npx vitest run src/lib/barcode-buffer.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/barcode-buffer.ts src/lib/barcode-buffer.test.ts
git commit -m "feat(barcode): testable keyboard-wedge buffer state machine"
```

---

### Task 7: Store + API client + resolver hook + listener rewrite + lookup dialog

**Files:**
- Modify: `src/lib/store.ts` (scanHandler + camera flag)
- Modify: `src/lib/api.ts:391-436` (items.scan)
- Create: `src/hooks/use-scan-resolver.ts`
- Create: `src/components/scan-result-dialog.tsx`
- Modify: `src/components/barcode-listener.tsx` (full rewrite)

- [ ] **Step 1: Store additions**

In `src/lib/store.ts`, after the `User` interface, add:

```typescript
export interface ScanResultPayload {
  item: {
    id: string
    name: string
    category: string
    unit: string
    stock: number
    reservedQty: number
    minStock: number
    price: number
  }
  variant?: { id: string; name: string; packSize: string; stock: number }
  available: number
}
```

In `AppState` interface, after the feature-flags block:

```typescript
  // Barcode scan dispatch — a view/dialog may claim scans; null = global lookup dialog
  scanHandler: ((result: ScanResultPayload) => void) | null
  setScanHandler: (h: ((result: ScanResultPayload) => void) | null) => void

  // Camera scan dialog (opened from topbar)
  cameraScanOpen: boolean
  setCameraScanOpen: (open: boolean) => void
```

In `initialState`: add `scanHandler: null,` and `cameraScanOpen: false,`.

In the store creator, after `updateFlag`:

```typescript
      setScanHandler: (scanHandler) => set({ scanHandler }),

      setCameraScanOpen: (cameraScanOpen) => set({ cameraScanOpen }),
```

(`partialize` whitelists keys — neither is persisted; no change needed there.)

- [ ] **Step 2: API client method**

In `src/lib/api.ts`, top: `import type { ScanResultPayload } from './store'` (the file already imports from `./store`).

Inside `items: { ... }` (after `restock`, line 435):

```typescript
    scan: async (code: string): Promise<ScanResultPayload> => {
      return GET<ScanResultPayload>(`/api/items/scan/${encodeURIComponent(code)}`)
    },
```

- [ ] **Step 3: Resolver hook**

Create `src/hooks/use-scan-resolver.ts`:

```typescript
'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ScanResultPayload } from '@/lib/store'

/** Resolve a raw scanned code via the scan API. Returns null (with toast) on failure. */
export function useScanResolver() {
  return useCallback(async (code: string): Promise<ScanResultPayload | null> => {
    try {
      return await api.items.scan(code)
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      toast.error(status === 404 ? `No item matches "${code}"` : 'Scan lookup failed')
      return null
    }
  }, [])
}
```

- [ ] **Step 4: Lookup result dialog**

Create `src/components/scan-result-dialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Package, Printer } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore, type ScanResultPayload } from '@/lib/store'
import { LabelPrintDialog } from '@/components/inventory/LabelPrintDialog'

interface Props {
  result: ScanResultPayload | null
  onOpenChange: (open: boolean) => void
}

export function ScanResultDialog({ result, onOpenChange }: Props) {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const [printOpen, setPrintOpen] = useState(false)

  if (!result) return null
  const { item, variant, available } = result

  const rag =
    available === 0
      ? 'border-red-500/50 bg-red-500/10 text-red-400'
      : available <= item.minStock
        ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
        : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-5 text-primary" /> {item.name}
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            {item.category} &middot; {item.unit}
            {variant ? ` — variant: ${variant.name}` : ''}
          </p>

          <div className="flex items-center gap-2 text-sm">
            <span>Stock: {item.stock}</span>
            <span className="text-muted-foreground">Reserved: {item.reservedQty}</span>
            <Badge variant="outline" className={rag}>
              Available: {available}
            </Badge>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => {
                setCurrentView('inventory')
                onOpenChange(false)
              }}
            >
              View in inventory
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setPrintOpen(true)}>
              <Printer className="size-4" /> Label
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LabelPrintDialog
        itemId={item.id}
        itemName={item.name}
        open={printOpen}
        onOpenChange={setPrintOpen}
      />
    </>
  )
}
```

- [ ] **Step 5: Rewrite `src/components/barcode-listener.tsx`** (full file replacement)

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore, type ScanResultPayload } from '@/lib/store'
import { useScanResolver } from '@/hooks/use-scan-resolver'
import { initialBufferState, processKey, isEditableTarget } from '@/lib/barcode-buffer'
import { ScanResultDialog } from '@/components/scan-result-dialog'

export function BarcodeListener() {
  const flags = useAppStore((s) => s.flags)
  const resolve = useScanResolver()
  const bufferState = useRef(initialBufferState())
  const [result, setResult] = useState<ScanResultPayload | null>(null)

  useEffect(() => {
    if (!flags.barcode) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Never interfere with typing in forms — flow dialogs have their own scan inputs
      if (isEditableTarget(document.activeElement)) return

      const { state, emit } = processKey(bufferState.current, e.key, Date.now())
      bufferState.current = state
      if (!emit) return

      void resolve(emit).then((r) => {
        if (!r) return
        const handler = useAppStore.getState().scanHandler
        if (handler) handler(r)
        else setResult(r)
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [flags.barcode, resolve])

  return <ScanResultDialog result={result} onOpenChange={(o) => !o && setResult(null)} />
}
```

- [ ] **Step 6: Typecheck + regression**

```powershell
npx tsc --noEmit; npx vitest run
```
Expected: no type errors, tests PASS.

- [ ] **Step 7: Manual smoke**

Dev server running, `flags.barcode` ON in Settings. With no input focused, simulate a fast scan via browser console:
```js
'storehub:THEID'.split('').forEach(c => window.dispatchEvent(new KeyboardEvent('keydown',{key:c})));
window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))
```
Expected: ScanResultDialog opens with item details.

- [ ] **Step 8: Commit**

```bash
git add src/lib/store.ts src/lib/api.ts src/hooks/use-scan-resolver.ts src/components/scan-result-dialog.tsx src/components/barcode-listener.tsx
git commit -m "feat(barcode): global scan dispatch with lookup dialog and fixed listener"
```

---

### Task 8: Manual barcode entry in item forms

**Files:**
- Modify: `src/components/inventory/AddItemDialog.tsx:26-65` (+ form JSX)
- Modify: `src/components/inventory/InventoryTable.tsx:114-175` (+ edit dialog JSX at ~line 353)

- [ ] **Step 1: AddItemDialog**

Add state (after line 30, `minStock`):
```typescript
  const [barcode, setBarcode] = useState('')
```

In `handleAdd`'s `api.items.create({...})` call, add:
```typescript
      barcode: barcode.trim() || undefined,
```

In the form JSX (after the Min Stock field — locate the existing `<Label>`/`<Input>` pair for minStock and copy its structure), add:
```tsx
          <div className="grid gap-2">
            <Label htmlFor="barcode">Barcode (optional)</Label>
            <Input
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or type manufacturer barcode"
            />
          </div>
```

Also reset it where the other fields reset after successful create: `setBarcode('')`.

- [ ] **Step 2: InventoryTable edit dialog**

Add state (after line 119, `editMinStock`):
```typescript
  const [editBarcode, setEditBarcode] = useState('')
```

In `openEdit` (line 138), add:
```typescript
    setEditBarcode(item.barcode ?? '')
```

In `handleEdit`'s `api.items.update(...)` payload, add:
```typescript
        barcode: editBarcode.trim() || null,
```

In the edit Dialog JSX (line 353 block — after the existing min-stock input, copying its field structure), add:
```tsx
            <div className="grid gap-2">
              <Label htmlFor="edit-barcode">Barcode (optional)</Label>
              <Input
                id="edit-barcode"
                value={editBarcode}
                onChange={(e) => setEditBarcode(e.target.value)}
                placeholder="Scan or type manufacturer barcode"
              />
            </div>
```

Duplicate barcode submit → API returns 409 `BARCODE_CONFLICT`; existing catch shows `err.message` toast — sufficient (message names the clashing item).

- [ ] **Step 3: Typecheck + manual check**

```powershell
npx tsc --noEmit
```
Then in app: add item with barcode `TEST-890`, scan-simulate it (console snippet from Task 7), expect lookup dialog. Edit item, clear barcode, save — no error.

- [ ] **Step 4: Commit**

```bash
git add src/components/inventory/AddItemDialog.tsx src/components/inventory/InventoryTable.tsx
git commit -m "feat(barcode): manual barcode entry on item create/edit"
```

---

### Task 9: Camera scanning + topbar button

**Files:**
- Create: `src/components/camera-scan-dialog.tsx`
- Modify: `src/components/app-shell.tsx` (~line 422 listener mount, ~line 514-557 header)

- [ ] **Step 1: Install dependency**

```powershell
npm install html5-qrcode
```

- [ ] **Step 2: Create `src/components/camera-scan-dialog.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCode: (code: string) => void
}

export function CameraScanDialog({ open, onOpenChange, onCode }: Props) {
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')

    const scanner = new Html5Qrcode('camera-scan-region')
    let stopped = false

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decoded) => {
          if (stopped) return
          stopped = true
          onCode(decoded)
          onOpenChange(false)
        },
        () => {} // per-frame decode misses — ignore
      )
      .catch(() => {
        setError(
          'Camera unavailable or permission denied. Allow camera access for this site in your browser settings, then reopen this dialog.'
        )
      })

    return () => {
      stopped = true
      scanner.stop().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5 text-primary" /> Scan with camera
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : (
          <div id="camera-scan-region" className="w-full rounded-lg overflow-hidden" />
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Wire into app-shell**

In `src/components/app-shell.tsx`, in the component that renders the header (the one selecting `currentView` at ~line 316):

Imports (extend existing lucide import with `ScanLine`; add the rest):
```typescript
import { CameraScanDialog } from '@/components/camera-scan-dialog'
import { ScanResultDialog } from '@/components/scan-result-dialog'
import { useScanResolver } from '@/hooks/use-scan-resolver'
import type { ScanResultPayload } from '@/lib/store'
```

State + selectors inside the component (reuse `flags` if already selected):
```typescript
  const flags = useAppStore((s) => s.flags)
  const cameraScanOpen = useAppStore((s) => s.cameraScanOpen)
  const setCameraScanOpen = useAppStore((s) => s.setCameraScanOpen)
  const resolveScanCode = useScanResolver()
  const [cameraResult, setCameraResult] = useState<ScanResultPayload | null>(null)
```

In the header JSX (next to `<NotificationCenter />` at ~line 543), add:
```tsx
          {flags.barcode && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="Scan with camera"
              onClick={() => setCameraScanOpen(true)}
            >
              <ScanLine className="size-4" />
            </Button>
          )}
```

Next to `<BarcodeListener />` (~line 422), add:
```tsx
        <CameraScanDialog
          open={cameraScanOpen}
          onOpenChange={setCameraScanOpen}
          onCode={(code) => {
            void resolveScanCode(code).then((r) => {
              if (!r) return
              const handler = useAppStore.getState().scanHandler
              if (handler) handler(r)
              else setCameraResult(r)
            })
          }}
        />
        <ScanResultDialog result={cameraResult} onOpenChange={(o) => !o && setCameraResult(null)} />
```

- [ ] **Step 4: Typecheck + manual check**

```powershell
npx tsc --noEmit
```
In app (flags.barcode ON): topbar shows scan icon; clicking opens camera dialog; denying permission shows inline help text. With a webcam, scanning a printed label QR opens ScanResultDialog.

- [ ] **Step 5: Commit**

```bash
git add src/components/camera-scan-dialog.tsx src/components/app-shell.tsx package.json package-lock.json
git commit -m "feat(barcode): camera scanning dialog with topbar trigger"
```

---

### Task 10: Issuance scan integration

**Files:**
- Modify: `src/components/views/issuance-view.tsx:82-129` (register handler)

- [ ] **Step 1: Register scan handler**

In `issuance-view.tsx` (state block ends ~line 101; `issueReq` defined line 94, `setSearchQuery` ~line 87, `toast` already imported):

Add selector near other store usage (add `import { useAppStore } from '@/lib/store'` if absent):
```typescript
  const setScanHandler = useAppStore((s) => s.setScanHandler)
```

Add effect after the `fetchRequests` definition (~line 129):
```typescript
  // Barcode scans: verify item inside the issue dialog, otherwise filter the list
  useEffect(() => {
    setScanHandler((r) => {
      if (issueReq) {
        if (r.item.id === issueReq.itemId) {
          toast.success(`Verified: ${r.item.name} matches this request`)
        } else {
          toast.warning(`Scanned ${r.item.name} — this request is for ${issueReq.itemName}`)
        }
      } else {
        setSearchQuery(r.item.name)
        toast.info(`Filtering by ${r.item.name}`)
      }
    })
    return () => setScanHandler(null)
  }, [issueReq, setScanHandler])
```

(Existing filter at lines 313-322 already matches `itemName` against `searchQuery`, so setting the query to the scanned item's name filters the request list.)

- [ ] **Step 2: Typecheck + manual check**

```powershell
npx tsc --noEmit
```
In app: open Issuance view, scan-simulate (console snippet, Task 7) an item that has an approved request → list filters to it, toast shows. Open an issue dialog, scan the same item → "Verified" toast; scan a different item → warning toast.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/issuance-view.tsx
git commit -m "feat(barcode): scan-to-filter and scan-to-verify in issuance"
```

---

### Task 11: PO receive scan-verification dialog

**Files:**
- Create: `src/components/procurement/ReceivePODialog.tsx`
- Modify: `src/components/views/procurement-view.tsx:164-172` (handleReceivePO) and ~line 363 (receive button)

- [ ] **Step 1: Create `src/components/procurement/ReceivePODialog.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { POResponse } from '@/lib/api'
import { useScanResolver } from '@/hooks/use-scan-resolver'
import { CameraScanDialog } from '@/components/camera-scan-dialog'

interface Props {
  po: POResponse | null
  onOpenChange: (open: boolean) => void
  onConfirm: (poId: string) => Promise<void>
}

/**
 * Scan-verification before receiving a PO. Scanning checks units off locally
 * (capped at ordered qty); Confirm calls the existing whole-PO receive API.
 * Counts are a verification aid only — they are not persisted.
 */
export function ReceivePODialog({ po, onOpenChange, onConfirm }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [manualCode, setManualCode] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const resolve = useScanResolver()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (po) {
      setCounts({})
      setManualCode('')
      // Auto-focus the scan input so USB scanners land here
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [po])

  if (!po) return null

  const handleCode = async (code: string) => {
    const r = await resolve(code)
    if (!r) return
    const line = po.items.find((l) => l.itemId === r.item.id)
    if (!line) {
      toast.warning(`${r.item.name} is not on this PO`)
      return
    }
    setCounts((prev) => {
      const current = prev[line.itemId] ?? 0
      if (current >= line.qty) {
        toast.warning(`All ${line.qty} ordered units of ${r.item.name} already scanned`)
        return prev
      }
      toast.success(`${r.item.name}: ${current + 1}/${line.qty}`)
      return { ...prev, [line.itemId]: current + 1 }
    })
  }

  const handleManualSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !manualCode.trim()) return
    void handleCode(manualCode.trim())
    setManualCode('')
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await onConfirm(po.id)
      onOpenChange(false)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="size-5 text-primary" /> Receive {po.poNumber}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={handleManualSubmit}
              placeholder="Scan or type code, then Enter"
            />
            <Button variant="outline" size="icon" title="Scan with camera" onClick={() => setCameraOpen(true)}>
              <Camera className="size-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {po.items.map((line) => {
              const scanned = counts[line.itemId] ?? 0
              const done = scanned >= line.qty
              return (
                <div key={line.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>{line.item.name}</span>
                  <Badge
                    variant="outline"
                    className={done ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : ''}
                  >
                    {scanned}/{line.qty}
                  </Badge>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Scanning verifies the delivery against the PO. Confirming receives the full ordered quantities.
          </p>

          <Button className="w-full" disabled={confirming} onClick={handleConfirm}>
            {confirming ? 'Receiving…' : 'Confirm goods received'}
          </Button>
        </DialogContent>
      </Dialog>

      <CameraScanDialog open={cameraOpen} onOpenChange={setCameraOpen} onCode={(c) => void handleCode(c)} />
    </>
  )
}
```

- [ ] **Step 2: Wire into procurement view**

In `src/components/views/procurement-view.tsx`:

Imports:
```typescript
import { ReceivePODialog } from '@/components/procurement/ReceivePODialog'
import type { POResponse } from '@/lib/api'   // if not already imported
```

State (near other dialog state, ~line 84):
```typescript
  const [receivePO, setReceivePO] = useState<POResponse | null>(null)
```

The receive button at ~line 363 — change:
```tsx
onClick={() => handleReceivePO(po.id)}
```
to:
```tsx
onClick={() => setReceivePO(po)}
```

Render the dialog near the existing payment dialog (~line 759):
```tsx
      <ReceivePODialog
        po={receivePO}
        onOpenChange={(o) => !o && setReceivePO(null)}
        onConfirm={async (id) => {
          await handleReceivePO(id)
        }}
      />
```

(`handleReceivePO` at lines 164-172 stays as-is — it calls `api.procurement.pos.receive(id)`, toasts, and refetches.)

- [ ] **Step 3: Typecheck + manual check**

```powershell
npx tsc --noEmit
```
In app: create/send a PO, click Receive → dialog opens with lines at 0/N. Scan-type an on-PO item code + Enter → count increments, caps at N with warning. Off-PO item → "not on this PO". Confirm → stock updated (existing behavior), dialog closes.

- [ ] **Step 4: Commit**

```bash
git add src/components/procurement/ReceivePODialog.tsx src/components/views/procurement-view.tsx
git commit -m "feat(barcode): scan-verification dialog for PO receiving"
```

---

### Task 12: Final regression + manual checklist

- [ ] **Step 1: Full suite + typecheck + lint**

```powershell
npx vitest run; npx tsc --noEmit; npm run lint
```
Expected: all PASS / no errors. (Pre-existing lint warnings unrelated to these files are acceptable.)

- [ ] **Step 2: Manual end-to-end checklist** (dev server with `$env:DATABASE_URL='file:./prisma/dev.db'`)

1. Settings → enable `barcode` flag
2. Inventory → print a label → QR now encodes `storehub:<id>`
3. Console scan-simulate `storehub:<id>` → lookup dialog with RAG stock badge
4. Add item with barcode `TEST-890` → scan-simulate `TEST-890` → resolves
5. Add second item with same barcode → 409 toast naming the clash
6. Focus any text input, scan-simulate → nothing happens (focus guard)
7. Issuance: scan filters list; in issue dialog, matching scan → "Verified", mismatch → warning
8. Procurement: Receive dialog counts scans, caps at ordered qty, rejects off-PO items, Confirm receives
9. Topbar camera button: deny permission → inline help text; allow → scanning label QR opens lookup dialog

- [ ] **Step 3: Final commit (any straggler fixes)**

```bash
git add -A
git commit -m "chore(barcode): final fixes from end-to-end verification"
```
