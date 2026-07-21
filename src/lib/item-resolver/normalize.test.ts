import { describe, it, expect } from 'vitest';
import { normalize, extractQuantity } from '@/lib/item-resolver/normalize';

describe('normalize', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalize('  Distil-watr,  10ltr  CAN ')).toBe('distil watr 10ltr can');
  });
});

describe('extractQuantity', () => {
  it('pulls a quantity+unit prefix and strips it', () => {
    const r = extractQuantity('2pc pani bottle');
    expect(r.quantity).toEqual({ qty: 2, unit: 'pc' });
    expect(r.stripped).toBe('pani bottle');
  });
  it('pulls an embedded size token', () => {
    const r = extractQuantity('distil watr 10ltr can');
    expect(r.quantity.qty).toBe(10);
    expect(r.quantity.unit).toBe('ltr');
    expect(r.stripped).toBe('distil watr can');
  });
  it('returns empty quantity when none present', () => {
    expect(extractQuantity('pani bottle').quantity).toEqual({});
  });
});
