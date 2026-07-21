// Seed map: variant -> canonical token. Grows operationally via the review queue.
const SYNONYMS: Record<string, string> = {
  pani: 'water', watr: 'water', wtr: 'water',
  bottal: 'bottle', botal: 'bottle', bottel: 'bottle',
  distil: 'distilled', distill: 'distilled',
  ltr: 'litre', l: 'litre', liter: 'litre',
  dabba: 'box', peti: 'box',
};

export function canonicalizeToken(token: string): string {
  return SYNONYMS[token.toLowerCase()] || token;
}

export function expandTokens(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    const canon = SYNONYMS[t];
    if (canon) out.add(canon);
  }
  return [...out];
}
