import { z } from 'zod'
import { ApiError } from './api-utils'

export const geminiInvoiceLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().finite().nullable().optional(),
  unit: z.string().max(32).nullable().optional(),
  rate: z.number().finite().nullable().optional(),
  amount: z.number().finite().nullable().optional(),
})

export const geminiInvoiceExtractionSchema = z.object({
  document_type: z.enum(['gst_invoice', 'cash_memo', 'estimate_bill', 'handwritten_receipt', 'unknown']),
  supplier: z.object({
    name: z.string().nullable().optional(),
    gstin: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
  }),
  buyer: z.object({
    name: z.string().nullable().optional(),
    gstin: z.string().nullable().optional(),
  }),
  invoice_details: z.object({
    invoice_number: z.string().nullable().optional(),
    invoice_date: z.string().nullable().optional(),
    place_of_supply: z.string().nullable().optional(),
  }),
  line_items: z.array(geminiInvoiceLineItemSchema),
  totals: z.object({
    subtotal: z.number().finite().nullable().optional(),
    tax: z.number().finite().nullable().optional(),
    grand_total: z.number().finite().nullable().optional(),
  }),
  warnings: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
})

export type GeminiInvoiceExtraction = z.infer<typeof geminiInvoiceExtractionSchema>

export interface GeminiInvoiceExtractionResult {
  model: string
  extraction: GeminiInvoiceExtraction
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta'

const GEMINI_INVOICE_SCHEMA = {
  type: 'object',
  properties: {
    document_type: {
      type: 'string',
      enum: ['gst_invoice', 'cash_memo', 'estimate_bill', 'handwritten_receipt', 'unknown'],
      description: 'Classify the document type.',
    },
    supplier: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
        gstin: { type: ['string', 'null'] },
        address: { type: ['string', 'null'] },
      },
      required: ['name', 'gstin', 'address'],
      additionalProperties: false,
    },
    buyer: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
        gstin: { type: ['string', 'null'] },
      },
      required: ['name', 'gstin'],
      additionalProperties: false,
    },
    invoice_details: {
      type: 'object',
      properties: {
        invoice_number: { type: ['string', 'null'] },
        invoice_date: { type: ['string', 'null'] },
        place_of_supply: { type: ['string', 'null'] },
      },
      required: ['invoice_number', 'invoice_date', 'place_of_supply'],
      additionalProperties: false,
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          rate: { type: ['number', 'null'] },
          amount: { type: ['number', 'null'] },
        },
        required: ['description', 'quantity', 'unit', 'rate', 'amount'],
        additionalProperties: false,
      },
    },
    totals: {
      type: 'object',
      properties: {
        subtotal: { type: ['number', 'null'] },
        tax: { type: ['number', 'null'] },
        grand_total: { type: ['number', 'null'] },
      },
      required: ['subtotal', 'tax', 'grand_total'],
      additionalProperties: false,
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['document_type', 'supplier', 'buyer', 'invoice_details', 'line_items', 'totals', 'warnings', 'confidence'],
  additionalProperties: false,
} as const

function inferMimeType(file: File) {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

function normalizeGeminiText(value: string) {
  return value
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stringifyValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return ''
  return typeof value === 'number' ? value.toFixed(2).replace(/\.00$/, '') : value.trim()
}

export function buildCanonicalInvoiceText(extraction: GeminiInvoiceExtraction) {
  const lines: string[] = []

  const supplierName = extraction.supplier.name?.trim()
  if (supplierName) lines.push(supplierName)

  const gstin = extraction.supplier.gstin?.trim()
  if (gstin) lines.push(`GSTIN ${gstin}`)

  const invoiceNumber = extraction.invoice_details.invoice_number?.trim()
  if (invoiceNumber) lines.push(`Invoice No ${invoiceNumber}`)

  const invoiceDate = extraction.invoice_details.invoice_date?.trim()
  if (invoiceDate) lines.push(`Invoice Date ${invoiceDate}`)

  const placeOfSupply = extraction.invoice_details.place_of_supply?.trim()
  if (placeOfSupply) lines.push(`Place of Supply ${placeOfSupply}`)

  for (const item of extraction.line_items) {
    const row = [
      item.description.trim(),
      stringifyValue(item.quantity),
      stringifyValue(item.unit),
      stringifyValue(item.rate),
      stringifyValue(item.amount),
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (row) lines.push(row)
  }

  const subtotal = stringifyValue(extraction.totals.subtotal)
  if (subtotal) lines.push(`Subtotal ${subtotal}`)

  const tax = stringifyValue(extraction.totals.tax)
  if (tax) lines.push(`Tax ${tax}`)

  const grandTotal = stringifyValue(extraction.totals.grand_total)
  if (grandTotal) lines.push(`Grand Total ${grandTotal}`)

  const warnings = extraction.warnings?.map((warning) => warning.trim()).filter(Boolean) ?? []
  for (const warning of warnings) {
    lines.push(`Warning ${warning}`)
  }

  return normalizeGeminiText(lines.join('\n'))
}

export async function extractInvoiceWithGemini(file: File): Promise<GeminiInvoiceExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new ApiError(503, 'Gemini OCR is not configured', 'OCR_NOT_CONFIGURED')
  }

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash'
  const prompt = [
    'Extract invoice data from the attached document.',
    'Only return JSON that matches the schema.',
    'Classify the document as gst_invoice, cash_memo, estimate_bill, handwritten_receipt, or unknown.',
    'For each line item, preserve the invoice quantity exactly as shown on the document.',
    'Do not convert pack quantities into stock quantities.',
    'If the document is not an invoice or is too unclear, return unknown with warnings.',
  ].join(' ')

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const response = await fetch(`${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: inferMimeType(file),
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseFormat: {
          text: {
            mimeType: 'application/json',
            schema: GEMINI_INVOICE_SCHEMA,
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new ApiError(
      502,
      bodyText ? `Gemini extraction failed: ${bodyText.slice(0, 240)}` : `Gemini extraction failed with HTTP ${response.status}`,
      'OCR_PROVIDER_ERROR',
    )
  }

  const json = await response.json()
  const text = json?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: unknown }) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()

  if (!text) {
    throw new ApiError(502, 'Gemini returned an empty invoice extraction response', 'OCR_PROVIDER_ERROR')
  }

  const parsed = geminiInvoiceExtractionSchema.parse(JSON.parse(text))
  return {
    model,
    extraction: parsed,
  }
}
