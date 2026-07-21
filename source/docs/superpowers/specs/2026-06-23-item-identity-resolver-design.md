# Item Identity Resolver (Core Engine) — Design

**Date:** 2026-06-23
**Project:** KG Inventra (`Store_KG/source`, Next.js App Router + Prisma/SQLite)
**Scope (this spec):** the **core resolver engine + alias store + alias-learning**. The human review-queue UI and the three source integrations (vendor-invoice OCR, employee request, manual entry) are **follow-on specs**, not built here.

---

## 1. Plain-language summary

The same item arrives written many ways — a vendor bill says `Distil watr 10ltr can`, an employee types `pani bottle`, names come in Gujarati/Hindi/short-form. This feature reads each raw name and decides **which canonical item in the Store Item Master it is**, doing exactly one of:

1. **MATCHED** — confident → link automatically.
2. **SUGGESTED** — likely but not certain → return the top 2–3 items for a human to confirm with one tap. No silent auto-resolve.
3. **UNMATCHED** — no real match → flag for a human. Never falls back to a "general/miscellaneous" item, never invents an item.

It **learns**: once a name is confirmed for an item, future exact repeats resolve instantly. It is **zero-cost**: pure in-process TypeScript, **no paid AI/LLM service and no per-use fees**. Trade-off: before it has learned a business's common names, more items land in the human-confirm pile; accuracy climbs as aliases accumulate.

---

## 2. Decisions (confirmed with product owner)

- **Engine:** pure deterministic, runs in-process inside the Next.js server. No external/LLM calls. Fully unit-testable.
- **Multilingual handling:** a **seeded starter synonym/transliteration map** that grows over time via the review queue + alias-learning (no pre-existing domain list available).
- **Dependencies:** **zero new dependencies** — trigram and phonetic matching hand-rolled.
- **Integration target:** built into KG Inventra (this spec delivers the engine + storage; callers come later).

---

## 3. Data model (one new table)

New Prisma model `ItemAlias` → table `item_aliases`. One `prisma db push`; no changes to existing models.

```
ItemAlias {
  id              String   @id @default(cuid())
  aliasText       String                       // normalized form (see §4)
  itemId          String                       // FK -> Item
  sourceType      String?                      // "vendor_invoice" | "employee_request" | "manual_entry" | null (vendor-agnostic)
  vendorId        String?                      // present for vendor_invoice-scoped aliases
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

(Item gains a back-relation `aliases ItemAlias[]` — the only edit to an existing model.)

---

## 4. Module layout — `src/lib/item-resolver/` (pure, in-process)

- `normalize.ts` — `normalize(text)`: lowercase, trim, collapse whitespace, strip punctuation. `extractQuantity(text)`: pull leading/trailing quantity-size-unit tokens (`2pc`, `10ltr`, `3 nos`, `500ml`) → `{ qty?, unit?, stripped }`. Quantity/price data is returned separately and **never** fed into identity scoring (hard rule 5).
- `synonyms.ts` — a seed map of transliteration/synonym pairs (canonical English ← variants), e.g. `pani→water`, `bottal/botal/bottle→bottle`, `watr→water`, `distil/distill→distilled`, `can→canister`, `jug→jug`, plus unit aliases (`ltr/l/litre→litre`). Exposed as `expandTokens(tokens)`. Extensible data; intended to grow.
- `similarity.ts` — three primitives, each returning 0–1:
  - `tokenScore(a, b)` — weighted Jaccard over synonym-expanded token sets.
  - `trigramScore(a, b)` — Dice coefficient over character trigrams (catches typos like `Distil watr`).
  - `phoneticScore(a, b)` — fraction of `a`-tokens whose hand-rolled phonetic code matches a `b`-token's (catches transliteration). Hand-rolled, zero deps.
- `resolve.ts` — the orchestrator `resolve(input): ResolverResult` (pure; see §5–§7). Takes `{ raw_description, source_type, vendor_id?, item_master, known_aliases }`, returns the exact output JSON. No DB access.
- `service.ts` — thin DB-facing wrapper: loads `item_master` + `known_aliases`, calls `resolve`, and persists `new_alias_to_learn` (§8). This is the only file that touches Prisma; the engine stays pure.
- `index.ts` — exports.

---

## 5. Resolution pipeline (faithful to the source spec)

**STEP 1 — Exact alias match.** Normalize `raw_description`; look it up in `known_aliases` by exact `aliasText`. For `vendor_invoice`, prefer an alias with the same `vendorId`, then fall back to a vendor-agnostic alias. A stored alias qualifies as a STEP-1 auto-resolve only when `confidenceScore ≥ 0.90 AND timesMatched ≥ 3` (hard rule 6); a weaker stored alias is carried into STEP 2 as a strong candidate rather than auto-resolved. On STEP-1 hit → **MATCHED, confidence 1.0**, stop.

**STEP 2 — Deterministic semantic/fuzzy match.** Score the normalized text against (a) every `known_aliases.aliasText` and (b) every `item_master.item_name`. Per candidate, normalized 0–1:

```
score = clamp( 0.55·tokenScore + 0.30·trigramScore + 0.15·phoneticScore + codeBoost , 0, 1 )
```

`codeBoost` (+0.2, capped) applies when the raw text contains the item's `item_code` or `hsnCode`. Alias-text matches resolve to that alias's `item_id`. Collapse to best-score-per-item; return the **top 3** candidates with their confidences. (All weights/boost live in one `WEIGHTS` constant for tuning.)

**STEP 3 — Decision threshold.**
- top ≥ **0.90** AND margin over 2nd ≥ **0.15** → **MATCHED** (auto-resolve).
- top in **[0.60, 0.90)**, OR margin < 0.15 → **SUGGESTED** (return top 3; human picks).
- all < **0.60** → **UNMATCHED** (flag for manual review / possible new item).

---

## 6. Hard rules → enforcement

| Rule | Enforcement in `resolve.ts` |
|---|---|
| Never auto-resolve to "general/miscellaneous" | No fallback branch exists; <0.60 returns UNMATCHED, always. |
| Never invent unit/HSN/category | Output copies only fields present on the matched `item_master` entry; nothing synthesized. |
| Never create a canonical item | Engine can only emit `new_alias_to_learn`/UNMATCHED; creation is the (future) review queue's job. |
| Never merge two raw descriptions | One input → one result; no cross-input merging. |
| Quantity/price never influences identity | `extractQuantity` strips it before scoring; returned separately. |
| Repeat ≥0.90 & ≥3 matches → STEP 1 | STEP-1 gate `confidenceScore ≥0.90 && timesMatched ≥3`. |
| State reasoning on SUGGESTED/UNMATCHED | `reasoning` is a required non-empty string for those statuses. |

---

## 7. Output schema

`resolve` returns exactly the source-spec JSON: `raw_description`, `source_type`, `status`, `matched_item_id`, `matched_item_name`, `confidence`, `candidates[]` (`{item_id, item_name, confidence}`), `reasoning` (required for SUGGESTED/UNMATCHED), and `new_alias_to_learn` (`{alias_text, item_id}` only when MATCHED via STEP 2 at ≥0.90; otherwise `null`).

---

## 8. Alias learning

`service.ts`, after a STEP-2 MATCHED at ≥0.90, upserts the alias: insert `{aliasText, itemId, sourceType, vendorId, confidenceScore=top, timesMatched=1}`, or if it already exists, increment `timesMatched` and update `confidenceScore`. Once a learned alias reaches `confidenceScore ≥0.90 && timesMatched ≥3`, subsequent exact repeats are caught by STEP 1 and resolve at 1.0 (hard rule 6). Human-confirmed aliases (from the future review queue) are written the same way with `confidenceScore = 1.0`.

---

## 9. Testing (vitest, co-located, zero-cost pure functions)

- The three source-spec worked examples: `Duo 2200 With Handle` (vendor_invoice, no jug/bottle in master) → UNMATCHED with reasoning; `2pc pani bottle` (alias `pani bottle` exists) → MATCHED with `2pc` extracted separately; `Distil watr 10ltr can` (master has `Distilled Water`) → MATCHED with `new_alias_to_learn` populated.
- Threshold boundaries: 0.90/0.15-margin → MATCHED vs SUGGESTED; 0.60 floor → SUGGESTED vs UNMATCHED.
- Hard-rule cases: UNMATCHED never returns a fallback item; quantity tokens do not change the matched item; STEP-1 vendor preference (same `vendorId` beats vendor-agnostic); STEP-1 gate (`<3` matches stays SUGGESTED).
- Primitive unit tests: `tokenScore`, `trigramScore`, `phoneticScore`, `normalize`, `extractQuantity`.

---

## 10. Out of scope (follow-on specs)

- The **human review queue + UI** (one-tap confirm of SUGGESTED, new-item creation for UNMATCHED, alias management).
- **Source integrations:** wiring the resolver into vendor-invoice OCR intake, employee-request entry, and manual entry.
- Any change to the OCR pipeline itself.

## 11. Assumptions

- The starter synonym/transliteration map is intentionally small; it is seeded by the implementer and grows operationally — early recall is modest by design.
- Phonetic matching is hand-rolled and English-letter based; it aids transliterated forms but is not a full Indic-script transliterator. If recall proves insufficient, a richer transliteration table (still zero-cost, just more data) is the first lever — captured here, not built now.
