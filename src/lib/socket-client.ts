'use client'

import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getRealtimeSocket() {
  if (typeof window === 'undefined') return null

  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: true,
    })
  }

  return socket
}
