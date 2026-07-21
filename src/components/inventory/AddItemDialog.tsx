'use client'

import { useEffect, useRef, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function PhotoPreviewThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string>('')

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  if (!url) return null

  return (
    <div className="relative">
      <img
        src={url}
        alt={file.name}
        className="size-14 rounded-md object-cover border border-border"
      />
      <button
        type="button"
        className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 text-white p-0.5 hover:bg-rose-700 transition-colors"
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

export function AddItemDialog({ open, onOpenChange, onSuccess }: AddItemDialogProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('pcs')
  const [stock, setStock] = useState('0')
  const [minStock, setMinStock] = useState('5')
  const [itemCode, setItemCode] = useState('')
  const [hsnCode, setHsnCode] = useState('')
  const [gstRate, setGstRate] = useState('0')
  const [maxStock, setMaxStock] = useState('0')
  const [safetyStock, setSafetyStock] = useState('0')
  const [reorderQty, setReorderQty] = useState('0')
  const [shortName, setShortName] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [description, setDescription] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [rack, setRack] = useState('')
  const [shelf, setShelf] = useState('')
  const [bin, setBin] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [newCategory, setNewCategory] = useState(false)

  // Existing categories as a dropdown — typing them by hand creates
  // duplicates like "Tools"/"tools"
  useEffect(() => {
    if (!open) return
    api.items.categories().then(setCategories).catch(() => {})
  }, [open])
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
    const maxStockN = parseInt(maxStock, 10) || 0
    const safetyStockN = parseInt(safetyStock, 10) || 0
    const reorderQtyN = parseInt(reorderQty, 10) || 0
    const gstRateF = parseFloat(gstRate) || 0

    try {
      setIsSubmitting(true)
      const item = await api.items.create({
        name,
        category,
        unit,
        stock: stockN,
        minStock: minStockN,
        itemCode: itemCode.trim() || undefined,
        hsnCode: hsnCode.trim() || undefined,
        gstRate: gstRateF,
        maxStock: maxStockN,
        safetyStock: safetyStockN,
        reorderQty: reorderQtyN,
        shortName: shortName.trim() || undefined,
        subCategory: subCategory.trim() || undefined,
        description: description.trim() || undefined,
        warehouse: warehouse.trim() || undefined,
        rack: rack.trim() || undefined,
        shelf: shelf.trim() || undefined,
        bin: bin.trim() || undefined,
        active: true,
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
      setUnit('pcs')
      setStock('0')
      setMinStock('5')
      setItemCode('')
      setHsnCode('')
      setGstRate('0')
      setMaxStock('0')
      setSafetyStock('0')
      setReorderQty('0')
      setShortName('')
      setSubCategory('')
      setDescription('')
      setWarehouse('')
      setRack('')
      setShelf('')
      setBin('')
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
      <DialogContent className="sm:max-w-xl bg-card/95 backdrop-blur-xl border-border/50 max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 font-bold text-lg">
            <Package className="size-5 text-primary" />
            Add New Item
          </DialogTitle>
          <DialogDescription>Register a new item with full specifications in the inventory system</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-2 overflow-y-auto flex-1 text-xs">
          {/* General Details */}
          <div className="space-y-3 border-b border-border/20 pb-4">
            <h3 className="font-semibold text-foreground text-[11px] uppercase tracking-wider text-primary">1. General Details</h3>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Item Name *</Label>
              <Input
                placeholder="e.g. Dell Latitude 5420"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-muted/20 border-border/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Item Code (SKU)</Label>
                <Input
                  placeholder="e.g. DEL-LAT-5420"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Short Name</Label>
                <Input
                  placeholder="e.g. Dell L5420"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Category *</Label>
                {newCategory || categories.length === 0 ? (
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="New category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="bg-muted/20 border-border/50"
                      autoFocus={newCategory}
                    />
                    {categories.length > 0 && (
                      <Button type="button" size="sm" variant="ghost" className="px-2 text-xs" onClick={() => { setNewCategory(false); setCategory('') }}>
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <Select
                    value={category}
                    onValueChange={(v) => {
                      if (v === '__new__') { setNewCategory(true); setCategory('') }
                      else setCategory(v)
                    }}
                  >
                    <SelectTrigger className="bg-muted/20 border-border/50">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      <SelectItem value="__new__">➕ New category…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Sub Category</Label>
                <Input
                  placeholder="e.g. Laptops"
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Unit *</Label>
                <Input
                  placeholder="pcs, mtrs, etc"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
            </div>
          </div>

          {/* Tax & Codes */}
          <div className="space-y-3 border-b border-border/20 pb-4">
            <h3 className="font-semibold text-foreground text-[11px] uppercase tracking-wider text-primary">2. Tax Specifications</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">HSN Code</Label>
                <Input
                  placeholder="e.g. 84713010"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">GST Rate (%)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 18"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
            </div>
          </div>

          {/* Inventory Levels */}
          <div className="space-y-3 border-b border-border/20 pb-4">
            <h3 className="font-semibold text-foreground text-[11px] uppercase tracking-wider text-primary">3. Inventory Thresholds</h3>
            <div className="grid grid-cols-5 gap-2">
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
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Min Stock</Label>
                <Input
                  type="number"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Max Stock</Label>
                <Input
                  type="number"
                  value={maxStock}
                  onChange={(e) => setMaxStock(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Safety Stock</Label>
                <Input
                  type="number"
                  value={safetyStock}
                  onChange={(e) => setSafetyStock(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Reorder Qty</Label>
                <Input
                  type="number"
                  value={reorderQty}
                  onChange={(e) => setReorderQty(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
            </div>
          </div>

          {/* Storage Location */}
          <div className="space-y-3 border-b border-border/20 pb-4">
            <h3 className="font-semibold text-foreground text-[11px] uppercase tracking-wider text-primary">4. Storage Location</h3>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Warehouse</Label>
                <Input
                  placeholder="e.g. Main Store"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Rack</Label>
                <Input
                  placeholder="e.g. A"
                  value={rack}
                  onChange={(e) => setRack(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Shelf</Label>
                <Input
                  placeholder="e.g. 3"
                  value={shelf}
                  onChange={(e) => setShelf(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Bin / Box</Label>
                <Input
                  placeholder="e.g. B-12"
                  value={bin}
                  onChange={(e) => setBin(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Description</Label>
                <Input
                  placeholder="Specifications, manufacturer, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-muted/20 border-border/50"
                />
              </div>
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
                  <PhotoPreviewThumb
                    key={`${f.name}-${i}`}
                    file={f}
                    onRemove={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/20 bg-muted/5 flex items-center justify-end gap-2 sm:gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
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
