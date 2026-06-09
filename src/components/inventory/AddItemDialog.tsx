'use client'

import { useState } from 'react'
import { Package, Check, Loader2 } from 'lucide-react'
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
  const [isSubmitting, setIsSubmitting] = useState(false)

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
      await api.items.create({
        name,
        category,
        unit,
        stock: stockN,
        minStock: minStockN,
      })
      toast.success('Item added successfully')
      onOpenChange(false)
      setName('')
      setCategory('')
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
