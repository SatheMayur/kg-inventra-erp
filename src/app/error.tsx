'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to an external service here
    console.error('CRITICAL_SYSTEM_ERROR:', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="relative mb-8">
        <div className="absolute inset-0 size-24 animate-ping rounded-full bg-rose-500/10 opacity-20" />
        <div className="relative flex size-24 items-center justify-center rounded-3xl bg-rose-500/10 border border-rose-500/20 shadow-2xl shadow-rose-500/10">
          <AlertCircle className="size-12 text-rose-500" />
        </div>
      </div>

      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">System Exception</h1>
        <p className="text-muted-foreground/80 leading-relaxed">
          A critical error occurred while processing your request. Our automated monitors have been notified and the incident has been logged.
        </p>
        
        {error.digest && (
          <div className="inline-flex items-center rounded-full bg-secondary/50 px-3 py-1 border border-border/50">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">ID: {error.digest}</span>
          </div>
        )}

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            onClick={() => reset()}
            className="w-full sm:w-auto h-12 px-8 rounded-2xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 gap-2"
          >
            <RefreshCcw className="size-4" />
            Resume Operation
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/'}
            className="w-full sm:w-auto h-12 px-8 rounded-2xl border-border/50 font-bold hover:bg-secondary/50 transition-all gap-2"
          >
            <Home className="size-4" />
            Home Console
          </Button>
        </div>
      </div>

      <p className="mt-12 text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] font-bold">
        Inventra · Operational Intelligence Platform
      </p>
    </div>
  )
}
