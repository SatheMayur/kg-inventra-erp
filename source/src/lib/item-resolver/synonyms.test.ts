import { describe, it, expect } from 'vitest';
import { expandTokens } from '@/lib/item-resolver/synonyms';

describe('expandTokens', () => {
  it('maps transliterated variants to canonical tokens', () => {
    expect(expandTokens(['pani'])).toContain('water');
    expect(expandTokens(['bottal'])).toContain('bottle');
    expect(expandTokens(['watr'])).toContain('water');
  });
  it('keeps unknown tokens unchanged and dedupes', () => {
    expect(expandTokens(['water', 'water'])).toEqual(['water']);
  });
});
