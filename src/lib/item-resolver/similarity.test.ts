import { describe, it, expect } from 'vitest';
import { tokenScore, trigramScore, phoneticScore, phoneticCode } from '@/lib/item-resolver/similarity';

describe('phoneticCode', () => {
  it('collapses vowels so transliterations align', () => {
    expect(phoneticCode('water')).toBe(phoneticCode('watr'));
    expect(phoneticCode('bottle')).toBe(phoneticCode('bottal'));
    expect(phoneticCode('pani')).toBe(phoneticCode('paani'));
  });
});

describe('trigramScore', () => {
  it('is 1 for identical strings and high for a typo', () => {
    expect(trigramScore('distilled water', 'distilled water')).toBe(1);
    expect(trigramScore('distil watr', 'distilled water')).toBeGreaterThan(0.4);
  });
  it('is 0 for disjoint strings', () => {
    expect(trigramScore('abc', 'xyz')).toBe(0);
  });
});

describe('tokenScore', () => {
  it('rewards shared (synonym-expanded) tokens', () => {
    expect(tokenScore('pani bottle', 'water bottle')).toBeGreaterThan(0.5);
    expect(tokenScore('uv sterilizer', 'water filter')).toBe(0);
  });
});

describe('phoneticScore', () => {
  it('matches transliterated tokens', () => {
    expect(phoneticScore('watr', 'water')).toBe(1);
  });
});
