'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import LoginScreen from '@/components/login-screen'
import AppShell from '@/components/app-shell'

export default function Home() {
  const user = useAppStore((s) => s.user)
  const [isClient, setIsClient] = useState(false)
  const [seeding, setSeeding] = useState(true)

  useEffect(() => {
    setIsClient(true)
    // Only auto-seed in development — production seed endpoint is disabled
    if (process.env.NODE_ENV !== 'production') {
      api.auth.seed()
        .catch(() => { /* silent — backend may not be ready yet */ })
        .finally(() => setSeeding(false))
    } else {
      setSeeding(false)
    }
  }, [])

  // During SSR or seeding, show a minimal loading state
  if (!isClient || seeding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground font-medium">Initializing Inventra...</span>
        </div>
      </div>
    )
  }

  if (user) {
    return <AppShell />
  }

  return <LoginScreen />
}
