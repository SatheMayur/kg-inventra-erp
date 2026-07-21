'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Loader2,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface ItemImageRecord {
  id: string
  itemId: string
  imagePath: string
  thumbnailPath: string
  isPrimary: boolean
  labelType: 'front' | 'hazard' | 'batch' | null
  sortOrder: number
  uploadedAt: string
}

interface Props {
  itemId: string
  itemName: string
  /** liquids get the label-type selector */
  isLiquid: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** notify parent when the primary thumbnail changes so lists can refresh */
  onPrimaryChange?: (thumbnailUrl: string | null) => void
}

export function ItemImagesDialog({ itemId, itemName, isLiquid, open, onOpenChange, onPrimaryChange }: Props) {
  const [images, setImages] = useState<ItemImageRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0) // % across the batch
  const [labelType, setLabelType] = useState<string>('none')
  const [lightbox, setLightbox] = useState<ItemImageRecord | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const fetchImages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/items/${itemId}/images`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load images')
      const { images } = await res.json()
      setImages(images)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load images')
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    if (open) void fetchImages()
  }, [open, fetchImages])

  // XMLHttpRequest used (not fetch) so the upload reports real progress
  function uploadFiles(files: FileList) {
    if (files.length === 0) return
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    for (const f of Array.from(files)) formData.append('files', f)
    if (isLiquid && labelType !== 'none') formData.append('labelType', labelType)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/items/${itemId}/images`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      setUploading(false)
      if (xhr.status === 201) {
        toast.success(`${files.length} photo${files.length > 1 ? 's' : ''} uploaded`)
        void fetchImages().then(() => {
          // First upload may have set the primary — inform parent
          if (onPrimaryChange) {
            const data = JSON.parse(xhr.responseText) as { images: ItemImageRecord[] }
            const prim = data.images.find((i) => i.isPrimary)
            if (prim) onPrimaryChange(prim.thumbnailPath)
          }
        })
      } else {
        let msg = 'Upload failed'
        try { msg = JSON.parse(xhr.responseText).error ?? msg } catch { /* keep default */ }
        toast.error(msg)
      }
    }
    xhr.onerror = () => {
      setUploading(false)
      toast.error('Upload failed — network error')
    }
    xhr.send(formData)
  }

  async function setPrimary(img: ItemImageRecord) {
    const res = await fetch(`/api/items/${itemId}/images/${img.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isPrimary: true }),
    })
    if (res.ok) {
      toast.success('Primary photo updated')
      onPrimaryChange?.(img.thumbnailPath)
      void fetchImages()
    } else {
      toast.error('Failed to set primary')
    }
  }

  async function removeImage(img: ItemImageRecord) {
    const res = await fetch(`/api/items/${itemId}/images/${img.id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (res.ok) {
      toast.success('Photo deleted')
      if (img.isPrimary) {
        const next = images.find((i) => i.id !== img.id)
        onPrimaryChange?.(next ? next.thumbnailPath : null)
      }
      void fetchImages()
    } else {
      toast.error('Failed to delete photo')
    }
  }

  async function changeLabel(img: ItemImageRecord, value: string) {
    const res = await fetch(`/api/items/${itemId}/images/${img.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ labelType: value === 'none' ? null : value }),
    })
    if (res.ok) void fetchImages()
    else toast.error('Failed to update label')
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="size-5 text-primary" /> Photos — {itemName}
            </DialogTitle>
          </DialogHeader>

          {/* Upload controls */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
            <Button size="sm" className="gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload photos
            </Button>
            <Button size="sm" variant="outline" className="gap-2" disabled={uploading} onClick={() => cameraRef.current?.click()}>
              <Camera className="size-4" /> Use camera
            </Button>
            {isLiquid && (
              <Select value={labelType} onValueChange={setLabelType}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Label type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No label</SelectItem>
                  <SelectItem value="front">Front</SelectItem>
                  <SelectItem value="hazard">Hazard</SelectItem>
                  <SelectItem value="batch">Batch</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Upload progress */}
          {uploading && (
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Gallery grid */}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : images.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No photos yet. Upload from device or capture with camera.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
              {images.map((img) => (
                <div key={img.id} className="relative group rounded-lg border border-border overflow-hidden">
                  <img
                    src={img.thumbnailPath}
                    alt={itemName}
                    loading="lazy"
                    className="w-full aspect-square object-cover cursor-zoom-in"
                    onClick={() => setLightbox(img)}
                  />

                  {/* Badges */}
                  <div className="absolute top-1 left-1 flex gap-1">
                    {img.isPrimary && (
                      <Badge className="h-5 px-1.5 text-[10px] gap-0.5 bg-primary text-primary-foreground">
                        <Star className="size-2.5" /> Primary
                      </Badge>
                    )}
                    {img.labelType === 'hazard' && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-0.5 border-red-500/60 bg-red-500/15 text-red-400">
                        <AlertTriangle className="size-2.5" /> Hazard
                      </Badge>
                    )}
                    {(img.labelType === 'front' || img.labelType === 'batch') && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">{img.labelType}</Badge>
                    )}
                  </div>

                  {/* Hover actions */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!img.isPrimary ? (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-white gap-1" onClick={() => void setPrimary(img)}>
                        <Star className="size-3" /> Primary
                      </Button>
                    ) : <span />}
                    {isLiquid && (
                      <Select value={img.labelType ?? 'none'} onValueChange={(v) => void changeLabel(img, v)}>
                        <SelectTrigger className="h-6 w-20 text-[10px] bg-transparent text-white border-white/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No label</SelectItem>
                          <SelectItem value="front">Front</SelectItem>
                          <SelectItem value="hazard">Hazard</SelectItem>
                          <SelectItem value="batch">Batch</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-red-400" onClick={() => void removeImage(img)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox — full-resolution view */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="sm:max-w-3xl border-border p-2">
          <DialogTitle className="px-2 pt-1 text-sm flex items-center gap-2">
            {itemName}
            {lightbox?.labelType === 'hazard' && (
              <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                <AlertTriangle className="size-3.5" /> Hazard label
              </span>
            )}
          </DialogTitle>
          {lightbox && (
            <img src={lightbox.imagePath} alt={itemName} className="w-full max-h-[78vh] object-contain rounded-md" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
