'use client'

import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Check, Loader2, AlertTriangle, ArrowRight, PackagePlus, ExternalLink } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api, type ItemResponse } from '@/lib/api'
import { toast } from 'sonner'

const DEFAULT_DAILY_CATEGORIES = [
  'Vegetables',
  'Fruits',
  'Dairy',
  'Grocery',
  'Bakery',
  'Frozen Items',
  'Meat/Poultry',
  'Packaging',
  'Cleaning Consumables',
  'General',
]

const CATEGORY_UNIT_SUGGESTIONS: Record<string, string> = {
  Vegetables: 'KG',
  Fruits: 'KG',
  Dairy: 'L',
  Grocery: 'KG',
  Bakery: 'PCS',
  'Frozen Items': 'PACK',
  'Meat/Poultry': 'KG',
  Packaging: 'PKT',
  'Cleaning Consumables': 'LTR',
}

const COMMON_UNITS = ['KG', 'PCS', 'L', 'LTR', 'PKT', 'PACK', 'BUNCH', 'BOX', 'BAG', 'GRAM', 'ML']

interface QuickAddDailyItemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefilledName?: string
  prefilledCategory?: string
  onSuccess: (newItem: ItemResponse) => void
  onOpenFullMaster: () => void
  activeItems: ItemResponse[]
}

export function QuickAddDailyItemModal({
  open,
  onOpenChange,
  prefilledName = '',
  prefilledCategory = '',
  onSuccess,
  onOpenFullMaster,
  activeItems,
}: QuickAddDailyItemModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Vegetables')
  const [unit, setUnit] = useState('KG')
  const [shortName, setShortName] = useState('')
  const [alias, setAlias] = useState('')
  const [perishable, setPerishable] = useState(true)
  const [qualityGradeEnabled, setQualityGradeEnabled] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoriesList, setCategoriesList] = useState<string[]>(DEFAULT_DAILY_CATEGORIES)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(prefilledName.trim())
    const initialCat = (prefilledCategory && prefilledCategory !== 'all') ? prefilledCategory : 'Vegetables'
    setCategory(initialCat)
    const suggestedUnit = CATEGORY_UNIT_SUGGESTIONS[initialCat] || 'KG'
    setUnit(suggestedUnit)
    setShortName('')
    setAlias('')
    setPerishable(['Vegetables', 'Fruits', 'Dairy', 'Frozen Items', 'Meat/Poultry'].includes(initialCat))
    setQualityGradeEnabled(false)
    setConfirmDuplicate(false)

    api.items.categories()
      .then((cats) => {
        const merged = [...new Set([...DEFAULT_DAILY_CATEGORIES, ...cats])].sort()
        setCategoriesList(merged)
      })
      .catch(() => {})
  }, [open, prefilledName, prefilledCategory])

  // Update suggested unit when category changes
  const handleCategoryChange = (val: string) => {
    setCategory(val)
    if (CATEGORY_UNIT_SUGGESTIONS[val]) {
      setUnit(CATEGORY_UNIT_SUGGESTIONS[val])
    }
    setPerishable(['Vegetables', 'Fruits', 'Dairy', 'Frozen Items', 'Meat/Poultry'].includes(val))
  }

  // Duplicate / Similar Item pre-check
  const duplicateMatch = useMemo(() => {
    const q = name.trim().toLowerCase()
    const aliasQ = alias.trim().toLowerCase()
    if (!q && !aliasQ) return null

    return activeItems.find((item) => {
      const itemName = (item.name || '').toLowerCase()
      const itemShort = (item.shortName || '').toLowerCase()
      const aliases = (item.aliases ?? []).map((a) => a.aliasText.toLowerCase())

      if (q && (itemName === q || itemShort === q || aliases.includes(q))) return true
      if (aliasQ && (itemName === aliasQ || aliases.includes(aliasQ))) return true
      
      // Synonym check for common terms like bata / bataka / potato
      if ((q === 'bata' || q === 'bataka' || q === 'batata' || q === 'aloo') && (itemName.includes('potato') || aliases.some(a => a.includes('potato') || a.includes('batak')))) return true
      if ((q === 'tamet' || q === 'tameta' || q === 'tamatar') && (itemName.includes('tomato') || aliases.some(a => a.includes('tomato')))) return true
      if ((q === 'dudh' || q === 'doodh') && (itemName.includes('milk') || aliases.some(a => a.includes('milk')))) return true

      return false
    })
  }, [name, alias, activeItems])

  const handleQuickAdd = async () => {
    const trimmedName = name.trim()
    if (!trimmedName || !category || !unit) {
      toast.error('Please fill required fields (Name, Category, Unit)')
      return
    }

    setIsSubmitting(true)
    try {
      const createdItem = await api.items.create({
        name: trimmedName,
        category,
        unit,
        stock: 0,
        minStock: 0,
        shortName: shortName.trim() || undefined,
        sourceChannel: 'DAILY_PROCUREMENT_QUICK_ADD',
        itemNature: perishable ? 'PERISHABLE' : 'NON_PERISHABLE',
        qualityGradeEnabled,
        active: true,
        confirmDuplicate: confirmDuplicate ? true : undefined,
      })

      toast.success(`Registered "${createdItem.name}" in Item Master and added to requirement!`)
      onOpenChange(false)
      onSuccess(createdItem)
    } catch (err: any) {
      if (err.data?.code === 'ITEM_DUPLICATE' && !confirmDuplicate) {
        setConfirmDuplicate(true)
        toast.warning(err.message || 'A similar item exists. Click "Save & Add" again to confirm creation, or use the existing item.')
      } else {
        toast.error(err.message || 'Failed to create item')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUseExisting = (item: ItemResponse) => {
    toast.success(`Selected existing item "${item.name}" (${item.unit})`)
    onOpenChange(false)
    onSuccess(item)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/60 p-0 overflow-hidden shadow-2xl rounded-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b bg-muted/20">
          <DialogTitle className="flex items-center gap-2 text-base font-bold tracking-tight">
            <PackagePlus className="size-5 text-primary" />
            Quick Add Daily Item
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Create a basic Item Master record and add it directly to this requirement.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4 text-xs">
          
          {/* Live Duplicate Warning Panel */}
          {duplicateMatch && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between font-semibold text-[11px]">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  Possible Existing Item Found
                </span>
                <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-700 dark:text-amber-300">
                  {duplicateMatch.category || 'General'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <div>
                  <span className="font-bold text-foreground">{duplicateMatch.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-1 font-mono">({duplicateMatch.stock - duplicateMatch.reservedQty} {duplicateMatch.unit} usable)</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-7 text-[10px] bg-amber-600 hover:bg-amber-700 text-white gap-1 font-semibold rounded-lg px-2.5 shadow-xs"
                  onClick={() => handleUseExisting(duplicateMatch)}
                >
                  Use Existing Item <ArrowRight className="size-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Item Name *</Label>
              <Input
                placeholder="e.g. Potato, Fresh Milk, A4 Paper..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background border-border h-9 text-xs"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Category *</Label>
                <Select value={category} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="bg-background border-border h-9 text-xs">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {categoriesList.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Base Unit *</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="bg-background border-border h-9 text-xs font-mono font-semibold">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {COMMON_UNITS.map((u) => (
                      <SelectItem key={u} value={u} className="text-xs font-mono">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Short Name (Optional)</Label>
                <Input
                  placeholder="e.g. Pot-KG"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  className="bg-background border-border h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Alias / Local Term</Label>
                <Input
                  placeholder="e.g. Bataka, Aloo..."
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="bg-background border-border h-9 text-xs"
                />
              </div>
            </div>

            {/* Procurement Flags */}
            <div className="pt-2 flex flex-col gap-2 bg-muted/20 p-2.5 rounded-xl border border-border/30">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={perishable}
                  onCheckedChange={(checked) => setPerishable(!!checked)}
                />
                <span className="text-xs font-medium">Perishable Goods (Daily Fresh Consumable)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={qualityGradeEnabled}
                  onCheckedChange={(checked) => setQualityGradeEnabled(!!checked)}
                />
                <span className="text-xs font-medium">Require Quality / Grade Spec (e.g. Grade A)</span>
              </label>
            </div>

          </div>
        </div>

        <DialogFooter className="px-6 py-3.5 border-t bg-muted/10 flex flex-row items-center justify-between shrink-0 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1 hover:text-foreground"
            onClick={() => {
              onOpenChange(false)
              onOpenFullMaster()
            }}
          >
            <ExternalLink className="size-3.5" /> Open Full Item Master
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleQuickAdd}
              disabled={isSubmitting || !name.trim()}
              className="text-xs font-semibold bg-primary gap-1.5 shadow-md shadow-primary/20"
            >
              {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {confirmDuplicate ? 'Confirm & Add to Requirement' : 'Save & Add to Requirement'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
