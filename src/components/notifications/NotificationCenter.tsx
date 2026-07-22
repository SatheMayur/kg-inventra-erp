'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, Check, BellRing, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, NotificationResponse } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { getRealtimeSocket } from '@/lib/socket-client'

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([])
  const [open, setOpen] = useState(false)
  const user = useAppStore((s) => s.user)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.notifications.list()
      setNotifications(data)
    } catch {
      // silent — non-critical
    }
  }, [user])

  // Poll every 60s; also fetch immediately when dropdown opens
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  useEffect(() => {
    if (!user) return

    const socket = getRealtimeSocket()
    if (!socket) return

    const joinUserRoom = () => {
      socket.emit('join:user', user.id)
    }

    const handleNotification = (notification: NotificationResponse) => {
      if (notification.userId !== user.id) return
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) return prev
        return [notification, ...prev].slice(0, 50)
      })
    }

    socket.on('connect', joinUserRoom)
    socket.on('notification:new', handleNotification)

    if (socket.connected) joinUserRoom()

    return () => {
      socket.off('connect', joinUserRoom)
      socket.off('notification:new', handleNotification)
    }
  }, [user, fetchNotifications])

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markAsRead(id: string) {
    try {
      await api.notifications.markRead(id)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    } catch {
      // silent
    }
  }

  async function markAllAsRead() {
    try {
      await api.notifications.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      // silent
    }
  }

  function handleNotificationClick(n: NotificationResponse) {
    if (!n.read) markAsRead(n.id)
    if (n.link) setCurrentView(n.link)
    setOpen(false)
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="size-3.5 text-emerald-500" />
      case 'warning': return <AlertTriangle className="size-3.5 text-amber-500" />
      case 'error':   return <XCircle className="size-3.5 text-rose-500" />
      default:        return <Info className="size-3.5 text-sky-500" />
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9">
          {unreadCount > 0 ? (
            <>
              <BellRing className="size-4.5 text-primary animate-pulse" />
              <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </>
          ) : (
            <Bell className="size-4.5 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 p-0"
        style={{
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '2px solid rgba(255,255,255,0.55)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 32px rgba(0,0,0,0.10)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/30">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-primary hover:text-primary/80 hover:bg-primary/10 px-2 gap-1"
              onClick={markAllAsRead}
            >
              <Check className="size-3" />
              Mark all read
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[380px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="size-8 mb-3 opacity-20" />
              <p className="text-xs font-medium">No notifications</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">You&apos;re all caught up</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-white/20">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    'flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-primary/5',
                    !n.read && 'bg-primary/8'
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={cn(
                      'size-6 rounded-full flex items-center justify-center',
                      n.type === 'success' && 'bg-emerald-500/10',
                      n.type === 'warning' && 'bg-amber-500/10',
                      n.type === 'error'   && 'bg-rose-500/10',
                      n.type === 'info'    && 'bg-sky-500/10',
                    )}>
                      {getTypeIcon(n.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        'text-xs font-semibold leading-tight',
                        !n.read ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap shrink-0 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-snug">
                      {n.message}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="shrink-0 mt-1.5">
                      <span className="size-1.5 rounded-full bg-primary block" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DropdownMenuSeparator className="bg-white/30" />
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full h-8 text-[11px] text-muted-foreground hover:text-foreground hover:bg-primary/5"
            onClick={() => {
              setCurrentView(user?.role === 'admin' ? 'issuance' : 'requests')
              setOpen(false)
            }}
          >
            {user?.role === 'admin' ? 'Go to Issuance Queue' : 'Go to My Requests'}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
