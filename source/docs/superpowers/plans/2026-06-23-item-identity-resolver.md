# Item Identity Resolver (Core Engine) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A zero-cost, in-process item-name resolver that maps a raw description to one canonical `Item` (MATCHED / SUGGESTED / UNMATCHED), backed by a learning `ItemAlias` store.

**Architecture:** Pure TypeScript helpers in `src/lib/item-resolver/` (normalize, synonyms, similarity, resolve) with no DB or network access, plus one thin DB wrapper (`service.ts`) and one new Prisma model (`ItemAlias`). No external/LLM calls; no new npm dependencies.

**Tech Stack:** Next.js App Router, Prisma + SQLite (`prisma db push`), vitest (`vitest run`, glob `src/**/*.test.ts`, `@`→`src`), TypeScript strict.

## Global Constraints

- Zero external/LLM calls; zero new npm dependencies (trigram + phonetic hand-rolled). (spec §2)
- The engine (`resolve.ts` and the helpers it uses) is pure — no Prisma, no `fetch`. Only `service.ts` touches the DB. (spec §4)
- Thresholds verbatim: MATCHED = top ≥ 0.90 AND margin ≥ 0.15; SUGGESTED = top in [0.60, 0.90) OR margin < 0.15; UNMATCHED = all < 0.60. (spec §5)
- Hard rules enforced in code: no misc/general fallback; never synthesize unit/HSN/category; never create an item; never merge inputs; quantity/price never scored for identity; reasoning required on SUGGESTED/UNMATCHED. (spec §6)
- Output is exactly the source-spec JSON shape. (spec §7)
- Tests co-locate as `*.test.ts`, import via `@/...`, environment `node`.

---

### Task 1: `ItemAlias` model + db push

**Files:**
- Modify: `prisma/schema.prisma` (add model + `Item.aliases` back-relation)

- [ ] **Step 1: Add the model**

Append to `prisma/schema.prisma`:

```prisma
model ItemAlias {
  id              String   @id @default(cuid())
  aliasText       String
  itemId          String
  sourceType      String?
  vendorId        String?
  confidenceScore Float    @default(0)
  timesMatched    Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  item            Item     @relation(fields: [itemId], references: [id])

  @@index([aliasText])
  @@index([itemId])
  @@map("item_aliases")
}
```

Add to the `Item` model's relation list: `aliases  ItemAlias[]`.

- [ ] **Step 2: Push + generate**

Run: `npm run db:push && npm run db:generate`
Expected: schema applies; Prisma client regenerates with `ItemAlias`.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(resolver): add ItemAlias model for learned item-name aliases"
```

---

### Task 2: `normalize.ts` — text normalization + quantity extraction

**Files:**
- Create: `src/lib/item-resolver/normalize.ts`
- Test: `src/lib/item-resolver/normalize.test.ts`

**Interfaces — Produces:**
- `normalize(text: string): string`
- `extractQuantity(text: string): { quantity: { qty?: number; unit?: string }; stripped: string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/item-resolver/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalize, extractQuantity } from '@/lib/item-resolver/normalize'

describe('normalize', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalize('  Distil-watr,  10ltr  CAN ')).toBe('distil watr 10ltr can')
  })
})

describe('extractQuantity', () => {
  it('pulls a quantity+unit prefix and strips it', () => {
    const r = extractQuantity('2pc pani bottle')
    expect(r.quantity).toEqual({ qty: 2, unit: 'pc' })
    expect(r.stripped).toBe('pani bottle')
  })
  it('pulls an embedded size token', () => {
    const r = extractQuantity('distil watr 10ltr can')
    expect(r.quantity.qty).toBe(10)
    expect(r.quantity.unit).toBe('ltr')
    expect(r.stripped).toBe('distil watr can')
  })
  it('returns empty quantity when none present', () => {
    expect(extractQuantity('pani bottle').quantity).toEqual({})
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test -- src/lib/item-resolver/normalize.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/lib/item-resolver/normalize.ts
const UNITS = ['pcs','pc','pec','nos','no','ltr','litre','liter','ml','kg','gm','gms','g','mtr','box','can','pkt','packet','dozen','doz']
const UNIT_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS.join('|')})\\b`, 'i')

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractQuantity(text: string): { quantity: { qty?: number; unit?: string }; stripped: string } {
  const norm = normalize(text)
  const m = norm.match(UNIT_RE)
  if (!m) return { quantity: {}, stripped: norm }
  const stripped = norm.replace(m[0], ' ').replace(/\s+/g, ' ').trim()
  return { quantity: { qty: Number(m[1]), unit: m[2].toLowerCase() }, stripped }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm run test -- src/lib/item-resolver/normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/item-resolver/normalize.ts src/lib/item-resolver/normalize.test.ts
git commit -m "feat(resolver): text normalization + quantity extraction"
```

---

### Task 3: `synonyms.ts` — seed transliteration/synonym map

**Files:**
- Create: `src/lib/item-resolver/synonyms.ts`
- Test: `src/lib/item-resolver/synonyms.test.ts`

**Interfaces — Produces:** `expandTokens(tokens: string[]): string[]` (returns the input tokens plus any canonical synonyms, deduped).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/item-resolver/synonyms.test.ts
import { describe, it, expect } from 'vitest'
import { expandTokens } from '@/lib/item-resolver/synonyms'

describe('expandTokens', () => {
  it('maps transliterated variants to canonical tokens', () => {
    expect(expandTokens(['pani'])).toContain('water')
    expect(expandTokens(['bottal'])).toContain('bottle')
    expect(expandTokens(['watr'])).toContain('water')
  })
  it('keeps unknown tokens unchanged and dedupes', () => {
    expect(expandTokens(['water', 'water'])).toEqual(['water'])
  })
})
```

- [ ] **Step 2: Run, verify fail** — `npm run test -- src/lib/item-resolver/synonyms.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/item-resolver/synonyms.ts
// Seed map: variant -> canonical token. Grows operationally via the review queue.
const SYNONYMS: Record<string, string> = {
  pani: 'water', watr: 'water', wtr: 'water',
  bottal: 'bottle', botal: 'bottle', bottel: 'bottle',
  distil: 'distilled', distill: 'distilled',
  ltr: 'litre', l: 'litre', liter: 'litre',
  dabba: 'box', peti: 'box',
}

export function expandTokens(tokens: string[]): string[] {
  const out = new Set<string>()
  for (const t of tokens) {
    out.add(t)
    const canon = SYNONYMS[t]
    if (canon) out.add(canon)
  }
  return [...out]
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/item-resolver/synonyms.ts src/lib/item-resolver/synonyms.test.ts
git commit -m "feat(resolver): seed synonym/transliteration map"
```

---

### Task 4: `similarity.ts` — token / trigram / phonetic scores

**Files:**
- Create: `src/lib/item-resolver/similarity.ts`
- Test: `src/lib/item-resolver/similarity.test.ts`

**Interfaces — Produces (each returns 0–1):** `tokenScore(a, b)`, `trigramScore(a, b)`, `phoneticScore(a, b)`, and `phoneticCode(token)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/item-resolver/similarity.test.ts
import { describe, it, expect } from 'vitest'
import { tokenScore, trigramScore, phoneticScore, phoneticCode } from '@/lib/item-resolver/similarity'

describe('phoneticCode', () => {
  it('collapses vowels so transliterations align', () => {
    expect(phoneticCode('water')).toBe(phoneticCode('watr'))
    expect(phoneticCode('bottle')).toBe(phoneticCode('bottal'))
    expect(phoneticCode('pani')).toBe(phoneticCode('paani'))
  })
})

describe('trigramScore', () => {
  it('is 1 for identical strings and high for a typo', () => {
    expect(trigramScore('distilled water', 'distilled water')).toBe(1)
    expect(trigramScore('distil watr', 'distilled water')).toBeGreaterThan(0.4)
  })
  it('is 0 for disjoint strings', () => {
    expect(trigramScore('abc', 'xyz')).toBe(0)
  })
})

describe('tokenScore', () => {
  it('rewards shared (synonym-expanded) tokens', () => {
    expect(tokenScore('pani bottle', 'water bottle')).toBeGreaterThan(0.5)
    expect(tokenScore('uv sterilizer', 'water filter')).toBe(0)
  })
})

describe('phoneticScore', () => {
  it('matches transliterated tokens', () => {
    expect(phoneticScore('watr', 'water')).toBe(1)
  })
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/item-resolver/similarity.ts
import { expandTokens } from './synonyms'

function tokens(s: string): string[] {
  return s.split(/\s+/).filter(Boolean)
}

export function phoneticCode(token: string): string {
  if (!token) return ''
  const lower = token.toLowerCase()
  const rest = lower.slice(1).replace(/[aeiou]/g, '')
  return (lower[0] + rest).replace(/(.)\1+/g, '$1')
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const set = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3))
  return set
}

export function trigramScore(a: string, b: string): number {
  if (!a || !b) return 0
  const ta = trigrams(a), tb = trigrams(b)
  let inter = 0
  for (const g of ta) if (tb.has(g)) inter++
  return (2 * inter) / (ta.size + tb.size)
}

export function tokenScore(a: string, b: string): number {
  const sa = new Set(expandTokens(tokens(a)))
  const sb = new Set(expandTokens(tokens(b)))
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  const union = new Set([...sa, ...sb]).size
  return inter / union
}

export function phoneticScore(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b)
  if (ta.length === 0) return 0
  const codesB = new Set(tb.map(phoneticCode))
  let hits = 0
  for (const t of ta) if (codesB.has(phoneticCode(t))) hits++
  return hits / ta.length
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/item-resolver/similarity.ts src/lib/item-resolver/similarity.test.ts
git commit -m "feat(resolver): token/trigram/phonetic similarity primitives"
```

---

### Task 5: `resolve.ts` — orchestrator (STEP 1–3 + hard rules + output)

**Files:**
- Create: `src/lib/item-resolver/resolve.ts`
- Test: `src/lib/item-resolver/resolve.test.ts`

**Interfaces — Produces:** types `MasterItem`, `KnownAlias`, `ResolverInput`, `ResolverResult`, and `resolve(input: ResolverInput): ResolverResult`.

- [ ] **Step 1: Write the failing test (the three source examples + thresholds)**

```ts
// src/lib/item-resolver/resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolve, type MasterItem, type KnownAlias } from '@/lib/item-resolver/resolve'

const master: MasterItem[] = [
  { item_id: 'ITM-DW', item_name: 'Distilled Water', category: 'Lab', unit: 'litre', item_code: 'DW01' },
  { item_id: 'ITM-UV', item_name: 'UV Sterilizer', category: 'Lab', unit: 'pcs', item_code: 'UV01' },
  { item_id: 'ITM-FL', item_name: 'Water Filter', category: 'Lab', unit: 'pcs', item_code: 'FL01' },
]

it('UNMATCHED when nothing resembles the description', () => {
  const r = resolve({ raw_description: 'Duo 2200 With Handle', source_type: 'vendor_invoice', vendor_id: 'shree', item_master: master, known_aliases: [] })
  expect(r.status).toBe('UNMATCHED')
  expect(r.matched_item_id).toBeNull()
  expect(r.reasoning.length).toBeGreaterThan(0)
})

it('MATCHED via learned alias, quantity stripped', () => {
  const aliases: KnownAlias[] = [{ alias_text: 'pani bottle', item_id: 'ITM-DW', source_type: 'employee_request', vendor_id: null, confidence_score: 0.95, times_matched: 12 }]
  const r = resolve({ raw_description: '2pc pani bottle', source_type: 'employee_request', item_master: master, known_aliases: aliases })
  expect(r.status).toBe('MATCHED')
  expect(r.matched_item_id).toBe('ITM-DW')
})

it('MATCHED a typo via STEP 2 and emits a new alias to learn', () => {
  const r = resolve({ raw_description: 'Distil watr 10ltr can', source_type: 'manual_entry', item_master: master, known_aliases: [] })
  expect(r.status).toBe('MATCHED')
  expect(r.matched_item_id).toBe('ITM-DW')
  expect(r.new_alias_to_learn?.item_id).toBe('ITM-DW')
})

it('never falls back to a category on low confidence', () => {
  const r = resolve({ raw_description: 'xyzzy qwerty', source_type: 'manual_entry', item_master: master, known_aliases: [] })
  expect(r.status).toBe('UNMATCHED')
  expect(r.matched_item_id).toBeNull()
})
```

- [ ] **Step 2: Run, verify fail** — FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/item-resolver/resolve.ts
import { normalize, extractQuantity } from './normalize'
import { tokenScore, trigramScore, phoneticScore } from './similarity'

export type MasterItem = { item_id: string; item_name: string; category: string; unit: string; item_code: string }
export type KnownAlias = { alias_text: string; item_id: string; source_type: string | null; vendor_id: string | null; confidence_score: number; times_matched: number }
export type SourceType = 'vendor_invoice' | 'employee_request' | 'manual_entry'
export type ResolverInput = { raw_description: string; source_type: SourceType; vendor_id?: string | null; item_master: MasterItem[]; known_aliases: KnownAlias[] }
export type Candidate = { item_id: string; item_name: string; confidence: number }
export type ResolverResult = {
  raw_description: string; source_type: SourceType
  status: 'MATCHED' | 'SUGGESTED' | 'UNMATCHED'
  matched_item_id: string | null; matched_item_name: string | null
  confidence: number; candidates: Candidate[]; reasoning: string
  new_alias_to_learn: { alias_text: string; item_id: string } | null
}

const WEIGHTS = { token: 0.55, trigram: 0.30, phonetic: 0.15, codeBoost: 0.2 }
const MATCH = 0.90, MARGIN = 0.15, FLOOR = 0.60, ALIAS_MIN_TIMES = 3

function clamp01(n: number) { return Math.max(0, Math.min(1, n)) }

function scoreAgainst(text: string, candidateName: string, codeHit: boolean): number {
  const base = WEIGHTS.token * tokenScore(text, candidateName)
    + WEIGHTS.trigram * trigramScore(text, candidateName)
    + WEIGHTS.phonetic * phoneticScore(text, candidateName)
  return clamp01(base + (codeHit ? WEIGHTS.codeBoost : 0))
}

export function resolve(input: ResolverInput): ResolverResult {
  const { raw_description, source_type, item_master, known_aliases } = input
  const vendorId = input.vendor_id ?? null
  const aliasKey = normalize(raw_description)
  const { stripped } = extractQuantity(raw_description)
  const text = stripped || aliasKey

  const byId = new Map(item_master.map((m) => [m.item_id, m]))
  const base = (status: ResolverResult['status']): ResolverResult => ({
    raw_description, source_type, status,
    matched_item_id: null, matched_item_name: null, confidence: 0,
    candidates: [], reasoning: '', new_alias_to_learn: null,
  })

  // STEP 1 — exact learned-alias match (vendor-preferred), gated by rule 6.
  const exact = known_aliases.filter((a) => a.alias_text === aliasKey)
  const ordered = [
    ...exact.filter((a) => source_type === 'vendor_invoice' && a.vendor_id === vendorId),
    ...exact.filter((a) => !(source_type === 'vendor_invoice' && a.vendor_id === vendorId)),
  ]
  const learned = ordered.find((a) => a.confidence_score >= MATCH && a.times_matched >= ALIAS_MIN_TIMES)
  if (learned && byId.has(learned.item_id)) {
    const it = byId.get(learned.item_id)!
    return { ...base('MATCHED'), matched_item_id: it.item_id, matched_item_name: it.item_name, confidence: 1.0,
      candidates: [{ item_id: it.item_id, item_name: it.item_name, confidence: 1.0 }] }
  }

  // STEP 2 — deterministic scoring against item names and alias texts; best per item.
  const best = new Map<string, number>()
  for (const it of item_master) {
    const codeHit = (!!it.item_code && aliasKey.includes(it.item_code.toLowerCase()))
    best.set(it.item_id, scoreAgainst(text, normalize(it.item_name), codeHit))
  }
  for (const a of known_aliases) {
    if (!byId.has(a.item_id)) continue
    const s = scoreAgainst(text, normalize(a.alias_text), false)
    best.set(a.item_id, Math.max(best.get(a.item_id) ?? 0, s))
  }
  const ranked = [...best.entries()]
    .map(([id, c]) => ({ item_id: id, item_name: byId.get(id)!.item_name, confidence: Number(c.toFixed(2)) }))
    .sort((x, y) => y.confidence - x.confidence)
  const candidates = ranked.slice(0, 3)
  const top = candidates[0]?.confidence ?? 0
  const margin = top - (candidates[1]?.confidence ?? 0)

  // STEP 3 — thresholds + hard rules.
  if (top >= MATCH && margin >= MARGIN) {
    const m = candidates[0]
    return { ...base('MATCHED'), matched_item_id: m.item_id, matched_item_name: m.item_name, confidence: m.confidence,
      candidates, new_alias_to_learn: { alias_text: aliasKey, item_id: m.item_id } }
  }
  if (top >= FLOOR) {
    return { ...base('SUGGESTED'), confidence: top, candidates,
      reasoning: `Top candidate "${candidates[0].item_name}" scored ${top} but is not confident enough to auto-resolve (margin ${margin.toFixed(2)}).` }
  }
  return { ...base('UNMATCHED'), candidates: candidates.filter((c) => c.confidence > 0),
    reasoning: 'No item in the master is a confident match; likely a new item, not yet in Store Item Master.' }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm run test -- src/lib/item-resolver/resolve.test.ts`
Expected: PASS (4 tests). If the `Distil watr` case lands just under 0.90, nudge `WEIGHTS`/`codeBoost` in the single `WEIGHTS` constant until the three worked examples pass — do not special-case any input.

- [ ] **Step 5: Commit**

```bash
git add src/lib/item-resolver/resolve.ts src/lib/item-resolver/resolve.test.ts
git commit -m "feat(resolver): resolution orchestrator with thresholds + hard rules"
```

---

### Task 6: `service.ts` — DB load + alias persistence; `index.ts` exports

**Files:**
- Create: `src/lib/item-resolver/service.ts`
- Create: `src/lib/item-resolver/index.ts`

**Interfaces — Produces:** `resolveDescription(args: { rawDescription; sourceType; vendorId? }): Promise<ResolverResult>` — loads master + aliases, calls `resolve`, and upserts `new_alias_to_learn`.

- [ ] **Step 1: Implement the service**

```ts
// src/lib/item-resolver/service.ts
import { db } from '@/lib/db'
import { resolve, type SourceType, type MasterItem, type KnownAlias, type ResolverResult } from './resolve'

export async function resolveDescription(args: { rawDescription: string; sourceType: SourceType; vendorId?: string | null }): Promise<ResolverResult> {
  const [items, aliases] = await Promise.all([
    db.item.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true, category: true, unit: true, itemCode: true } }),
    db.itemAlias.findMany({ select: { aliasText: true, itemId: true, sourceType: true, vendorId: true, confidenceScore: true, timesMatched: true } }),
  ])
  const item_master: MasterItem[] = items.map((i) => ({ item_id: i.id, item_name: i.name, category: i.category, unit: i.unit, item_code: i.itemCode ?? '' }))
  const known_aliases: KnownAlias[] = aliases.map((a) => ({ alias_text: a.aliasText, item_id: a.itemId, source_type: a.sourceType, vendor_id: a.vendorId, confidence_score: a.confidenceScore, times_matched: a.timesMatched }))

  const result = resolve({ raw_description: args.rawDescription, source_type: args.sourceType, vendor_id: args.vendorId ?? null, item_master, known_aliases })

  if (result.new_alias_to_learn) {
    const { alias_text, item_id } = result.new_alias_to_learn
    const existing = await db.itemAlias.findFirst({ where: { aliasText: alias_text, itemId: item_id, sourceType: args.sourceType, vendorId: args.vendorId ?? null } })
    if (existing) {
      await db.itemAlias.update({ where: { id: existing.id }, data: { timesMatched: { increment: 1 }, confidenceScore: result.confidence } })
    } else {
      await db.itemAlias.create({ data: { aliasText: alias_text, itemId: item_id, sourceType: args.sourceType, vendorId: args.vendorId ?? null, confidenceScore: result.confidence, timesMatched: 1 } })
    }
  }
  return result
}
```

```ts
// src/lib/item-resolver/index.ts
export * from './resolve'
export { resolveDescription } from './service'
```

- [ ] **Step 2: Typecheck + full suite**

Run: `npx tsc --noEmit && npm run test -- src/lib/item-resolver`
Expected: no new type errors; all resolver tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/item-resolver/service.ts src/lib/item-resolver/index.ts
git commit -m "feat(resolver): DB-backed resolve service + alias learning"
```

---

## Verification (whole feature)

```bash
npm run test -- src/lib/item-resolver   # all pure-logic + the 3 worked examples green
npx tsc --noEmit                        # service typechecks against the Prisma client
```

The engine is now callable via `resolveDescription(...)`. Wiring it into invoice OCR / employee request / manual entry, and the human review-queue UI, are the follow-on specs (spec §10).

## Self-review notes (spec coverage)

- spec §3 data model → Task 1.
- spec §4 module layout → Tasks 2–6.
- spec §5 STEP 1/2/3 + scoring → Task 5 (`resolve.ts`).
- spec §6 hard rules → Task 5 (no fallback branch; output copies master fields only; emits alias/UNMATCHED, never creates; one-input-one-result; quantity stripped in Task 2; STEP-1 gate; reasoning on SUGGESTED/UNMATCHED).
- spec §7 output schema → `ResolverResult` in Task 5.
- spec §8 alias learning → Task 6 (`service.ts`) + STEP-1 gate in Task 5.
- spec §9 tests → Tasks 2–5 unit tests.
- spec §10 out of scope → not built (review queue, integrations).
