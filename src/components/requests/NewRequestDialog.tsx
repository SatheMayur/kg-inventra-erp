'use client'

import { useState, useEffect } from 'react'
import { ClipboardList, Check, Loader2, Search, Trash2, Plus, Calendar, Cpu, User, AlertCircle } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api, ItemResponse, UserResponse } from '@/lib/api'
import { ItemThumb } from '@/components/inventory/item-thumb'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'

interface NewRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: string; name: string; department: string; floor?: string } | null
  isAdmin: boolean
  items?: ItemResponse[]
  users: UserResponse[]
  onSuccess: () => void
}

interface CartItem {
  key: string
  item?: ItemResponse
  custom?: { name: string; unit: string }
  qty: number
}

export function NewRequestDialog({
  open,
  onOpenChange,
  user,
  isAdmin,
  users,
  onSuccess,
}: NewRequestDialogProps) {
  const [formUserId, setFormUserId] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  
  // Single-item selection state for adding to cart
  const [selectedItemId, setSelectedItemId] = useState('')
  const [addQty, setAddQty] = useState('')

  // Off-catalog (custom) item entry state
  const [customName, setCustomName] = useState('')
  const [customUnit, setCustomUnit] = useState('pcs')
  const [customQty, setCustomQty] = useState('')
  
  // Metadata fields
  const [requiredDate, setRequiredDate] = useState('')
  const [machine, setMachine] = useState('')
  const [concernPerson, setConcernPerson] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [purpose, setPurpose] = useState('')
  const [formNote, setFormNote] = useState('')
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [allItems, setAllItems] = useState<ItemResponse[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemSearch, setItemSearch] = useState('')

  useEffect(() => {
    if (!open) return
    setItemsLoading(true)
    api.items.list({ pageSize: 1000 })
      .then((res) => setAllItems(res.items.filter((i) => !i.deletedAt)))
      .catch(() => toast.error('Failed to load items'))
      .finally(() => setItemsLoading(false))
  }, [open])

  // Reset all form state when dialog closes
  useEffect(() => {
    if (!open) {
      setItemSearch('')
      setSelectedItemId('')
      setAddQty('')
      setCustomName('')
      setCustomUnit('pcs')
      setCustomQty('')
      setFormUserId('')
      setRequiredDate('')
      setMachine('')
      setConcernPerson('')
      setPriority('MEDIUM')
      setPurpose('')
      setFormNote('')
      setCart([])
      setAllItems([])
    }
  }, [open])

  const filteredItems = itemSearch
    ? allItems.filter((i) =>
        i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        i.category.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : allItems

  const selectedFormUser = isAdmin ? users.find((u) => u.id === formUserId) : user
  const selectedCatalogItem = allItems.find((i) => i.id === selectedItemId)
  
  // Calculate available stock for selected catalog item, taking current cart quantity into account
  const getAvailableStock = (item: ItemResponse) => {
    const cartMatch = cart.find((c) => c.item?.id === item.id)
    const cartQty = cartMatch ? cartMatch.qty : 0
    return item.stock - item.reservedQty - cartQty
  }

  const handleAddToCart = () => {
    if (!selectedCatalogItem) return
    const qty = parseInt(addQty, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid positive quantity')
      return
    }

    // Add to cart or increment if exists
    setCart((prev) => {
      const existing = prev.find((c) => c.item?.id === selectedCatalogItem.id)
      if (existing) {
        return prev.map((c) =>
          c.item?.id === selectedCatalogItem.id ? { ...c, qty: c.qty + qty } : c
        )
      } else {
        return [...prev, { key: `cat:${selectedCatalogItem.id}`, item: selectedCatalogItem, qty }]
      }
    })

    // Reset single item picker state
    setSelectedItemId('')
    setAddQty('')
    setItemSearch('')
    toast.success(`Added ${qty}x ${selectedCatalogItem.name} to list`)
  }

  const handleAddCustom = () => {
    const name = customName.trim()
    const qty = parseInt(customQty, 10)
    if (!name) {
      toast.error('Please enter the custom item name')
      return
    }
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid positive quantity')
      return
    }
    setCart((prev) => [
      ...prev,
      { key: `custom:${name}:${prev.length}:${Date.now()}`, custom: { name, unit: customUnit.trim() || 'pcs' }, qty },
    ])
    setCustomName('')
    setCustomUnit('pcs')
    setCustomQty('')
    toast.success(`Added custom item "${name}" to list`)
  }

  const handleRemoveFromCart = (key: string) => {
    setCart((prev) => prev.filter((c) => c.key !== key))
  }

  const handleCreateRequest = async () => {
    if (!user) return
    if (cart.length === 0) {
      toast.error('Please add at least one item to the request')
      return
    }

    if (isAdmin && !formUserId) {
      toast.error('Please select an employee')
      return
    }

    const targetUserId = isAdmin && formUserId ? formUserId : user.id
    const targetUser = isAdmin && formUserId ? users.find((u) => u.id === formUserId) : user

    try {
      setIsSubmitting(true)
      await api.requests.create({
        userId: targetUserId,
        employee: targetUser?.name || user.name,
        department: targetUser?.department || user.department,
        lines: cart.map((c) =>
          c.item
            ? { itemId: c.item.id, qty: c.qty }
            : { customItemName: c.custom!.name, unit: c.custom!.unit, qty: c.qty }
        ),
        note: formNote.trim() || undefined,
        requiredDate: requiredDate || undefined,
        machine: machine.trim() || undefined,
        concernPerson: concernPerson.trim() || undefined,
        priority,
        purpose: purpose.trim() || undefined,
      })
      toast.success('Request created successfully')
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create request')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-card/95 backdrop-blur-xl border-border/50 max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 font-bold text-lg">
            <ClipboardList className="size-5 text-primary" />
            New Multi-Item Request
          </DialogTitle>
          <DialogDescription>Add items to your requisition cart and fill in target details</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-border/20 flex-1 overflow-hidden">
          {/* Left Panel: Sourcing & Cart Setup */}
          <div className="md:col-span-7 p-6 overflow-y-auto space-y-4 flex flex-col max-h-[60vh] md:max-h-full">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Items</h4>
            
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Search items to add..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="pl-9 bg-muted/20 border-border/50"
                />
              </div>

              {itemsLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Loading catalog items...
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-md border border-border/50 bg-muted/10 divide-y divide-border/20">
                  {filteredItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No items found</p>
                  ) : (
                    filteredItems.map((item) => {
                      const avail = getAvailableStock(item)
                      const isSelected = selectedItemId === item.id
                      const isUnavailable = avail <= 0
                      
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => { setSelectedItemId(item.id); setAddQty('') }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors cursor-pointer
                            ${isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-primary/5'}
                          `}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ItemThumb photoUrl={item.photoUrl} name={item.name} size={28} />
                            <div className="min-w-0">
                              <p className="font-medium truncate text-xs">{item.name}</p>
                              <p className="text-[10px] text-muted-foreground">{item.category}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0 text-right">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              Available Stock: {Math.max(0, avail)} {item.unit}
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${isUnavailable ? 'text-amber-500' : 'text-emerald-500'}`}>
                              {isUnavailable ? 'Purchase Required' : 'Available'}
                            </span>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {selectedItemId && selectedCatalogItem && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <ItemThumb photoUrl={selectedCatalogItem.photoUrl} name={selectedCatalogItem.name} size={40} />
                  <div>
                    <h5 className="text-xs font-semibold">{selectedCatalogItem.name}</h5>
                    <p className="text-[10px] text-muted-foreground">Available Stock: {Math.max(0, getAvailableStock(selectedCatalogItem))} {selectedCatalogItem.unit}</p>
                  </div>
                </div>
                
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Quantity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={addQty}
                      onChange={(e) => setAddQty(e.target.value)}
                      placeholder="Enter requested quantity..."
                      className="bg-background border-border/50 h-9 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddToCart}
                    size="sm"
                    className="bg-primary hover:bg-primary/95 text-xs h-9 gap-1"
                  >
                    <Plus className="size-3.5" /> Add to Request
                  </Button>
                </div>
              </div>
            )}

            {/* Off-catalog (custom) item entry */}
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-3 space-y-2">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Can&apos;t find it? Request a custom item</p>
              <Input
                placeholder="Item name (e.g. Water Bottle)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="bg-background border-border/50 h-9 text-xs"
              />
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Unit</Label>
                  <Input
                    placeholder="pcs"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    className="bg-background border-border/50 h-9 text-xs"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Qty"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="bg-background border-border/50 h-9 text-xs"
                  />
                </div>
                <Button type="button" onClick={handleAddCustom} size="sm" variant="outline" className="h-9 gap-1 text-xs">
                  <Plus className="size-3.5" /> Add
                </Button>
              </div>
            </div>

            <Separator className="bg-border/20" />

            {/* Cart list */}
            <div className="flex-1 flex flex-col min-h-0 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex justify-between items-center">
                <span>Items in Request ({cart.length})</span>
                {cart.length > 0 && (
                  <button type="button" onClick={() => setCart([])} className="text-[10px] text-rose-400 hover:underline">
                    Clear All
                  </button>
                )}
              </h4>
              
              <div className="flex-1 overflow-y-auto space-y-2 max-h-48 md:max-h-none border border-border/40 rounded-lg p-2 bg-muted/5">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <ClipboardList className="size-8 opacity-20 mb-2" />
                    <p className="text-[11px]">No items added yet.</p>
                  </div>
                ) : (
                  cart.map((c) => (
                    <div key={c.key} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        {c.item ? (
                          <ItemThumb photoUrl={c.item.photoUrl} name={c.item.name} size={28} />
                        ) : (
                          <span className="inline-flex items-center justify-center size-7 rounded bg-amber-500/15 text-amber-600 text-[8px] font-bold uppercase shrink-0">New</span>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{c.item?.name ?? c.custom!.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {c.qty} {c.item?.unit ?? c.custom!.unit}{!c.item && ' · Custom (Purchase Required)'}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-rose-400"
                        onClick={() => handleRemoveFromCart(c.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Requisition Metadata & Details (P1) */}
          <div className="md:col-span-5 p-6 overflow-y-auto space-y-4 max-h-[60vh] md:max-h-full bg-muted/5 border-t md:border-t-0 md:border-l border-border/20">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target & Operations</h4>

            {isAdmin ? (
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                  <User className="size-3" /> Requester
                </Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger className="w-full bg-background border-border/50 text-xs h-9">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.empId}) · {u.department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                  <User className="size-3" /> Requester
                </Label>
                <Input
                  value={user?.name || ''}
                  readOnly
                  className="bg-muted/10 border-border/30 text-muted-foreground cursor-not-allowed h-9 text-xs"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Department Destination</Label>
              <Input
                value={selectedFormUser ? `${selectedFormUser.department} ${selectedFormUser.floor ? `· Floor ${selectedFormUser.floor}` : ''}` : `${user?.department || ''} ${user?.floor ? `· Floor ${user.floor}` : ''}`}
                readOnly
                className="bg-muted/10 border-border/30 text-muted-foreground cursor-not-allowed h-9 text-xs"
              />
            </div>

            <Separator className="bg-border/20" />

            {/* P1 Metadata: Concern Person */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Concern Person</Label>
              <Input
                placeholder="Person coordinating this request"
                value={concernPerson}
                onChange={(e) => setConcernPerson(e.target.value)}
                className="bg-background border-border/50 h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* P1 Metadata: Required Date */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                  <Calendar className="size-3" /> Required Date
                </Label>
                <Input
                  type="date"
                  value={requiredDate}
                  onChange={(e) => setRequiredDate(e.target.value)}
                  className="bg-background border-border/50 h-9 text-xs px-2"
                />
              </div>

              {/* P1 Metadata: Machine / Cost-Center */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                  <Cpu className="size-3" /> Machine / Cost-Center
                </Label>
                <Input
                  placeholder="e.g. CNC-01"
                  value={machine}
                  onChange={(e) => setMachine(e.target.value)}
                  className="bg-background border-border/50 h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* P1 Metadata: Priority */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-full bg-background border-border/50 text-xs h-9">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* P1 Metadata: Purpose */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Purpose</Label>
              <Input
                placeholder="Purpose of this request"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="bg-background border-border/50 h-9 text-xs"
              />
            </div>

            {/* Note / Remarks */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Remarks / Notes</Label>
              <Textarea
                placeholder="Optional explanation notes..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                maxLength={300}
                rows={2}
                className="bg-background border-border/50 text-xs resize-none"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/20 bg-muted/5 flex items-center justify-end gap-2 sm:gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateRequest}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-lg shadow-primary/20 text-xs h-9"
            disabled={cart.length === 0 || (isAdmin && !formUserId) || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Confirm Requisition ({cart.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

