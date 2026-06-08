import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { ping } from '@/lib/petpooja'

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const result = await ping()
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
