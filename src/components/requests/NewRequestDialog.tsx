'use client'

import { useState, useEffect } from 'react'
import { ClipboardList, Check, Loader2, Search } from 'lucide-react'
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
import { toast } from 'sonner'

interface NewRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: string; name: string; department: string; floor?: string } | null
  isAdmin: boolean
  // items prop kept for API compatibility but dialog fetches its own full list
  items?: ItemResponse[]
  users: UserResponse[]
  onSuccess: () => void
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
  const [formItemId, setFormItemId] = useState('')
  const [formQty, setFormQty] = useState('')
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
      setFormItemId('')
      setFormQty('')
      setFormUserId('')
      setFormNote('')
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
  const selectedFormItem = allItems.find((i) => i.id === formItemId)
  const formAvailable = selectedFormItem ? selectedFormItem.stock - selectedFormItem.reservedQty : 0

  const handleCreateRequest = async () => {
    if (!user || !formItemId || !formQty) {
      toast.error('Please fill all fields')
      return
    }

    if (isAdmin && !formUserId) {
      toast.error('Please select an employee')
      return
    }

    const qty = parseInt(formQty, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Quantity must be a positive number')
      return
    }

    if (qty > formAvailable) {
      toast.error(`Only ${formAvailable} available`)
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
        itemId: formItemId,
        qty,
        note: formNote.trim() || undefined,
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
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold">
            <ClipboardList className="size-4 text-primary" />
            New Item Request
          </DialogTitle>
          <DialogDescription>Submit a formal request for store assets</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isAdmin ? (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Employee</Label>
              <Select value={formUserId} onValueChange={setFormUserId}>
                <SelectTrigger className="w-full bg-muted/20 border-border/50">
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
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Employee</Label>
              <Input
                value={user?.name || ''}
                readOnly
                className="bg-muted/10 border-border/50 text-muted-foreground cursor-not-allowed"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Target Destination</Label>
            <Input
              value={`${selectedFormUser?.department || user?.department || ''} · ${selectedFormUser?.floor || user?.floor || ''}`}
              readOnly
              className="bg-muted/10 border-border/50 text-muted-foreground cursor-not-allowed"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Asset Selection</Label>
            {itemsLoading ? (
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-border/50 bg-muted/20 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading items...
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Search box */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    placeholder="Search items..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="pl-8 h-9 bg-muted/20 border-border/50 text-sm"
                  />
                </div>
                {/* Scrollable item list */}
                <div className="max-h-48 overflow-y-auto rounded-md border border-border/50 bg-muted/10 divide-y divide-border/20">
                  {filteredItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No items found</p>
                  ) : (
                    filteredItems.map((item) => {
                      const avail = item.stock - item.reservedQty
                      const isSelected = formItemId === item.id
                      const isUnavailable = avail <= 0
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isUnavailable}
                          onClick={() => { setFormItemId(item.id); setFormQty('') }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-sm transition-colors
                            ${isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-primary/5'}
                            ${isUnavailable ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground">{item.category}</p>
                          </div>
                          <span className={`text-[10px] font-mono ml-3 shrink-0 ${isUnavailable ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {isUnavailable ? 'Out of stock' : `${avail} ${item.unit}`}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
                {formItemId && selectedFormItem && (
                  <p className="text-[10px] text-primary font-medium">
                    Selected: {selectedFormItem.name}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Requested Quantity</Label>
              {selectedFormItem && (
                <span className="text-[10px] font-mono text-primary">
                  Limit: {formAvailable} {selectedFormItem.unit}
                </span>
              )}
            </div>
            <Input
              type="number"
              min={1}
              max={formAvailable || undefined}
              value={formQty}
              onChange={(e) => setFormQty(e.target.value)}
              placeholder="e.g. 5"
              className="bg-muted/20 border-border/50"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Description / Note</Label>
              <span className="text-[10px] text-muted-foreground/50">Optional</span>
            </div>
            <Textarea
              placeholder="Describe why you need this item, urgency, or any other details..."
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="bg-muted/20 border-border/50 text-sm resize-none"
            />
            {(() => {
              const SUGGESTIONS = [
                'Not working', 'Needs repair', 'Replacement for damaged unit',
                'Urgent requirement', 'New joinee setup', 'Stock running low',
                'Defective on arrival', 'Routine replenishment',
              ]
              // Work on the LAST comma/period/newline-delimited segment so suggestions
              // fire mid-sentence, not only when the whole note is a prefix.
              const seg = formNote.match(/[^,.\n]*$/)?.[0] ?? ''
              const core = seg.trim().toLowerCase()
              const matched = core
                ? SUGGESTIONS.filter((s) => s.toLowerCase().startsWith(core))
                : SUGGESTIONS
              const chips = (matched.length ? matched : SUGGESTIONS).slice(0, 6)

              // Click = complete the partial fragment in place, or append a new
              // phrase — never overwrite what the user already typed.
              const apply = (phrase: string) => {
                const lead = seg.match(/^\s*/)?.[0] ?? ''
                const base = formNote.slice(0, formNote.length - seg.length)
                let next: string
                if (seg.trim() && phrase.toLowerCase().startsWith(seg.trim().toLowerCase())) {
                  next = base + lead + phrase
                } else if (!formNote.trim()) {
                  next = phrase
                } else {
                  next = formNote.replace(/\s+$/, '') + ', ' + phrase
                }
                setFormNote(next.slice(0, 500))
              }

              return (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {chips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => apply(s)}
                      className="text-[10px] px-2 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )
            })()}
            {formNote.length > 0 && (
              <p className="text-[10px] text-muted-foreground/50 text-right">{formNote.length}/500</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateRequest}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-lg shadow-primary/20"
            disabled={!formItemId || !formQty || (isAdmin && !formUserId) || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Confirm Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

