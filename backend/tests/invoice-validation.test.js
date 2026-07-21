const { processAndValidateInvoice } = require('../src/services/invoice-validation');

describe('processAndValidateInvoice', () => {
  test('validates stationery pack rows and normalizes to pcs', () => {
    const result = processAndValidateInvoice([
      'Box of 24 premium pens 2 100 200',
    ], 200);

    expect(result.isValid).toBe(true);
    expect(result.globalInvoiceStatus).toBe('READY_FOR_STOCK');
    expect(result.calculatedSubtotal).toBe(200);
    expect(result.mismatchLog).toHaveLength(0);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]).toMatchObject({
      category: 'STATIONERY',
      originalQty: 2,
      normalizedStockQty: 48,
      inventoryUnit: 'pcs',
      verifiedUnitPrice: 4.17,
      calculatedLineTotal: 200,
      lineStatus: 'VALID',
    });
    expect(result.lineItems[0].systemNote).toMatch(/pack size x24/i);
  });

  test('normalizes liquid quantities to liters from ml and paired units', () => {
    const result = processAndValidateInvoice([
      'Industrial solvent 500 ml 2 1000',
      'Acid cleaner 1 Gallon 3.785 3.785',
    ], 1003.785);

    expect(result.isValid).toBe(true);
    expect(result.globalInvoiceStatus).toBe('READY_FOR_STOCK');
    expect(result.lineItems[0]).toMatchObject({
      category: 'LIQUIDS',
      originalQty: 500,
      normalizedStockQty: 0.5,
      inventoryUnit: 'Liters',
      calculatedLineTotal: 1000,
      lineStatus: 'VALID',
    });
    expect(result.lineItems[0].systemNote).toMatch(/converted ml to Liters/i);
    expect(result.lineItems[1]).toMatchObject({
      category: 'LIQUIDS',
      originalQty: 1,
      normalizedStockQty: 3.785,
      inventoryUnit: 'Liters',
      lineStatus: 'VALID',
    });
  });

  test('flags diamond tools missing required physical and grit specs', () => {
    const result = processAndValidateInvoice([
      'Diamond blade 2 100 200',
    ], 200);

    expect(result.isValid).toBe(true);
    expect(result.globalInvoiceStatus).toBe('WARNING_RETAINED');
    expect(result.lineItems[0].lineStatus).toBe('WARNING');
    expect(result.lineItems[0].systemNote).toMatch(/missing physical dimension and mesh grit rating/i);
    expect(result.mismatchLog[0]).toMatch(/DIAMOND_TOOLS warning/i);
  });

  test('rejects horizontal math errors and grand total mismatches', () => {
    const result = processAndValidateInvoice([
      'Nails 2 10 30',
    ], 30);

    expect(result.isValid).toBe(false);
    expect(result.globalInvoiceStatus).toBe('REJECTED_MATH_ERROR');
    expect(result.lineItems[0].lineStatus).toBe('ERROR');
    expect(result.mismatchLog.some((msg) => /horizontal math mismatch/i.test(msg))).toBe(true);
  });

  test('sanitizes common OCR digit confusions', () => {
    const result = processAndValidateInvoice([
      'Packing tape l 1O.OO 1O.OO',
    ], '10.00');

    expect(result.isValid).toBe(true);
    expect(result.lineItems[0].originalQty).toBe(1);
    expect(result.lineItems[0].verifiedUnitPrice).toBe(10);
    expect(result.lineItems[0].calculatedLineTotal).toBe(10);
  });
});
