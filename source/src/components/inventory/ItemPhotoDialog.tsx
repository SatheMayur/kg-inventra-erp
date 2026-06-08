'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface ItemPhotoDialogProps {
  itemId: string
  photoUrl: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (newUrl: string | null) => void
}

export function ItemPhotoDialog({
  itemId,
  photoUrl,
  open,
  onOpenChange,
  onUpdate,
}: ItemPhotoDialogProps) {
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/items/${itemId}/photo`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const { photoUrl: newUrl } = await res.json()
      onUpdate(newUrl)
      toast.success('Photo uploaded')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
      // Reset input so same file can be re-selected if needed
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove() {
    setLoading(true)
    try {
      const res = await fetch(`/api/items/${itemId}/photo`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Remove failed')
      }

      onUpdate(null)
      toast.success('Photo removed')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-4 text-primary" /> Item Photo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {photoUrl ? (
            <div className="space-y-3">
              <img
                src={photoUrl}
                alt="Item photo"
                className="w-full max-h-48 object-cover rounded-xl border border-border"
              />
              <Button
                variant="destructive"
                className="w-full gap-2"
                onClick={handleRemove}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Remove Photo
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-8 animate-spin text-primary" />
              ) : (
                <Camera className="size-8 opacity-40" />
              )}
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium">
                  {loading ? 'Uploading…' : 'Click or drag to upload'}
                </p>
                {!loading && (
                  <p className="text-xs text-muted-foreground/60">
                    JPEG, PNG, WebP — max 5MB
                  </p>
                )}
              </div>
              <Upload className="size-4 opacity-40" />
            </button>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
