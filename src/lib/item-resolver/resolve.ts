import { normalize, extractQuantity } from './normalize';
import { tokenScore, trigramScore, phoneticScore } from './similarity';

export type MasterItem = {
  item_id: string;
  item_name: string;
  category: string;
  unit: string;
  item_code: string;
};

export type KnownAlias = {
  alias_text: string;
  item_id: string;
  source_type: string | null;
  vendor_id: string | null;
  confidence_score: number;
  times_matched: number;
};

export type SourceType = 'vendor_invoice' | 'employee_request' | 'manual_entry';

export type ResolverInput = {
  raw_description: string;
  source_type: SourceType;
  vendor_id?: string | null;
  item_master: MasterItem[];
  known_aliases: KnownAlias[];
};

export type Candidate = {
  item_id: string;
  item_name: string;
  confidence: number;
};

export type ResolverResult = {
  raw_description: string;
  source_type: SourceType;
  status: 'MATCHED' | 'SUGGESTED' | 'UNMATCHED';
  matched_item_id: string | null;
  matched_item_name: string | null;
  confidence: number;
  candidates: Candidate[];
  reasoning: string;
  new_alias_to_learn: { alias_text: string; item_id: string } | null;
};

const WEIGHTS = { token: 0.55, trigram: 0.30, phonetic: 0.15, codeBoost: 0.2 };
const MATCH = 0.90;
const MARGIN = 0.15;
const FLOOR = 0.60;
const ALIAS_MIN_TIMES = 3;
const UNITS = ['pcs','pc','pec','nos','no','ltr','litre','liter','ml','kg','gm','gms','g','mtr','box','can','pkt','packet','dozen','doz'];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function scoreAgainst(text: string, candidateName: string, codeHit: boolean): number {
  const base = WEIGHTS.token * tokenScore(text, candidateName) +
               WEIGHTS.trigram * trigramScore(text, candidateName) +
               WEIGHTS.phonetic * phoneticScore(text, candidateName);
  return clamp01(base + (codeHit ? WEIGHTS.codeBoost : 0));
}

export function resolve(input: ResolverInput): ResolverResult {
  const { raw_description, source_type, item_master, known_aliases } = input;
  const vendorId = input.vendor_id ?? null;
  const aliasKey = normalize(raw_description);
  const { stripped } = extractQuantity(raw_description);
  const text = stripped || aliasKey;

  // Clean standalone units from text for comparison purposes
  const cleanTokens = text.split(/\s+/).filter(t => !UNITS.includes(t));
  const cleanText = cleanTokens.join(' ') || text;

  const byId = new Map(item_master.map((m) => [m.item_id, m]));
  
  const base = (status: ResolverResult['status']): ResolverResult => ({
    raw_description,
    source_type,
    status,
    matched_item_id: null,
    matched_item_name: null,
    confidence: 0,
    candidates: [],
    reasoning: '',
    new_alias_to_learn: null,
  });

  // STEP 1 — exact learned-alias match (vendor-preferred)
  const exact = known_aliases.filter((a) => a.alias_text === aliasKey);
  const ordered = [
    ...exact.filter((a) => source_type === 'vendor_invoice' && a.vendor_id === vendorId),
    ...exact.filter((a) => !(source_type === 'vendor_invoice' && a.vendor_id === vendorId)),
  ];
  const learned = ordered.find((a) => a.confidence_score >= MATCH && a.times_matched >= ALIAS_MIN_TIMES);
  
  if (learned && byId.has(learned.item_id)) {
    const it = byId.get(learned.item_id)!;
    return {
      ...base('MATCHED'),
      matched_item_id: it.item_id,
      matched_item_name: it.item_name,
      confidence: 1.0,
      candidates: [{ item_id: it.item_id, item_name: it.item_name, confidence: 1.0 }],
    };
  }

  // STEP 2 — deterministic semantic/fuzzy match.
  const best = new Map<string, number>();
  for (const it of item_master) {
    const codeHit = !!it.item_code && aliasKey.includes(it.item_code.toLowerCase());
    best.set(it.item_id, scoreAgainst(cleanText, normalize(it.item_name), codeHit));
  }
  for (const a of known_aliases) {
    if (!byId.has(a.item_id)) continue;
    const s = scoreAgainst(cleanText, normalize(a.alias_text), false);
    best.set(a.item_id, Math.max(best.get(a.item_id) ?? 0, s));
  }

  const ranked = [...best.entries()]
    .map(([id, c]) => ({
      item_id: id,
      item_name: byId.get(id)!.item_name,
      confidence: Number(c.toFixed(2)),
    }))
    .sort((x, y) => y.confidence - x.confidence);

  const candidates = ranked.slice(0, 3);
  const top = candidates[0]?.confidence ?? 0;
  const margin = top - (candidates[1]?.confidence ?? 0);

  // STEP 3 — thresholds + hard rules.
  if (top >= MATCH && margin >= MARGIN) {
    const m = candidates[0];
    return {
      ...base('MATCHED'),
      matched_item_id: m.item_id,
      matched_item_name: m.item_name,
      confidence: m.confidence,
      candidates,
      new_alias_to_learn: { alias_text: aliasKey, item_id: m.item_id },
    };
  }
  
  if (top >= FLOOR) {
    return {
      ...base('SUGGESTED'),
      confidence: top,
      candidates,
      reasoning: `Top candidate "${candidates[0].item_name}" scored ${top} but is not confident enough to auto-resolve (margin ${margin.toFixed(2)}).`,
    };
  }
  
  return {
    ...base('UNMATCHED'),
    candidates: candidates.filter((c) => c.confidence > 0),
    reasoning: 'No item in the master is a confident match; likely a new item, not yet in Store Item Master.',
  };
}
