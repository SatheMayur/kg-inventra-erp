import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { parseWhatsAppMessage } from './whatsapp-parser'

describe('parseWhatsAppMessage', () => {
  const originalFetch = global.fetch

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key'
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('correctly maps a simple English item request', async () => {
    const mockResponse = {
      intent: 'create_item_request',
      language: 'english',
      reply_language: 'english',
      item_name: 'Blue Gel Pen',
      item_alias_used: 'blue pens',
      quantity: 5,
      unit: 'pcs',
      department: 'Accounts',
      vendor: '',
      invoice_no: '',
      po_no: '',
      transaction_reference: '',
      approval_action: '',
      remarks: '',
      confidence: 0.95,
      missing_fields: [],
      requires_confirmation: true,
      suggested_reply: 'I understood your request: 5 pcs Blue Gel Pen for Accounts. Should I create the requisition?',
    }

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockResponse) }],
                },
              },
            ],
          }),
      } as any)
    )

    const result = await parseWhatsAppMessage('Need 5 blue pens for Accounts')
    expect(result.intent).toBe('create_item_request')
    expect(result.item_name).toBe('Blue Gel Pen')
    expect(result.quantity).toBe(5)
    expect(result.department).toBe('Accounts')
  })

  it('correctly parses Hinglish stock query', async () => {
    const mockResponse = {
      intent: 'stock_query',
      language: 'hinglish',
      reply_language: 'hinglish',
      item_name: 'A4 Paper Ream',
      item_alias_used: 'A4 paper',
      quantity: null,
      unit: '',
      department: '',
      vendor: '',
      invoice_no: '',
      po_no: '',
      transaction_reference: '',
      approval_action: '',
      remarks: '',
      confidence: 0.9,
      missing_fields: [],
      requires_confirmation: false,
      suggested_reply: 'Main A4 Paper Ream ka stock check kar raha hoon.',
    }

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockResponse) }],
                },
              },
            ],
          }),
      } as any)
    )

    const result = await parseWhatsAppMessage('A4 paper ka stock kitna hai')
    expect(result.intent).toBe('stock_query')
    expect(result.item_name).toBe('A4 Paper Ream')
    expect(result.requires_confirmation).toBe(false)
  })

  it('correctly parses Gujarati approval request', async () => {
    const mockResponse = {
      intent: 'approve_transaction',
      language: 'gujarati',
      reply_language: 'gujarati',
      item_name: '',
      item_alias_used: '',
      quantity: null,
      unit: '',
      department: '',
      vendor: '',
      invoice_no: '',
      po_no: '',
      transaction_reference: 'REQ-1024',
      approval_action: 'approve',
      remarks: '',
      confidence: 0.98,
      missing_fields: [],
      requires_confirmation: false,
      suggested_reply: 'REQ-1024 માટે મંજૂરી મળી ગઈ છે.',
    }

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockResponse) }],
                },
              },
            ],
          }),
      } as any)
    )

    const result = await parseWhatsAppMessage('REQ-1024 મંજૂર કરો')
    expect(result.intent).toBe('approve_transaction')
    expect(result.transaction_reference).toBe('REQ-1024')
    expect(result.approval_action).toBe('approve')
  })
})
