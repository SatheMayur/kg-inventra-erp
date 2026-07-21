import { describe, expect, it } from 'vitest'
import {
  DAILY_QUOTE_STATUS,
  buildDailyRateEnquiryMessage,
  calculateNetPurchaseQuantity,
  normalizeQuotedRate,
  rankVendorQuotes,
} from './daily-procurement'

describe('daily procurement business helpers', () => {
  it('calculates net purchase quantity from requirement, closing stock, usable stock, and pending supply', () => {
    expect(calculateNetPurchaseQuantity({
      operationalRequirement: 50,
      requiredClosingStock: 5,
      usableStock: 12,
      confirmedPendingSupply: 8,
    })).toBe(35)
  })

  it('does not return negative net quantity', () => {
    expect(calculateNetPurchaseQuantity({
      operationalRequirement: 5,
      requiredClosingStock: 0,
      usableStock: 20,
      confirmedPendingSupply: 5,
    })).toBe(0)
  })

  it('normalizes quoted rate using conversion factor', () => {
    expect(normalizeQuotedRate({
      quotedRate: 800,
      quotedUnit: 'crate',
      stockUnit: 'kg',
      conversionFactor: 20,
    })).toEqual({
      normalizedRate: 40,
      conversionFactor: 20,
      needsConversionReview: true,
    })
  })

  it('requires conversion review when quote unit and stock unit cannot be compared', () => {
    expect(normalizeQuotedRate({
      quotedRate: 800,
      quotedUnit: 'crate',
      stockUnit: 'kg',
    })).toEqual({
      normalizedRate: null,
      conversionFactor: null,
      needsConversionReview: true,
    })
  })

  it('does not recommend purely by lowest rate when availability and grade are weaker', () => {
    const ranked = rankVendorQuotes([
      {
        quoteId: 'a',
        supplierId: 'supplier-a',
        supplierName: 'Vendor A',
        requestedQuantity: 45,
        availableQuantity: 45,
        normalizedRate: 42,
        transportCharge: 0,
        taxRate: 0,
        qualityGrade: 'A',
        requiredQualityGrade: 'A',
        verificationStatus: DAILY_QUOTE_STATUS.VERIFIED,
      },
      {
        quoteId: 'b',
        supplierId: 'supplier-b',
        supplierName: 'Vendor B',
        requestedQuantity: 45,
        availableQuantity: 20,
        normalizedRate: 40,
        transportCharge: 0,
        taxRate: 0,
        qualityGrade: 'B',
        requiredQualityGrade: 'A',
        verificationStatus: DAILY_QUOTE_STATUS.VERIFIED,
      },
    ])

    expect(ranked[0].supplierName).toBe('Vendor A')
    expect(ranked[0].reasons).toContain('Can supply full required quantity')
    expect(ranked[0].reasons).toContain('Matches required quality grade')
    expect(ranked[1].reasons).toContain('Partial quantity available')
  })

  it('includes a unique reference in WhatsApp rate enquiry text', () => {
    const message = buildDailyRateEnquiryMessage({
      reference: 'DRE-DPB-20260719-001-ABC123',
      batchNumber: 'DPB-20260719-001',
      deliveryDate: '2026-07-19',
      deliveryLocation: 'Central Kitchen',
      deliveryTimeSlot: 'Morning',
      lines: [{ itemName: 'Tomato', requestedQty: 35, unit: 'kg', qualityGrade: 'A' }],
    })

    expect(message).toContain('DRE-DPB-20260719-001-ABC123')
    expect(message).toContain('Tomato: 35 kg')
    expect(message).toContain('Delivery location: Central Kitchen')
  })
})
