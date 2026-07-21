import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/auth'
import { ApiError, handleApiError } from '@/lib/api-utils'
import { analyzeOcrExtraction } from '@/lib/ocr-reliability'
import { buildCanonicalInvoiceText, extractInvoiceWithGemini } from '@/lib/gemini-invoice'

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin'])
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const formData = await request.formData()
    const filePart = formData.get('file')

    if (!(filePart instanceof File)) {
      throw new ApiError(400, 'Invoice file is required', 'BAD_REQUEST')
    }

    const { extraction, model } = await extractInvoiceWithGemini(filePart)
    const canonicalText = buildCanonicalInvoiceText(extraction)
    if (!canonicalText.trim()) {
      throw new ApiError(422, 'Gemini did not return enough invoice detail to continue', 'UNSUPPORTED_DOCUMENT')
    }

    const analysis = analyzeOcrExtraction(canonicalText)
    return NextResponse.json({
      model,
      canonicalText,
      extraction,
      analysis,
      sourceName: extraction.supplier.name?.trim() || null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
