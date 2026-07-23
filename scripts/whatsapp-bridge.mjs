import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import makeWASocket, { DisconnectReason, useMultiFileAuthState as createMultiFileAuthState } from '@whiskeysockets/baileys'
import pino from 'pino'

const appPort = process.env.PORT || '3084'
const appBaseUrl = process.env.WHATSAPP_BRIDGE_APP_URL || process.env.APP_BASE_URL || `http://127.0.0.1:${appPort}`
const bridgeKey = process.env.BRIDGE_API_KEY
const authDir = process.env.WHATSAPP_AUTH_DIR || path.resolve(process.cwd(), 'data', 'whatsapp-auth')
const pollIntervalMs = Number(process.env.WHATSAPP_BRIDGE_POLL_MS || 3000)
const logger = pino({ level: process.env.WHATSAPP_BRIDGE_LOG_LEVEL || 'info' })

if (!bridgeKey) {
  logger.error('BRIDGE_API_KEY is required to start the WhatsApp bridge')
  process.exit(1)
}

let socket = null
let reconnecting = false
let intentionallyRestarting = false

async function waitForApp() {
  for (;;) {
    try {
      const response = await fetch(`${appBaseUrl}/api/health`)
      if (response.ok) return
    } catch {
      // App server is still starting.
    }
    logger.info('waiting for KG-Inventra app API before starting WhatsApp socket')
    await delay(2000)
  }
}

async function bridgeFetch(route, options = {}) {
  const response = await fetch(`${appBaseUrl}${route}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-bridge-key': bridgeKey,
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${route} failed: HTTP ${response.status} ${text}`)
  }

  return response.json().catch(() => ({}))
}

async function reportQr(qr, status = 'CONNECTING') {
  await bridgeFetch('/api/v1/wa/qr', {
    method: 'POST',
    body: JSON.stringify({ qr, status }),
  })
}

async function reportDisconnected() {
  await bridgeFetch('/api/v1/wa/disconnect', { method: 'POST' })
}

async function postInbound(message) {
  await bridgeFetch('/api/v1/wa/inbound', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

async function ackOutbound(id, status, error = null) {
  await bridgeFetch('/api/v1/wa/ack', {
    method: 'POST',
    body: JSON.stringify({ id, status, error }),
  })
}

function isLoggedOut(lastDisconnect) {
  const statusCode = lastDisconnect?.error?.output?.statusCode
  return statusCode === DisconnectReason.loggedOut
}

async function connect() {
  if (reconnecting) return
  reconnecting = true

  try {
    const { state, saveCreds } = await createMultiFileAuthState(authDir)
    socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: logger.child({ module: 'baileys' }),
      browser: ['KG-Inventra', 'Chrome', '1.0.0'],
    })

    socket.ev.on('creds.update', saveCreds)

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        logger.info('QR received from WhatsApp')
        await reportQr(qr, 'CONNECTING').catch((error) => logger.error({ error }, 'failed to report QR'))
      }

      if (connection === 'open') {
        logger.info('WhatsApp bridge connected')
        await reportQr(null, 'CONNECTED').catch((error) => logger.error({ error }, 'failed to report connected'))
      }

      if (connection === 'close') {
        socket = null
        if (intentionallyRestarting) {
          intentionallyRestarting = false
          reconnecting = false
          setTimeout(() => connect().catch((error) => logger.error({ error }, 'reconnect failed')), 1000)
          return
        }

        if (isLoggedOut(lastDisconnect)) {
          logger.warn('WhatsApp bridge logged out')
          await reportDisconnected().catch((error) => logger.error({ error }, 'failed to report disconnected'))
          reconnecting = false
          return
        }

        logger.warn({ reason: lastDisconnect?.error?.message }, 'WhatsApp bridge disconnected, reconnecting')
        reconnecting = false
        setTimeout(() => connect().catch((error) => logger.error({ error }, 'reconnect failed')), 3000)
      }
    })

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const message of messages) {
        if (!message?.message || message.key?.fromMe) continue
        await postInbound(message).catch((error) => logger.error({ error }, 'failed to post inbound message'))
      }
    })
  } finally {
    reconnecting = false
  }
}

async function handleCommand(command) {
  if (!command) return

  if (command === 'RELINK') {
    logger.info('Relink command received')
    intentionallyRestarting = true
    try {
      socket?.end?.(undefined)
    } catch (error) {
      logger.warn({ error }, 'failed to end existing socket before relink')
    }
    socket = null
    await connect()
  }
}

async function pollCommandsForever() {
  for (;;) {
    try {
      const data = await bridgeFetch('/api/v1/wa/command')
      await handleCommand(data.command)
    } catch (error) {
      logger.warn({ error }, 'command poll failed')
    }
    await delay(pollIntervalMs)
  }
}

async function pollOutboundForever() {
  for (;;) {
    try {
      if (socket?.user) {
        const data = await bridgeFetch('/api/v1/wa/poll')
        for (const message of data.messages || []) {
          try {
            await socket.sendMessage(message.to, { text: message.text })
            await ackOutbound(message.id, 'SENT')
          } catch (error) {
            await ackOutbound(message.id, 'FAILED', error?.message || String(error)).catch(() => {})
            logger.error({ error, id: message.id, to: message.to }, 'failed to send outbound WhatsApp message')
          }
        }
      }
    } catch (error) {
      logger.warn({ error }, 'outbound poll failed')
    }
    await delay(pollIntervalMs)
  }
}

async function main() {
  logger.info({ appBaseUrl, authDir }, 'starting KG-Inventra WhatsApp bridge')
  await waitForApp()
  await connect()
  await Promise.all([pollCommandsForever(), pollOutboundForever()])
}

main().catch((error) => {
  logger.error({ error }, 'WhatsApp bridge crashed')
  process.exit(1)
})
