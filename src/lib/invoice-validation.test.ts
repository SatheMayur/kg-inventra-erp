import { describe, expect, it } from 'vitest'
import { processAndValidateInvoice } from './invoice-validation'

describe('processAndValidateInvoice', () => {
  it('parses a printed multi-column invoice row with HSN, GST and amount columns', () => {
    const result = processAndValidateInvoice(
      [
        'Duo 2200 With Handle 9617 | 245500 4.00] 2,455.00 5825.42 18%] 1,718.50, 6,874.00',
        'Grand Total 4.00 Pcs. 5,825.42',
      ],
      6874,
    )

    expect(result.isValid).toBe(true)
    expect(result.globalInvoiceStatus).toBe('READY_FOR_STOCK')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].originalQty).toBeCloseTo(4)
    expect(result.lineItems[0].verifiedUnitPrice).toBeCloseTo(1718.5)
    expect(result.lineItems[0].calculatedLineTotal).toBeCloseTo(6874)
    expect(result.mismatchLog).toHaveLength(0)
  })

  it('normalizes noisy OCR rows where the trailing amount column is duplicated or rounded', () => {
    const result = processAndValidateInvoice(
      [
        'DN GLOSS BLACK 4LT 32081010 1Nos 1189.99 1,008.47 Nos 1,008.47',
        'PANEER MASALA100GM 09103090 0 12.00 89.52 94.00 1074.29',
      ],
      2082.76,
    )

    expect(result.isValid).toBe(true)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems[0].originalQty).toBeCloseTo(1)
    expect(result.lineItems[0].calculatedLineTotal).toBeCloseTo(1008.47)
    expect(result.lineItems[1].originalQty).toBeCloseTo(12)
    expect(result.lineItems[1].calculatedLineTotal).toBeCloseTo(1074.29, 1)
    expect(result.globalInvoiceStatus).not.toBe('REJECTED_MATH_ERROR')
  })

  it('ignores invoice headers, bank details, and terms lines after the item table', () => {
    const result = processAndValidateInvoice(
      [
        'Description of Goods HSN QTY BASIC DISC TXBL AMT GST % N. RATE AMOUNT',
        'Duo 2200 With Handle 9617 4.00 2455.00 5825.42 18% 1718.50 6874.00',
        'Grand Total 4.00 Pcs. 5825.42 6874.00',
        'BANK : THE SURAT PEOPLES CO. OP. BANK LTD. A/c. No. : 104111065147 IFSC : SPCB0251011',
        'Terms & Conditions GST Payable on Reverse Charge :',
        '1. Payment to be made by A/c. Payee’s cheque or demand draft only',
      ],
      6874,
    )

    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].rawDescription).toMatch(/Duo 2200 With Handle/i)
    expect(result.mismatchLog.some((entry) => /bank|terms/i.test(entry))).toBe(false)
  })

  it('keeps printed table rows from mixed column invoices and skips footer math lines', () => {
    const result = processAndValidateInvoice(
      [
        'Description of Goods and Services HSN/SAC Quantity Rate Amount',
        'DN GLOSS BLACK 4LT 32081010 1 Nos 1189.99 1008.47 1008.47',
        'ACR PUTTY BRITISH 5KG 3214 1 Nos 430.00 364.41 364.41',
        '333 NO THINNER 4 LTR 38140010 1 Nos 780.00 661.02 661.02',
        'NORTON MASSA 180 1PC 68052010 1 PC 9.99 8.47 8.47',
        'Grand Total 2982.94',
        'SGST 268.47',
        'CGST 268.47',
      ],
      2042.37,
    )

    expect(result.lineItems).toHaveLength(4)
    expect(result.lineItems.every((item) => !/sgst|cgst/i.test(item.rawDescription))).toBe(true)
    expect(result.globalInvoiceStatus).not.toBe('REJECTED_MATH_ERROR')
  })

  it('extracts only the printed item table from the RK Masala invoice and ignores footer noise', () => {
    const result = processAndValidateInvoice(
      [
        'RK MASALA PRODUCTS',
        'M/s. FACETS GEMS POLISHING WORKS PRIVATE LIMITED Invoice No : 318 Date : 03/06/2026',
        'Description of Goods HSN ACS Pcs Quantity Rate Gst Paid Rate Amount',
        '24 GARAM MASALA KG 080262 0 200 749.52 787.00 1499.05',
        '25 PANEER MASALA100GM 09103090 0 12.00 89.52 94.00 1074.29',
        '26 CHAS MASALA 1KG 09103000 0 5.00 419.05 440.00 2005.24',
        '27 CHICKEN MASALA 1KG 080262 0 2.00 757.14 795.00 1514.29',
        '28 NAMAK 2501 10 300.00 28.57 30.00 8571.42',
        'HDFC BANK BANK A/C NO.: 50200054215308 BRANCH & IFS CODE.: HDFC0009214',
        'Add: SGST @ 2.50% 4789.12',
        'Add: CGST @ 2.50% 4789.12',
        'Add: IGST 0.00',
        'Terms & Conditions GST Payable on Reverse Charge :',
        'RECEIVER\'S SIGN',
      ],
      14664.29,
    )

    expect(result.lineItems).toHaveLength(5)
    expect(result.lineItems.map((item) => item.rawDescription)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('GARAM MASALA'),
        expect.stringContaining('PANEER MASALA100GM'),
        expect.stringContaining('CHAS MASALA'),
        expect.stringContaining('CHICKEN MASALA'),
        expect.stringContaining('NAMAK'),
      ]),
    )
    expect(result.lineItems.every((item) => !/bank|terms|sgst|cgst|igst/i.test(item.rawDescription))).toBe(true)
    expect(result.mismatchLog.some((entry) => /bank|terms/i.test(entry))).toBe(false)
  })

  it('extracts the single line item from the Jalaram invoice and skips bank/tax footer lines', () => {
    const result = processAndValidateInvoice(
      [
        'GSTIN : 24ABTPG1976B1ZP',
        'SHRER JALARAM PLASTIC & GLASSWARE',
        'Duo 2200 With Handle 9617 245500 4.00 2,455.00 5,825.42 18 1,718.50 6,874.00',
        'Grand Total 4.00 Pcs. 5,825.42',
        'Sale @18%=5,825.42 CGST=524.29 SGST=524.29 IGST=0.00',
        'BANK : THE SURAT PEOPLES CO. OP. BANK LTD. A/c. No. : 104111065147 IFSC : SPCB0251011',
        'TAX PAYABLE ON REVERSE CHARGE',
      ],
      6874,
    )

    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].rawDescription).toMatch(/Duo 2200 With Handle/i)
    expect(result.lineItems[0].calculatedLineTotal).toBeCloseTo(6874, 1)
    expect(result.lineItems.every((item) => !/bank|reverse charge|cgst|sgst/i.test(item.rawDescription))).toBe(true)
  })
})
