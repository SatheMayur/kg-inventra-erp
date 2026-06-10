'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Search, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface CommandResult {
  intent: string
  answer: string
  data: Array<Record<string, unknown>>
}

/**
 * Global natural-language "Ask Inventra" bar. Open with ⌘K / Ctrl+K.
 * Read-only: queries stock / low-stock / pending requests via /api/command.
 */
export function CommandBar() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CommandResult | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = useCallback(async () => {
    if (!text.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
      })
      setResult(await res.json())
    } catch {
      setResult({ intent: 'error', answer: 'Something went wrong.', data: [] })
    } finally {
      setLoading(false)
    }
  }, [text])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setText('')
          setResult(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="sr-only">Ask Inventra</DialogTitle>
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="size-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Ask Inventra</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run()
            }}
            placeholder='e.g. "stock of keyboards", "low stock", "pending requests"'
            className="pl-9"
          />
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Thinking…
          </div>
        )}

        {result && !loading && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{result.answer}</p>
            {result.data.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/20 text-sm">
                {result.data.map((row, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="truncate">
                      {String(row.name ?? row.employee ?? '')}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs shrink-0">
                      {row.available !== undefined
                        ? `${row.available} ${row.unit ?? ''}`
                        : row.qty !== undefined
                          ? `qty ${row.qty}`
                          : row.minStock !== undefined
                            ? `${row.stock}/${row.minStock}`
                            : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60">Tip: press ⌘K / Ctrl+K anytime.</p>
      </DialogContent>
    </Dialog>
  )
}
