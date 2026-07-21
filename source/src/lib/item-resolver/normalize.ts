const UNITS = ['pcs','pc','pec','nos','no','ltr','litre','liter','ml','kg','gm','gms','g','mtr','box','can','pkt','packet','dozen','doz'];
const UNIT_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS.join('|')})\\b`, 'i');

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractQuantity(text: string): { quantity: { qty?: number; unit?: string }; stripped: string } {
  const norm = normalize(text);
  const m = norm.match(UNIT_RE);
  if (!m) return { quantity: {}, stripped: norm };
  const stripped = norm.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  return { quantity: { qty: Number(m[1]), unit: m[2].toLowerCase() }, stripped };
}
