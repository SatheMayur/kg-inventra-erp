import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import QRCode from 'qrcode'
import { emitWhatsAppSessionChanged } from '@/lib/realtime'

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const session = await db.whatsAppSession.findUnique({
      where: { id: 'default' }
    })

    if (!session) {
      return NextResponse.json({
        status: 'DISCONNECTED',
        qrCode: null,
        qrDataUrl: null,
        reconnects: 0,
        message: 'No WhatsApp session initialized.'
      })
    }

    const ageMs = Date.now() - new Date(session.updatedAt).getTime()

    // 1. Relink command issued but bridge has not picked it up or reported status yet
    if (session.command === 'RELINK') {
      if (ageMs < 30000) {
        return NextResponse.json({
          status: 'STARTING',
          qrCode: null,
          qrDataUrl: null,
          reconnects: session.reconnects,
          message: 'Initializing WhatsApp bridge and requesting QR code...'
        })
      } else {
        return NextResponse.json({
          status: 'ERROR',
          qrCode: null,
          qrDataUrl: null,
          reconnects: session.reconnects,
          message: 'WhatsApp bridge service is not responding. Ensure bridge process is running.'
        })
      }
    }

    // 2. Connected state
    if (session.status === 'CONNECTED') {
      return NextResponse.json({
        status: 'CONNECTED',
        qrCode: null,
        qrDataUrl: null,
        reconnects: session.reconnects,
        message: 'WhatsApp bridge connected successfully.'
      })
    }

    // 3. Connecting / Pairing state
    if (session.status === 'CONNECTING') {
      if (session.qrCode) {
        if (ageMs <= 60000) {
          let qrDataUrl: string | null = null
          try {
            qrDataUrl = await QRCode.toDataURL(session.qrCode)
          } catch (qrErr) {
            console.error('Failed to generate QR data URL:', qrErr)
          }

          return NextResponse.json({
            status: 'PAIRING_REQUIRED',
            qrCode: session.qrCode,
            qrDataUrl,
            reconnects: session.reconnects,
            message: 'Scan the QR code with WhatsApp on your phone.'
          })
        } else {
          // QR code has expired (>60s old)
          return NextResponse.json({
            status: 'QR_EXPIRED',
            qrCode: null,
            qrDataUrl: null,
            reconnects: session.reconnects,
            message: 'QR code expired. Please click Regenerate QR Code.'
          })
        }
      } else {
        // Connecting state without QR code
        if (ageMs < 30000) {
          return NextResponse.json({
            status: 'STARTING',
            qrCode: null,
            qrDataUrl: null,
            reconnects: session.reconnects,
            message: 'Initializing WhatsApp bridge and requesting QR code...'
          })
        } else {
          return NextResponse.json({
            status: 'ERROR',
            qrCode: null,
            qrDataUrl: null,
            reconnects: session.reconnects,
            message: 'Bridge initialization timed out. Ensure bridge process is running.'
          })
        }
      }
    }

    return NextResponse.json({
      status: 'DISCONNECTED',
      qrCode: null,
      qrDataUrl: null,
      reconnects: session.reconnects,
      message: 'WhatsApp is currently disconnected.'
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const userRole = String(auth.user?.role || '').toUpperCase()
    if (userRole !== 'ADMIN' && userRole !== 'STORE_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { command } = body

    if (command === 'RELINK') {
      await db.whatsAppSession.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          command: 'RELINK',
          status: 'STARTING',
          qrCode: null
        },
        update: {
          command: 'RELINK',
          status: 'STARTING',
          qrCode: null,
          updatedAt: new Date()
        }
      })

      emitWhatsAppSessionChanged({
        status: 'STARTING',
        qrAvailable: false,
        reason: 'relink-requested',
      })

      return NextResponse.json({ success: true, status: 'STARTING', message: 'Relink command issued successfully' })
    }

    return NextResponse.json({ error: 'Invalid command' }, { status: 400 })
  } catch (error) {
    return handleApiError(error)
  }
}
