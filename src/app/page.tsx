'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import LoginScreen from '@/components/login-screen'
import AppShell from '@/components/app-shell'

import { api } from '@/lib/api'

export default function Home() {
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const reset = useAppStore((s) => s.reset)

  const [isClient, setIsClient] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    setIsClient(true)
    setHasHydrated(useAppStore.persist.hasHydrated())

    const unsubscribe = useAppStore.persist.onFinishHydration(() => {
      setHasHydrated(true)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!isClient || !hasHydrated) return

    let active = true
    async function checkSession() {
      if (!user) {
        if (active) setCheckingSession(false)
        return
      }

      setCheckingSession(true)
      try {
        const res = await api.auth.me()
        console.log(`[AUTH DEBUG] Session verification successful for user: ${res.user.id}`);
        if (active) setUser({ ...res.user, role: res.user.role as 'admin' | 'employee' })
      } catch (err) {
        console.error('[AUTH DEBUG] Session verification failed, logging out:', err)
        if (active) reset()
      } finally {
        if (active) setCheckingSession(false)
      }
    }

    checkSession()

    return () => {
      active = false
    }
  }, [hasHydrated, isClient, reset, setUser, user?.id])

  if (!isClient || !hasHydrated || checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground font-medium">Initializing KG_inventra...</span>
        </div>
      </div>
    )
  }

  if (user) {
    return <AppShell />
  }

  return <LoginScreen />
}
