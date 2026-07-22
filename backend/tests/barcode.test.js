const { generateEAN13 } = require('../src/services/barcode');

function ean13Checksum(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

describe('generateEAN13', () => {
  test('uses India GS1 prefix 890', () => {
    const code = generateEAN13(1);
    expect(code).toMatch(/^890/);
    expect(code).toHaveLength(13);
  });

  test('item_id padded to 9 digits', () => {
    expect(generateEAN13(1)).toMatch(/^890000000001/);
    expect(generateEAN13(42)).toMatch(/^890000000042/);
    expect(generateEAN13(999999999)).toMatch(/^890999999999/);
  });

  test('checksum is valid EAN-13', () => {
    for (const id of [1, 42, 1234, 999999, 123456789]) {
      const code = generateEAN13(id);
      const head = code.slice(0, 12);
      const tail = parseInt(code.slice(12, 13));
      expect(tail).toBe(ean13Checksum(head));
    }
  });

  test('stable across calls', () => {
    expect(generateEAN13(7)).toBe(generateEAN13(7));
  });
});
