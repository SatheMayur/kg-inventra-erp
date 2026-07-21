import { expandTokens, canonicalizeToken } from './synonyms';

function tokens(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function canonicalize(s: string): string {
  return tokens(s).map(canonicalizeToken).join(' ');
}

export function phoneticCode(token: string): string {
  if (!token) return '';
  const lower = token.toLowerCase();
  const rest = lower.slice(1).replace(/[aeiou]/g, '');
  return (lower[0] + rest).replace(/(.)\1+/g, '$1');
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

export function trigramScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const ca = canonicalize(a);
  const cb = canonicalize(b);
  const ta = trigrams(ca);
  const tb = trigrams(cb);
  let inter = 0;
  for (const g of ta) {
    if (tb.has(g)) inter++;
  }
  return (2 * inter) / (ta.size + tb.size);
}

export function tokenScore(a: string, b: string): number {
  const sa = new Set(tokens(a).map(canonicalizeToken));
  const sb = new Set(tokens(b).map(canonicalizeToken));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) {
    if (sb.has(t)) inter++;
  }
  const union = new Set([...sa, ...sb]).size;
  return inter / union;
}

export function phoneticScore(a: string, b: string): number {
  const ta = tokens(a).map(canonicalizeToken);
  const tb = tokens(b).map(canonicalizeToken);
  if (ta.length === 0) return 0;
  const codesB = new Set(tb.map(phoneticCode));
  let hits = 0;
  for (const t of ta) {
    if (codesB.has(phoneticCode(t))) hits++;
  }
  return hits / ta.length;
}
