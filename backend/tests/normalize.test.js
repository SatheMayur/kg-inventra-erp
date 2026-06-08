const { normalize, normalizeKey, reloadCustomItems } = require('../src/services/normalize');

describe('normalize — canonical resolution', () => {
  test('maps Hindi alias to canonical', () => {
    const r = normalize('aloo');
    expect(r.canonical_name).toBe('Potato');
    expect(r.category).toBe('Vegetables');
    expect(r.sub_category).toBe('Root Vegetables');
  });

  test('handles typo via fuzzy match', () => {
    const r = normalize('poteto');
    expect(r.canonical_name).toBe('Potato');
  });

  test('extracts leading quantity + unit', () => {
    const r = normalize('2 kg aloo');
    expect(r.quantity).toBe(2);
    expect(r.unit).toBe('kg');
    expect(r.canonical_name).toBe('Potato');
  });

  test('extracts trailing quantity', () => {
    const r = normalize('aloo 500g');
    expect(r.quantity).toBe(500);
    expect(r.unit).toBe('g');
  });

  test('converts dozen to pcs', () => {
    const r = normalize('1 dozen anda');
    expect(r.quantity).toBe(12);
    expect(r.unit).toBe('pcs');
    expect(r.canonical_name).toBe('Eggs');
  });

  test('does NOT treat variety code as quantity', () => {
    const r = normalize('2 kg basmati rice 1121');
    expect(r.quantity).toBe(2);
    expect(r.unit).toBe('kg');
    expect(r.canonical_name).toBe('Basmati Rice');
    expect(r.variant).toBe('1121');
  });

  test('separates form from variant', () => {
    const r = normalize('roasted salted cashew w320 500g');
    expect(r.canonical_name).toBe('Cashews');
    expect(r.form).toMatch(/Roasted/);
    expect(r.form).toMatch(/Salted/);
    expect(r.grade).toBe('W320');
    expect(r.quantity).toBe(500);
    expect(r.unit).toBe('g');
  });

  test('compound alias survives variant strip', () => {
    const r = normalize('kashmiri lal mirch');
    expect(r.canonical_name).toBe('Red Chili Powder');
    expect(r.variant).toBe('Kashmiri');
  });

  test('packaged grade synonyms', () => {
    const r1 = normalize('supreme cashews');
    expect(r1.grade).toBe('Premium');
    const r2 = normalize('economy raisins');
    expect(r2.grade).toBe('Economy');
  });

  test('fresh grade from size', () => {
    const r = normalize('large tomato');
    expect(r.grade).toBe('Extra Class');
  });

  test('packaged premium on fresh maps to Extra Class', () => {
    const r = normalize('premium aloo');
    expect(r.grade).toBe('Extra Class');
  });

  test('unknown item echoes original', () => {
    const r = normalize('dragonfruit xyz');
    expect(r.canonical_name).toBe('dragonfruit xyz');
    expect(r.category).toBeNull();
  });

  test('case + whitespace tolerant', () => {
    const r = normalize('  BHINDI  ');
    expect(r.canonical_name).toBe('Ladyfinger');
  });

  test('underscore + dot delimiters', () => {
    const r = normalize('_potato_');
    expect(r.canonical_name).toBe('Potato');
  });

  test('empty input returns null fields', () => {
    const r = normalize('');
    expect(r.canonical_name).toBe('');
    expect(r.category).toBeNull();
    expect(r.quantity).toBeNull();
  });

  test('custom item participates after reload', () => {
    reloadCustomItems([
      { canonical: 'Coconut', category: 'Vegetables', sub_category: 'Tuber & Other Vegetables', aliases: ['nariyal', 'coconut whole'] },
    ]);
    const r = normalize('nariyal 2 kg');
    expect(r.canonical_name).toBe('Coconut');
    expect(r.category).toBe('Vegetables');
    expect(r.sub_category).toBe('Tuber & Other Vegetables');
    expect(r.quantity).toBe(2);
    expect(r.unit).toBe('kg');
    // Cleanup
    reloadCustomItems([]);
  });

  test('reload clears prior custom items', () => {
    reloadCustomItems([
      { canonical: 'TestX', category: 'Spices & Condiments', sub_category: 'Whole Spices', aliases: ['testx-alias'] },
    ]);
    expect(normalize('testx-alias').canonical_name).toBe('TestX');
    reloadCustomItems([]);
    // Now testx-alias should NOT resolve any more
    const r = normalize('testx-alias');
    expect(r.canonical_name).toBe('testx-alias');
    expect(r.category).toBeNull();
  });
});

describe('normalizeKey', () => {
  test('lowercases + strips noise', () => {
    expect(normalizeKey('  ALOO! ')).toBe('aloo');
    expect(normalizeKey('_potato_')).toBe('potato');
    expect(normalizeKey('Lal Mirch')).toBe('lal mirch');
  });
});
