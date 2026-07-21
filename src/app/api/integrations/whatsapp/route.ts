import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/lib/auth'
import { handleApiError, ApiError } from '@/lib/api-utils'
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await request.json()
    const { message } = body
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message string is required' }, { status: 400 })
    }

    const customApiKey = request.headers.get('x-gemini-key') || undefined

    // 1. Call Gemini LLM parser to understand intent & extract entities
    const parseResult = await parseWhatsAppMessage(message, customApiKey)

    // 2. Perform DB operations or enhance answer based on intent
    let actionTaken = 'None'
    let dbDetails: any = null
    let enhancedReply = parseResult.suggested_reply

    if (parseResult.intent === 'stock_query' && parseResult.item_name) {
      const item = await db.item.findFirst({
        where: { name: parseResult.item_name, deletedAt: null, active: true }
      })
      if (item) {
        dbDetails = {
          id: item.id,
          name: item.name,
          stock: item.stock,
          unit: item.unit,
          minStock: item.minStock
        }
        actionTaken = 'Query Stock'
        enhancedReply = `${parseResult.suggested_reply}\n[Real Stock Data: ${item.stock} ${item.unit} available in system]`
      } else {
        dbDetails = { name: parseResult.item_name, exists: false }
        actionTaken = 'Query Stock (Not Found)'
        enhancedReply = `${parseResult.suggested_reply}\n[System Message: Item "${parseResult.item_name}" not found in catalog]`
      }
    } else if ((parseResult.intent === 'approve_transaction' || parseResult.intent === 'reject_transaction') && parseResult.transaction_reference) {
      const ref = parseResult.transaction_reference.replace(/^REQ-/, '').trim()
      
      const req = await db.request.findFirst({
        where: {
          OR: [
            { id: ref },
            { id: { endsWith: ref } }
          ]
        },
        include: { lines: true }
      })

      if (req) {
        const isApprove = parseResult.intent === 'approve_transaction'
        const targetStatus = isApprove ? 'APPROVED' : 'REJECTED'
        
        // Update request status
        await db.request.update({
          where: { id: req.id },
          data: { status: targetStatus }
        })
        
        actionTaken = isApprove ? 'Approved Request' : 'Rejected Request'
        dbDetails = {
          requestId: req.id,
          employee: req.employee,
          department: req.department,
          status: targetStatus,
          linesCount: req.lines.length
        }
        enhancedReply = `${parseResult.suggested_reply}\n[System Action: Request ${req.id} status updated to "${targetStatus}"]`
      } else {
        actionTaken = 'Approval/Rejection (Not Found)'
        dbDetails = { reference: parseResult.transaction_reference, exists: false }
        enhancedReply = `${parseResult.suggested_reply}\n[System Warning: Request ID matching "${parseResult.transaction_reference}" not found]`
      }
    } else if (parseResult.intent === 'create_item_request' && parseResult.item_name && parseResult.quantity) {
      const item = await db.item.findFirst({
        where: { name: parseResult.item_name, deletedAt: null, active: true }
      })
      
      if (item) {
        dbDetails = {
          itemId: item.id,
          itemName: item.name,
          quantity: parseResult.quantity,
          unit: item.unit,
          department: parseResult.department || auth.user?.department || 'General'
        }
        actionTaken = 'Drafter Requisition'
      } else {
        dbDetails = {
          itemName: parseResult.item_name,
          quantity: parseResult.quantity,
          exists: false
        }
        actionTaken = 'Draft Requisition (Unknown Item)'
      }
    }

    return NextResponse.json({
      success: true,
      rawMessage: message,
      parse: parseResult,
      actionTaken,
      dbDetails,
      suggestedReply: enhancedReply
    })
  } catch (error) {
    return handleApiError(error)
  }
}
