import { createServer } from 'node:http'
import next from 'next'
import { Server } from 'socket.io'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = Number.parseInt(process.env.PORT || '3000', 10)

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
})
