export type Command =
  | { type: 'lowStock' }
  | { type: 'pendingRequests' }
  | { type: 'stock'; query: string }
  | { type: 'findItem'; query: string }
  | { type: 'unknown'; text: string }

function cleanQuery(s: string): string {
  return s
    .replace(/[?.!]+$/g, '')
    .replace(/\b(hai|hain|available|in stock|left|bache|bachi|remaining|ka|ki|ke)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parse a natural-language command into a structured intent. Read-only verbs only
 * (no stock mutation) so the command bar is safe to run without confirmation.
 * Deterministic today; the same Command shape can later be produced by an LLM.
 */
export function parseCommand(input: string): Command {
  const t = input.trim().toLowerCase()
  if (!t) return { type: 'unknown', text: input }

  if (/\b(low stock|low-stock|reorder|running low|out of stock|restock needed)\b/.test(t)) {
    return { type: 'lowStock' }
  }
  if (/\bpending\b.*\b(request|approval)|requests?\s+pending|approvals?\s+pending\b/.test(t)) {
    return { type: 'pendingRequests' }
  }

  let m = t.match(/(?:stock of|how many|qty of|quantity of|kitne|kitna|kitni)\s+(.+)/)
  if (m) {
    const q = cleanQuery(m[1])
    return q ? { type: 'stock', query: q } : { type: 'unknown', text: input }
  }

  m = t.match(/(?:find|search|where is|where are|locate|show me|show|lookup)\s+(.+)/)
  if (m) {
    const q = cleanQuery(m[1])
    return q ? { type: 'findItem', query: q } : { type: 'unknown', text: input }
  }

  // Bare term(s) → treat as an item search.
  const q = cleanQuery(t)
  return q ? { type: 'findItem', query: q } : { type: 'unknown', text: input }
}
