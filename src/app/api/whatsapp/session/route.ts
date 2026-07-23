import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import QRCode from 'qrcode'
import { emitWhatsAppSessionChanged } from '@/lib/realtime'

const BRIDGE_HEALTH_URL = process.env.BRIDGE_HEALTH_URL || 'http://localhost:4016'

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    // Direct health check probe to local bridge process HTTP listener
    let bridgeAlive = false
    let bridgeData: any = null
    try {
      const probeRes = await fetch(`${BRIDGE_HEALTH_URL}/status`, {
        signal: AbortSignal.timeout(1500),
        headers: { 'Cache-Control': 'no-cache' }
      })
      if (probeRes.ok) {
        bridgeAlive = true
        bridgeData = await probeRes.json()
      }
    } catch (err) {
      bridgeAlive = false
    }

    const session = await db.whatsAppSession.findUnique({
      where: { id: 'default' }
    })

    if (!session && !bridgeAlive) {
      return NextResponse.json({
        status: 'DISCONNECTED',
        bridgeAlive: false,
        qrCode: null,
        qrDataUrl: null,
        reconnects: 0,
        message: 'WhatsApp bridge service is not running.'
      })
    }

    // If bridge is alive, let bridge status take precedence if DB is stale
    const currentStatus = (bridgeAlive && bridgeData?.connected) ? 'CONNECTED' : (session?.status || 'DISCONNECTED')
    const currentQr = session?.qrCode || null
    const ageMs = session ? Date.now() - new Date(session.updatedAt).getTime() : 999999

    // 1. Relink command issued but bridge has not picked it up or reported status yet
    if (session?.command === 'RELINK') {
      if (bridgeAlive) {
        return NextResponse.json({
          status: bridgeData?.state || 'STARTING',
          bridgeAlive: true,
          qrCode: null,
          qrDataUrl: null,
          reconnects: session.reconnects,
          message: 'Initializing WhatsApp bridge and requesting QR code...'
        })
      } else if (ageMs < 30000) {
        return NextResponse.json({
          status: 'STARTING',
          bridgeAlive: false,
          qrCode: null,
          qrDataUrl: null,
          reconnects: session.reconnects,
          message: 'Initializing WhatsApp bridge process...'
        })
      } else {
        return NextResponse.json({
          status: 'SERVICE_OFFLINE',
          bridgeAlive: false,
          qrCode: null,
          qrDataUrl: null,
          reconnects: session.reconnects,
          message: 'WhatsApp bridge service is not running. Launch start-whatsapp.bat'
        })
      }
    }

    // 2. Connected state
    if (currentStatus === 'CONNECTED' || (bridgeAlive && bridgeData?.connected)) {
      return NextResponse.json({
        status: 'CONNECTED',
        bridgeAlive: true,
        connectedPhone: bridgeData?.connectedPhone || null,
        qrCode: null,
        qrDataUrl: null,
        reconnects: session?.reconnects || 0,
        message: bridgeData?.connectedPhone ? `Connected as +${bridgeData.connectedPhone}` : 'WhatsApp bridge connected successfully.'
      })
    }

    // 3. Connecting / Pairing state
    if (currentStatus === 'CONNECTING' || (bridgeAlive && (bridgeData?.state === 'PAIRING_REQUIRED' || bridgeData?.state === 'QR_READY'))) {
      if (currentQr) {
        if (ageMs <= 60000 || bridgeAlive) {
          let qrDataUrl: string | null = null
          try {
            qrDataUrl = await QRCode.toDataURL(currentQr)
          } catch (qrErr) {
            console.error('Failed to generate QR data URL:', qrErr)
          }

          return NextResponse.json({
            status: 'PAIRING_REQUIRED',
            bridgeAlive,
            qrCode: currentQr,
            qrDataUrl,
            reconnects: session?.reconnects || 0,
            message: 'Scan the QR code with WhatsApp on your phone.'
          })
        } else {
          return NextResponse.json({
            status: 'QR_EXPIRED',
            bridgeAlive,
            qrCode: null,
            qrDataUrl: null,
            reconnects: session?.reconnects || 0,
            message: 'QR code expired. Please click Regenerate QR Code.'
          })
        }
      } else {
        if (ageMs < 30000 || bridgeAlive) {
          return NextResponse.json({
            status: 'STARTING',
            bridgeAlive,
            qrCode: null,
            qrDataUrl: null,
            reconnects: session?.reconnects || 0,
            message: 'Initializing WhatsApp bridge and requesting QR code...'
          })
        } else {
          return NextResponse.json({
            status: 'SERVICE_OFFLINE',
            bridgeAlive: false,
            qrCode: null,
            qrDataUrl: null,
            reconnects: session?.reconnects || 0,
            message: 'Bridge service is offline. Ensure start-whatsapp.bat is running.'
          })
        }
      }
    }

    return NextResponse.json({
      status: bridgeAlive ? (bridgeData?.state || 'DISCONNECTED') : 'SERVICE_OFFLINE',
      bridgeAlive,
      qrCode: null,
      qrDataUrl: null,
      reconnects: session?.reconnects || 0,
      message: bridgeAlive ? 'WhatsApp is currently disconnected.' : 'WhatsApp bridge service is not running.'
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

    const userRole = String(auth.user?.role ?? '').toUpperCase()
    if (userRole !== 'ADMIN' && userRole !== 'STORE_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { command } = body

    if (command === 'RELINK' || command === 'RESET_SESSION') {
      if (command === 'RESET_SESSION') {
        try {
          await fetch(`${BRIDGE_HEALTH_URL}/api/reset-session`, {
            method: 'POST',
            signal: AbortSignal.timeout(2000)
          }).catch(() => {})
        } catch (e) {}
      }

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

      // Also directly notify local bridge health listener if alive
      try {
        await fetch(`${BRIDGE_HEALTH_URL}/api/restart`, {
          method: 'POST',
          signal: AbortSignal.timeout(1500)
        }).catch(() => {})
      } catch (e) {}

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
