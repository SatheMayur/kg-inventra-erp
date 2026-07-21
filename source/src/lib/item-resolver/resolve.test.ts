import { describe, it, expect } from 'vitest';
import { resolve, type MasterItem, type KnownAlias } from '@/lib/item-resolver/resolve';

const master: MasterItem[] = [
  { item_id: 'ITM-DW', item_name: 'Distilled Water', category: 'Lab', unit: 'litre', item_code: 'DW01' },
  { item_id: 'ITM-UV', item_name: 'UV Sterilizer', category: 'Lab', unit: 'pcs', item_code: 'UV01' },
  { item_id: 'ITM-FL', item_name: 'Water Filter', category: 'Lab', unit: 'pcs', item_code: 'FL01' },
];

describe('resolve', () => {
  it('UNMATCHED when nothing resembles the description', () => {
    const r = resolve({
      raw_description: 'Duo 2200 With Handle',
      source_type: 'vendor_invoice',
      vendor_id: 'shree',
      item_master: master,
      known_aliases: [],
    });
    expect(r.status).toBe('UNMATCHED');
    expect(r.matched_item_id).toBeNull();
    expect(r.reasoning.length).toBeGreaterThan(0);
  });

  it('MATCHED via learned alias, quantity stripped', () => {
    const aliases: KnownAlias[] = [
      {
        alias_text: 'pani bottle',
        item_id: 'ITM-DW',
        source_type: 'employee_request',
        vendor_id: null,
        confidence_score: 0.95,
        times_matched: 12,
      },
    ];
    const r = resolve({
      raw_description: '2pc pani bottle',
      source_type: 'employee_request',
      item_master: master,
      known_aliases: aliases,
    });
    expect(r.status).toBe('MATCHED');
    expect(r.matched_item_id).toBe('ITM-DW');
  });

  it('MATCHED a typo via STEP 2 and emits a new alias to learn', () => {
    const r = resolve({
      raw_description: 'Distil watr 10ltr can',
      source_type: 'manual_entry',
      item_master: master,
      known_aliases: [],
    });
    expect(r.status).toBe('MATCHED');
    expect(r.matched_item_id).toBe('ITM-DW');
    expect(r.new_alias_to_learn?.item_id).toBe('ITM-DW');
  });

  it('never falls back to a category on low confidence', () => {
    const r = resolve({
      raw_description: 'xyzzy qwerty',
      source_type: 'manual_entry',
      item_master: master,
      known_aliases: [],
    });
    expect(r.status).toBe('UNMATCHED');
    expect(r.matched_item_id).toBeNull();
  });
});
