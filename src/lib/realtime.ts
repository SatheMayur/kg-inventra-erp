type SocketEmitter = {
  emit: (event: string, payload: unknown) => void
  to: (room: string) => SocketEmitter
}

type GlobalWithRealtime = typeof globalThis & {
  __inventraSocketIO?: SocketEmitter
}

export type WhatsAppRealtimeEvent = {
  phone?: string | null
  messageId?: string
  direction?: string | null
  status?: string | null
  updatedAt?: string
  reason: 'created' | 'status-updated' | 'bridge-polled' | 'bridge-timeout-requeued' | 'bridge-retries-exhausted'
}

export type WhatsAppSessionRealtimeEvent = {
  status: string
  qrAvailable?: boolean
  reason: 'updated' | 'relink-requested'
}

export function emitRealtime(event: string, payload: unknown, room?: string) {
  const io = (globalThis as GlobalWithRealtime).__inventraSocketIO
  if (!io) return false

  if (room) {
    io.to(room).emit(event, payload)
  } else {
    io.emit(event, payload)
  }

  return true
}

export function emitWhatsAppMessageChanged(payload: WhatsAppRealtimeEvent) {
  emitRealtime('whatsapp:message', payload)
  if (payload.phone) {
    emitRealtime('whatsapp:message', payload, `whatsapp:${payload.phone}`)
  }
}

export function emitWhatsAppSessionChanged(payload: WhatsAppSessionRealtimeEvent) {
  emitRealtime('whatsapp:session', payload)
}

export function emitNotificationCreated(notification: {
  id: string
  userId: string
  title: string
  message: string
  type: string
  read: boolean
  link: string | null
  createdAt: Date
}) {
  const payload = {
    ...notification,
    createdAt: notification.createdAt.toISOString(),
  }
  emitRealtime('notification:new', payload, `user:${notification.userId}`)
}
