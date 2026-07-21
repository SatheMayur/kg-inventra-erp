'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface ItemThumbProps {
  photoUrl: string | null | undefined
  name: string
  /** px size in tables; defaults to 40 (≤60 per spec) */
  size?: number
  /** full-resolution image to show on click; falls back to photoUrl */
  fullUrl?: string | null
}

/**
 * Lazy-loading square thumbnail with click-to-enlarge lightbox.
 * Used in the inventory table, search results, transfer rows, and dialogs.
 */
export function ItemThumb({ photoUrl, name, size = 40, fullUrl }: ItemThumbProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)

  if (!photoUrl || error) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-muted/40 text-muted-foreground/40 shrink-0"
        style={{ width: size, height: size }}
        title={name}
      >
        <ImageOff style={{ width: size * 0.45, height: size * 0.45 }} />
      </div>
    )
  }

  return (
    <>
      <img
        src={photoUrl}
        alt={name}
        loading="lazy"
        className="rounded-md object-cover cursor-zoom-in border border-border shrink-0"
        style={{ width: size, height: size }}
        onError={() => setError(true)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl border-border p-2">
          <DialogTitle className="px-2 pt-1 text-sm">{name}</DialogTitle>
          <img
            src={fullUrl ?? photoUrl}
            alt={name}
            className="w-full max-h-[75vh] object-contain rounded-md"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
