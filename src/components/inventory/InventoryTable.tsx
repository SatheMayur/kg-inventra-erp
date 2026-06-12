'use client'

import { useState, useMemo } from 'react'
import {
  MoreHorizontal, Edit, RefreshCw, Trash2, BoxesIcon,
  AlertTriangle, CheckCircle2, Loader2, Check, QrCode,
  ChevronUp, ChevronDown, ChevronsUpDown, Layers, Camera,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api, ItemResponse } from '@/lib/api'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { QRCodeDialog } from './QRCodeDialog'
import { ItemVariantsDialog } from './ItemVariantsDialog'
import { ItemThumb } from './item-thumb'
import { ItemImagesDialog } from './ItemImagesDialog'
import { ItemDetailDialog } from './ItemDetailDialog'

interface InventoryTableProps {
  items: ItemResponse[]
  loading: boolean
  onRefresh?: () => void
}

type SortField = 'name' | 'category' | 'stock' | 'status'
type SortDir = 'asc' | 'desc'

function getStockStatus(item: ItemResponse): 0 | 1 | 2 {
  if (item.stock === 0) return 0
  if (item.stock <= item.minStock) return 1
  return 2
}

function StatusBadge({ item }: { item: ItemResponse }) {
  if (item.stock === 0) {
    return (
      <Badge variant="outline" className="border-rose-500/20 text-rose-700 bg-rose-500/10 gap-1 text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap">
        <AlertTriangle className="size-2.5" /> Out of Stock
      </Badge>
    )
  }
  if (item.stock <= item.minStock) {
    return (
      <Badge variant="outline" className="border-amber-500/20 text-amber-700 bg-amber-500/10 gap-1 text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap">
        <AlertTriangle className="size-2.5" /> Low Stock
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-500/10 gap-1 text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap">
      <CheckCircle2 className="size-2.5" /> In Stock
    </Badge>
  )
}

function SortButton({
  field, current, dir, onSort, children,
}: {
  field: SortField; current: SortField; dir: SortDir; onSort: (f: SortField) => void; children: React.ReactNode
}) {
  const active = current === field
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {children}
      {active ? (
        dir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
      ) : (
        <ChevronsUpDown className="size-3 opacity-30" />
      )}
    </button>
  )
}

export function InventoryTable({ items, loading, onRefresh }: InventoryTableProps) {
  const user = useAppStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortField === 'category') cmp = a.category.localeCompare(b.category)
      else if (sortField === 'stock') cmp = a.stock - b.stock
      else if (sortField === 'status') cmp = getStockStatus(a) - getStockStatus(b)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortField, sortDir])

  // Edit dialog
  const [editItem, setEditItem] = useState<ItemResponse | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editMinStock, setEditMinStock] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Restock dialog
  const [restockItem, setRestockItem] = useState<ItemResponse | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [restockRef, setRestockRef] = useState('')
  const [restockLoading, setRestockLoading] = useState(false)

  // Delete dialog
  const [deleteItem, setDeleteItem] = useState<ItemResponse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // QR dialog
  const [qrItem, setQrItem] = useState<ItemResponse | null>(null)

  // Variants dialog
  const [variantsItem, setVariantsItem] = useState<ItemResponse | null>(null)

  // Photos dialog
  const [imagesItem, setImagesItem] = useState<ItemResponse | null>(null)

  // Detail dialog (click on item name)
  const [detailItem, setDetailItem] = useState<ItemResponse | null>(null)

  function openEdit(item: ItemResponse) {
    setEditItem(item)
    setEditName(item.name)
    setEditCategory(item.category)
    setEditUnit(item.unit)
    setEditMinStock(String(item.minStock))
  }

  function openRestock(item: ItemResponse) {
    setRestockItem(item)
    setRestockQty('')
    setRestockRef('')
  }

  async function handleEdit() {
    if (!editItem) return
    const minStockN = parseInt(editMinStock, 10)
    if (!Number.isFinite(minStockN) || minStockN < 0) {
      toast.error('Min stock must be a non-negative number')
      return
    }
    setEditLoading(true)
    try {
      await api.items.update(editItem.id, {
        name: editName.trim(),
        category: editCategory.trim(),
        unit: editUnit.trim(),
        minStock: minStockN,
      })
      toast.success('Item updated')
      setEditItem(null)
      onRefresh?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update item')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleRestock() {
    if (!restockItem) return
    const qty = parseInt(restockQty, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Quantity must be a positive number')
      return
    }
    setRestockLoading(true)
    try {
      await api.items.restock(restockItem.id, {
        qty,
        reference: restockRef.trim() || 'Restock',
        userId: user?.id,
      })
      toast.success(`Restocked ${qty} ${restockItem.unit}`)
      setRestockItem(null)
      onRefresh?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to restock')
    } finally {
      setRestockLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteItem) return
    setDeleteLoading(true)
    try {
      await api.items.delete(deleteItem.id)
      toast.success(`"${deleteItem.name}" deleted`)
      setDeleteItem(null)
      onRefresh?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete item')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <>
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)', minHeight: '320px' }}>
        <Table className="enterprise-table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[52px]">Photo</TableHead>
              <TableHead className="w-[280px]">
                <SortButton field="name" current={sortField} dir={sortDir} onSort={handleSort}>
                  Item Name
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton field="category" current={sortField} dir={sortDir} onSort={handleSort}>
                  Category
                </SortButton>
              </TableHead>
              <TableHead className="w-[160px]">
                <SortButton field="stock" current={sortField} dir={sortDir} onSort={handleSort}>
                  Stock Level
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton field="status" current={sortField} dir={sortDir} onSort={handleSort}>
                  Status
                </SortButton>
              </TableHead>
              {isAdmin && <TableHead className="w-[120px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="size-10 rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  {isAdmin && <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>}
                </TableRow>
              ))
            ) : sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 6 : 5} className="h-56 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <BoxesIcon className="size-8 opacity-20" />
                    <p className="text-sm">No items match your criteria</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => (
                <TableRow key={item.id} className="group">
                  <TableCell>
                    <ItemThumb photoUrl={item.photoUrl} name={item.name} size={40} />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="flex flex-col gap-0.5 text-left hover:underline underline-offset-2 cursor-pointer"
                      onClick={() => setDetailItem(item)}
                    >
                      <span className="font-semibold text-sm text-foreground leading-tight">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{item.id.slice(0, 8).toUpperCase()}</span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] font-medium bg-muted/30 text-muted-foreground border-0">
                      {item.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 max-w-[140px]">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-foreground tabular-nums">{item.stock} <span className="font-normal text-muted-foreground">{item.unit}</span></span>
                        <span className="text-muted-foreground">/{item.minStock}</span>
                      </div>
                      <div className="h-1 w-full bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.stock === 0 ? 'bg-rose-500' :
                            item.stock <= item.minStock ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, (item.stock / Math.max(item.minStock * 2, 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge item={item} />
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); openRestock(item) }}
                        >
                          <RefreshCw className="size-3" /> Restock
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-foreground"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 border-border">
                            <DropdownMenuItem className="gap-2 text-xs" onClick={() => openEdit(item)}>
                              <Edit className="size-3.5" /> Edit item
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-xs" onClick={() => openRestock(item)}>
                              <RefreshCw className="size-3.5" /> Restock
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-xs" onClick={() => setQrItem(item)}>
                              <QrCode className="size-3.5 text-primary" /> QR label
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-xs" onClick={() => setVariantsItem(item)}>
                              <Layers className="size-3.5 text-violet-500" /> Manage variants
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-xs" onClick={() => setImagesItem(item)}>
                              <Camera className="size-3.5 text-sky-500" /> Photos
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 text-xs text-rose-600 focus:text-rose-600 focus:bg-rose-500/10"
                              onClick={() => setDeleteItem(item)}
                            >
                              <Trash2 className="size-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Edit className="size-4 text-primary" /> Edit Item
            </DialogTitle>
            <DialogDescription>Update item details. Stock is managed via Restock.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase font-semibold text-muted-foreground tracking-[0.06em]">Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="border-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-semibold text-muted-foreground tracking-[0.06em]">Category</Label>
                <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase font-semibold text-muted-foreground tracking-[0.06em]">Unit</Label>
                <Input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="border-border" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase font-semibold text-muted-foreground tracking-[0.06em]">Min Stock (alert threshold)</Label>
              <Input type="number" min={0} value={editMinStock} onChange={(e) => setEditMinStock(e.target.value)} className="border-border" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editLoading} className="gap-1.5">
              {editLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restock Dialog */}
      <Dialog open={!!restockItem} onOpenChange={(o) => !o && setRestockItem(null)}>
        <DialogContent className="sm:max-w-sm border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="size-4 text-primary" /> Restock
            </DialogTitle>
            <DialogDescription>
              Add stock for <strong>{restockItem?.name}</strong> — current: {restockItem?.stock} {restockItem?.unit}
            </DialogDescription>
          </DialogHeader>
          {/* Visual confirmation — prevents adjusting the wrong item */}
          {restockItem && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-2">
              <ItemThumb photoUrl={restockItem.photoUrl} name={restockItem.name} size={56} />
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{restockItem.name}</p>
                <p>{restockItem.category} · {restockItem.stock} {restockItem.unit} in stock</p>
              </div>
            </div>
          )}
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase font-semibold text-muted-foreground tracking-[0.06em]">Quantity to add</Label>
              <Input
                type="number"
                min={1}
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                placeholder="e.g. 50"
                className="border-border"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase font-semibold text-muted-foreground tracking-[0.06em]">Reference / Note (optional)</Label>
              <Input
                value={restockRef}
                onChange={(e) => setRestockRef(e.target.value)}
                placeholder="e.g. PO-2026-001"
                className="border-border"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRestockItem(null)}>Cancel</Button>
            <Button onClick={handleRestock} disabled={restockLoading || !restockQty} className="gap-1.5">
              {restockLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Add stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent className="border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-rose-600" /> Delete item?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteItem?.name}</strong>? This cannot be undone. Items with open requests cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
            >
              {deleteLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QRCodeDialog item={qrItem} onClose={() => setQrItem(null)} />

      <ItemVariantsDialog
        item={variantsItem}
        open={!!variantsItem}
        onOpenChange={(o) => { if (!o) setVariantsItem(null) }}
      />

      <ItemDetailDialog item={detailItem} onOpenChange={(o) => { if (!o) setDetailItem(null) }} />

      {imagesItem && (
        <ItemImagesDialog
          itemId={imagesItem.id}
          itemName={imagesItem.name}
          isLiquid={imagesItem.category.toLowerCase().includes('liquid')}
          open={!!imagesItem}
          onOpenChange={(o) => { if (!o) setImagesItem(null) }}
          onPrimaryChange={() => onRefresh?.()}
        />
      )}
    </>
  )
}
