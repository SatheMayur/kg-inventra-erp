import { createServer } from 'node:http'
import next from 'next'
import cron from 'node-cron'
import { Server } from 'socket.io'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = Number.parseInt(process.env.PORT || '3000', 10)
const cronTimezone = process.env.CRON_TIMEZONE || 'Asia/Kolkata'

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

function parseOrigins(value) {
  if (!value) return true
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

await app.prepare()

const httpServer = createServer((req, res) => {
  handle(req, res)
})

const io = new Server(httpServer, {
  path: '/socket.io',
  cors: {
    origin: parseOrigins(process.env.SOCKET_IO_CORS_ORIGIN),
    credentials: true,
  },
})

globalThis.__inventraSocketIO = io

io.on('connection', (socket) => {
  socket.emit('socket:ready', {
    socketId: socket.id,
    connectedAt: new Date().toISOString(),
  })

  socket.on('join:user', (userId) => {
    if (typeof userId === 'string' && userId.trim()) {
      socket.join(`user:${userId}`)
    }
  })

  socket.on('join:whatsapp-thread', (phone) => {
    if (typeof phone === 'string' && phone.trim()) {
      socket.join(`whatsapp:${phone}`)
    }
  })
})

httpServer.listen(port, hostname, () => {
  console.log(`> KG Inventra ready on http://${hostname}:${port}`)
  console.log('> Socket.IO listening on /socket.io')
  registerCronJobs()
})

function registerCronJobs() {
  if (process.env.IN_PROCESS_CRON_ENABLED === 'false') {
    console.log('> In-process cron disabled by IN_PROCESS_CRON_ENABLED=false')
    return
  }

  if (!process.env.CRON_SECRET) {
    console.log('> In-process cron skipped because CRON_SECRET is not configured')
    return
  }

  const baseUrl = process.env.INTERNAL_CRON_BASE_URL || `http://${hostname}:${port}`
  const jobs = [
    {
      name: 'inventory-alerts',
      schedule: process.env.CRON_ALERTS_SCHEDULE || '*/15 * * * *',
      path: '/api/cron/alerts',
    },
    {
      name: 'whatsapp-queue-health',
      schedule: process.env.CRON_WHATSAPP_QUEUE_SCHEDULE || '*/5 * * * *',
      path: '/api/cron/whatsapp-queue',
    },
    {
      name: 'daily-procurement-reminder',
      schedule: process.env.CRON_DAILY_PROCUREMENT_SCHEDULE || '0 18 * * *',
      path: '/api/cron/daily-procurement-reminder',
    },
  ]

  for (const job of jobs) {
    if (!cron.validate(job.schedule)) {
      console.warn(`> Cron job "${job.name}" skipped: invalid schedule "${job.schedule}"`)
      continue
    }

    cron.schedule(
      job.schedule,
      () => runCronEndpoint({ ...job, baseUrl }),
      { timezone: cronTimezone },
    )
    console.log(`> Cron job "${job.name}" scheduled as "${job.schedule}" (${cronTimezone})`)
  }
}

async function runCronEndpoint({ name, baseUrl, path }) {
  const startedAt = Date.now()
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    })
    const body = await response.text()
    if (!response.ok) {
      console.error(`> Cron job "${name}" failed with HTTP ${response.status}: ${body}`)
      return
    }
    console.log(`> Cron job "${name}" completed in ${Date.now() - startedAt}ms`)
  } catch (error) {
    console.error(`> Cron job "${name}" failed:`, error)
  }
}
