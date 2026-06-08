'use client'
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const on = () => setOffline(true)
    const off = () => setOffline(false)
    window.addEventListener('offline', on)
    window.addEventListener('online', off)
    return () => { window.removeEventListener('offline', on); window.removeEventListener('online', off) }
  }, [])
  if (!offline) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 text-sm font-medium px-4 py-2 flex items-center gap-2">
      <WifiOff className="size-4 shrink-0" />
      You are offline. Changes will sync when connection is restored.
    </div>
  )
}
