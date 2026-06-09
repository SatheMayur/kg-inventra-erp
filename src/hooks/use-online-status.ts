'use client'

import { useState, useEffect } from 'react'

export function useOnlineStatus(): boolean {
  // Start as `true` to match SSR — corrected on first client effect
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Sync with actual browser state after hydration
    setIsOnline(navigator.onLine)

    const handleOnline  = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
