import { describe, expect, it } from 'vitest'
import { classifyDocumentText } from './document-classifier'

describe('classifyDocumentText', () => {
  it('classifies ERP forms and procurement screens as ERP dashboards', () => {
    const result = classifyDocumentText(`
      KG_inventra
      Purchase & Supply
      Procurement Ops
      Record Vendor Invoice
      Raise Purchase Order
      Add Supplier
      Store Item Master
      Store Requisition Master
      Internal Tool
    `)

    expect(result.image_type).toBe('ERP_DASHBOARD')
    expect(result.confidence).toBeGreaterThan(0.7)
    expect(result.reasons.some((reason) => /store item master|record vendor invoice|procurement ops/i.test(reason))).toBe(true)
  })

  it('classifies invoice-like document text as an invoice', () => {
    const result = classifyDocumentText(`
      TAX INVOICE
      GSTIN: 24AAAAA0000A1Z5
      Invoice No: INV/2026/318
      Invoice Date: 03/06/2026
      Bill To: FACETS GEMS POLISHING WORKS PRIVATE LIMITED
      Description of Goods  HSN  Qty  Rate  Amount
      GARAM MASALA 080262 2.00 749.52 1499.05
      PANEER MASALA100GM 09103090 12.00 89.52 1074.29
      Grand Total 2573.34
    `)

    expect(result.image_type).toBe('INVOICE')
    expect(result.confidence).toBeGreaterThan(0.7)
    expect(result.reasons.some((reason) => /gstin|invoice no|grand total|description of goods/i.test(reason))).toBe(true)
  })

  it('classifies short transaction slips as receipts', () => {
    const result = classifyDocumentText(`
      Receipt
      Item A 2 50 100
      Item B 1 75 75
      Thank you
      Total 175
    `)

    expect(result.image_type).toBe('RECEIPT')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('falls back to other when no strong signals are present', () => {
    const result = classifyDocumentText('random notes and fragments without a transaction format')

    expect(result.image_type).toBe('OTHER')
    expect(result.confidence).toBeLessThan(0.5)
  })
})
