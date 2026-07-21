import { z } from 'zod'
import { db } from './db'
import { ApiError } from './api-utils'

export const whatsappParserResultSchema = z.object({
  intent: z.enum([
    'stock_query',
    'create_item_request',
    'create_purchase_order',
    'create_purchase_invoice_draft',
    'transfer_to_department',
    'issue_item',
    'approve_transaction',
    'reject_transaction',
    'restock_request',
    'unknown',
  ]),
  language: z.string(),
  reply_language: z.string(),
  item_name: z.string().default(''),
  item_alias_used: z.string().default(''),
  quantity: z.number().nullable().optional(),
  unit: z.string().default(''),
  department: z.string().default(''),
  vendor: z.string().default(''),
  invoice_no: z.string().default(''),
  po_no: z.string().default(''),
  transaction_reference: z.string().default(''),
  approval_action: z.string().default(''),
  remarks: z.string().default(''),
  confidence: z.number().min(0).max(1),
  missing_fields: z.array(z.string()).default([]),
  requires_confirmation: z.boolean().default(true),
  suggested_reply: z.string().default(''),
})

export type WhatsAppParserResult = z.infer<typeof whatsappParserResultSchema>

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta'

const WHATSAPP_PARSER_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: [
        'stock_query',
        'create_item_request',
        'create_purchase_order',
        'create_purchase_invoice_draft',
        'transfer_to_department',
        'issue_item',
        'approve_transaction',
        'reject_transaction',
        'restock_request',
        'unknown',
      ],
      description: 'The classified ERP intent.',
    },
    language: {
      type: 'string',
      description: 'The detected language of the user message (e.g., english, hindi, gujarati, hinglish, gujlish, mixed).',
    },
    reply_language: {
      type: 'string',
      description: 'The dialect or language used for reply (should match the main dialect of user message).',
    },
    item_name: {
      type: 'string',
      description: 'The normalized name of the item from the catalog. Leave blank if not applicable.',
    },
    item_alias_used: {
      type: 'string',
      description: 'The exact raw item name string used by the user in their message.',
    },
    quantity: {
      type: ['number', 'null'],
      description: 'Extracted numeric quantity.',
    },
    unit: {
      type: 'string',
      description: 'Extracted or normalized unit of measurement (e.g. pcs, kg, ream, pack).',
    },
    department: {
      type: 'string',
      description: 'The normalized department name. Leave blank if not applicable.',
    },
    vendor: {
      type: 'string',
      description: 'Extracted vendor name.',
    },
    invoice_no: {
      type: 'string',
      description: 'Extracted invoice number.',
    },
    po_no: {
      type: 'string',
      description: 'Extracted Purchase Order number.',
    },
    transaction_reference: {
      type: 'string',
      description: 'Extracted transaction or request code/reference (e.g. REQ-1024).',
    },
    approval_action: {
      type: 'string',
      enum: ['approve', 'reject', ''],
      description: 'Action for transaction approval requests.',
    },
    remarks: {
      type: 'string',
      description: 'Any additional remarks or notes.',
    },
    confidence: {
      type: 'number',
      description: 'Confidence score from 0.0 to 1.0.',
    },
    missing_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Required fields that are missing from the message for this intent.',
    },
    requires_confirmation: {
      type: 'boolean',
      description: 'Whether this action requires confirmation (drafts, creation, transfers require confirmation; queries or explicit approvals do not).',
    },
    suggested_reply: {
      type: 'string',
      description: 'A polite, natural suggested reply in the user\'s language/dialect confirming or clarifying the transaction.',
    },
  },
  required: [
    'intent',
    'language',
    'reply_language',
    'item_name',
    'item_alias_used',
    'quantity',
    'unit',
    'department',
    'vendor',
    'invoice_no',
    'po_no',
    'transaction_reference',
    'approval_action',
    'remarks',
    'confidence',
    'missing_fields',
    'requires_confirmation',
    'suggested_reply',
  ],
  additionalProperties: false,
} as const

function localFallbackParser(
  message: string,
  activeItemNames: string[],
  departments: string[]
): WhatsAppParserResult {
  const normalizedMsg = message.toLowerCase().trim()

  const result: WhatsAppParserResult = {
    intent: 'unknown',
    language: 'english',
    reply_language: 'english',
    item_name: '',
    item_alias_used: '',
    quantity: null,
    unit: 'pcs',
    department: '',
    vendor: '',
    invoice_no: '',
    po_no: '',
    transaction_reference: '',
    approval_action: '',
    remarks: '',
    confidence: 0.8,
    missing_fields: [],
    requires_confirmation: false,
    suggested_reply: 'Hello! I am your Store Assistant. How can I help you today?',
  }

  const findItem = (text: string) => {
    for (const name of activeItemNames) {
      if (text.includes(name.toLowerCase())) {
        return name
      }
    }
    const words = text.split(/\s+/)
    for (const word of words) {
      if (word.length < 3) continue
      for (const name of activeItemNames) {
        if (name.toLowerCase().includes(word)) {
          return name
        }
      }
    }
    return ''
  }

  const findDept = (text: string) => {
    for (const dept of departments) {
      if (text.includes(dept.toLowerCase())) {
        return dept
      }
    }
    return ''
  }

  // 1. Greet / Help check
  if (normalizedMsg === 'hello' || normalizedMsg === 'hi' || normalizedMsg === 'hey' || normalizedMsg === 'help') {
    result.intent = 'unknown'
    result.suggested_reply = `👋 Hello! I am your Store Assistant.\n\nYou can ask me things like:\n• "Stock of Blue Gel Pen"\n• "Need 5 Safety Goggles for Accounts"\n• "Approve REQ-1024"`
    return result
  }

  // 2. Stock Query
  if (normalizedMsg.includes('stock') || normalizedMsg.includes('how many') || normalizedMsg.includes('kitna') || normalizedMsg.includes('avail')) {
    const matchedItem = findItem(normalizedMsg)
    result.intent = 'stock_query'
    if (matchedItem) {
      result.item_name = matchedItem
      result.suggested_reply = `Checking stock details for *${matchedItem}*...`
    } else {
      result.suggested_reply = `I understand you are asking about stock, but I couldn't find that item in our catalog. Could you please specify the exact item name?`
      result.missing_fields.push('item_name')
    }
    return result
  }

  // 3. Approval Action (Approve / Reject)
  const reqMatch = normalizedMsg.match(/req-\d+/i)
  if (reqMatch) {
    const ref = reqMatch[0].toUpperCase()
    result.transaction_reference = ref

    if (normalizedMsg.includes('approve') || normalizedMsg.includes('manjur') || normalizedMsg.includes('yes') || normalizedMsg.includes('ok')) {
      result.intent = 'approve_transaction'
      result.approval_action = 'approve'
      result.suggested_reply = `Processing approval for request *${ref}*...`
      return result
    } else if (normalizedMsg.includes('reject') || normalizedMsg.includes('cancel') || normalizedMsg.includes('no') || normalizedMsg.includes('deny')) {
      result.intent = 'reject_transaction'
      result.approval_action = 'reject'
      result.suggested_reply = `Rejecting request *${ref}*...`
      return result
    }
  }

  // 4. Create Item Request (e.g. "Need 5 pens for Accounts", "Request 2 A4 paper")
  if (normalizedMsg.includes('need') || normalizedMsg.includes('request') || normalizedMsg.includes('issue') || normalizedMsg.includes('want') || normalizedMsg.includes('mange') || normalizedMsg.includes('joie')) {
    result.intent = 'create_item_request'
    result.requires_confirmation = true

    // Extract quantity
    const qtyMatch = normalizedMsg.match(/\b\d+\b/)
    if (qtyMatch) {
      result.quantity = parseInt(qtyMatch[0], 10)
    }

    const matchedItem = findItem(normalizedMsg)
    if (matchedItem) {
      result.item_name = matchedItem
    } else {
      result.missing_fields.push('item_name')
    }

    const matchedDept = findDept(normalizedMsg)
    if (matchedDept) {
      result.department = matchedDept
    }

    if (matchedItem && result.quantity) {
      result.suggested_reply = `I will prepare a request draft for *${result.quantity}x ${matchedItem}*${matchedDept ? ` for *${matchedDept}* department` : ''}. Please reply "YES" to confirm and submit.`
    } else {
      result.suggested_reply = `I detected that you want to request an item.\n${!result.quantity ? '• Please specify the quantity.\n' : ''}${!matchedItem ? '• Please specify the item name.\n' : ''}`
    }
    return result
  }

  // Fallback default
  result.suggested_reply = `I'm not quite sure how to parse that command. You can ask for item stock (e.g., "stock of Blue Gel Pen") or request items (e.g., "Need 5 Blue Gel Pens for Admin").`
  return result
}

export async function parseWhatsAppMessage(message: string, customApiKey?: string): Promise<WhatsAppParserResult> {
  const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim()

  // Fetch active items dynamically
  let activeItemNames: string[] = []
  try {
    const items = await db.item.findMany({
      where: { deletedAt: null, active: true },
      select: { name: true },
    })
    activeItemNames = items.map((i) => i.name)
  } catch (err) {
    // Database fallback
    activeItemNames = [
      'A4 Paper Ream',
      'Blue Gel Pen',
      'Diamond Blade 4"',
      'Hand Sanitizer',
      'HDMI Cable 2m',
      'Polishing Compound',
      'Safety Goggles',
      'USB-C Hub',
    ]
  }

  const departments = [
    'Accounts',
    'IT',
    'Admin',
    'Production',
    'Maintenance',
    'HR',
    'Purchase',
    'Stores',
  ]

  if (!apiKey) {
    console.warn('⚠️ Gemini API Key not found. Falling back to local keyword parser.')
    return localFallbackParser(message, activeItemNames, departments)
  }

  try {
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-1.5-flash'

    const prompt = `
You are the KG Inventra WhatsApp ERP Assistant. Your job is to understand WhatsApp messages written in English, Hindi, Gujarati, Hinglish, Gujlish, or mixed language and parse them into a structured JSON format matching the schema.

Here is the list of active Item Master names in the system:
${activeItemNames.map((name) => `- "${name}"`).join('\n')}

Here is the list of active departments in the system:
${departments.map((dept) => `- "${dept}"`).join('\n')}

Understand Gujarati, Hindi, and English mixed messages. Normalize the items and departments to the closest match in the lists above.
If the message is unclear or does not map to any intent, set intent to "unknown".

Important constraints:
- Set intent to "unknown" if the message is completely unclear.
- Normalize item names strictly to the closest match in the Active Item Master names list.
- If the item mentioned is not in the list and cannot be confidently mapped, do not invent. Use the closest match or place the raw value in item_alias_used and leave item_name blank.
- Set confidence from 0 to 1.
- The suggested_reply must match the user's main language and dialect (e.g., Hinglish replies for Hinglish inputs, Gujarati for Gujarati, etc.).
- Actions like creations, drafts, and transfers require confirmation (requires_confirmation: true). Explicit approvals or direct queries do not (requires_confirmation: false).

User message: "${message}"
`

    const response = await fetch(
      `${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseFormat: {
              type: 'application/json',
              responseSchema: WHATSAPP_PARSER_SCHEMA,
            },
          },
        }),
      }
    )

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      throw new ApiError(
        502,
        bodyText ? `Gemini parsing failed: ${bodyText.slice(0, 240)}` : `Gemini parsing failed with HTTP ${response.status}`,
        'GEMINI_PROVIDER_ERROR'
      )
    }

    const json = await response.json()
    const text = json?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: unknown }) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()

    if (!text) {
      throw new ApiError(502, 'Gemini returned an empty response', 'GEMINI_PROVIDER_ERROR')
    }

    const parsed = whatsappParserResultSchema.parse(JSON.parse(text))
    return parsed
  } catch (geminiError: any) {
    console.error('⚠️ Gemini parsing failed. Falling back to local keyword parser:', geminiError.message || geminiError)
    return localFallbackParser(message, activeItemNames, departments)
  }
}
