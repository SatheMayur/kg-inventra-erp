'use client'

import { useRef, useState } from 'react'
import { Package, Check, Loader2, Camera, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AddItemDialog({ open, onOpenChange, onSuccess }: AddItemDialogProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('pcs')
  const [stock, setStock] = useState('0')
  const [minStock, setMinStock] = useState('5')
  const [photos, setPhotos] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function addPhotos(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list).filter((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds 10MB limit`)
        return false
      }
      return true
    })
    setPhotos((prev) => [...prev, ...incoming])
  }

  const handleAdd = async () => {
    if (!name || !category || !unit) {
      toast.error('Please fill all required fields')
      return
    }

    const stockN = parseInt(stock, 10)
    const minStockN = parseInt(minStock, 10)
    if (!Number.isFinite(stockN) || stockN < 0 || !Number.isFinite(minStockN) || minStockN < 0) {
      toast.error('Stock and min level must be non-negative numbers')
      return
    }

    try {
      setIsSubmitting(true)
      const item = await api.items.create({
        name,
        category,
        unit,
        stock: stockN,
        minStock: minStockN,
      })

      // Upload selected photos right after the item is created
      if (photos.length > 0) {
        const formData = new FormData()
        for (const f of photos) formData.append('files', f)
        const res = await fetch(`/api/items/${item.id}/images`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })
        if (!res.ok) {
          toast.warning('Item created, but photo upload failed — add photos from the item menu (⋯ → Photos)')
        }
      }

      toast.success(photos.length > 0 ? 'Item added with photos' : 'Item added successfully')
      onOpenChange(false)
      setName('')
      setCategory('')
      setPhotos([])
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold">
            <Package className="size-4 text-primary" />
            Add New Asset
          </DialogTitle>
          <DialogDescription>Register a new item in the inventory system</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Item Name</Label>
            <Input
              placeholder="e.g. Dell Latitude 5420"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-muted/20 border-border/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Category</Label>
              <Input
                placeholder="e.g. Laptops"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-muted/20 border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Unit</Label>
              <Input
                placeholder="pcs, mtrs, etc"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="bg-muted/20 border-border/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Initial Stock</Label>
              <Input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="bg-muted/20 border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Min Level (Alert)</Label>
              <Input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="bg-muted/20 border-border/50"
              />
            </div>
          </div>

          {/* Photos */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Photos (optional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
                <Upload className="size-3.5" /> Choose photos
              </Button>
              <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => cameraRef.current?.click()}>
                <Camera className="size-3.5" /> Use camera
              </Button>
            </div>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="size-14 rounded-md object-cover border border-border"
                    />
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 text-white p-0.5"
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleAdd}
            disabled={isSubmitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-lg shadow-primary/20"
          >
            {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Register Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
