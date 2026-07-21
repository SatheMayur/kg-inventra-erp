import { describe, expect, it } from 'vitest'
import { analyzeOcrExtraction } from './ocr-reliability'

describe('analyzeOcrExtraction', () => {
  it('classifies a gst invoice and extracts the printed top business name', () => {
    const result = analyzeOcrExtraction(`
      RK MASALA PRODUCTS
      GSTIN : 24AAWPJ4362Q1ZW
      Invoice No : 318
      Date : 03/06/2026
      Description of Goods HSN Qty Rate Amount
      GARAM MASALA 080262 2.00 749.52 1499.05
      Grand Total 1499.05
    `)

    expect(result.documentType).toBe('gst_invoice')
    expect(result.supplierName).toBe('RK MASALA PRODUCTS')
    expect(result.supplierConfidence).toBeGreaterThan(0.5)
    expect(result.warnings).toHaveLength(0)
  })

  it('uses from-line fallback for cash memo documents', () => {
    const result = analyzeOcrExtraction(`
      CASH MEMO
      From: Jaipur Kirana Store
      Item A 2 50 100
      Total 100
    `)

    expect(result.documentType).toBe('cash_memo')
    expect(result.supplierName).toBe('Jaipur Kirana Store')
  })

  it('keeps estimate bills on the shop name at the top', () => {
    const result = analyzeOcrExtraction(`
      KAPOOR HARDWARE
      ESTIMATE BILL
      Estimate No 120
      Item A 1 100 100
      Total 100
    `)

    expect(result.documentType).toBe('estimate_bill')
    expect(result.supplierName).toBe('KAPOOR HARDWARE')
  })

  it('treats low-structure slips as handwritten receipts', () => {
    const result = analyzeOcrExtraction(`
      receipt
      from raj
      tea 20
      water 10
      total 30
    `)

    expect(result.documentType).toBe('handwritten_receipt')
    expect(result.supplierName).toBe('from raj')
    expect(result.warnings.some((warning) => /handwritten/i.test(warning))).toBe(true)
  })

  it('rejects supplier values that look like transport or invoice metadata', () => {
    const result = analyzeOcrExtraction(`
      CASH MEMO
      From: Supplier/Transporter
      Item A 2 50 100
      Total 100
    `)

    expect(result.documentType).toBe('cash_memo')
    expect(result.supplierName).toBeNull()
    expect(result.warnings.some((warning) => /supplier candidate rejected/i.test(warning))).toBe(true)
  })

  it('falls back to unknown when OCR text has no useful document shape', () => {
    const result = analyzeOcrExtraction('random fragments without a bill or memo structure')

    expect(result.documentType).toBe('unknown')
    expect(result.supplierName).toBeNull()
    expect(result.warnings.some((warning) => /could not be determined/i.test(warning))).toBe(true)
  })
})
