'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Layers, Package } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api, ItemResponse, ItemVariantResponse } from '@/lib/api'
import { toast } from 'sonner'

interface ItemVariantsDialogProps {
  item: ItemResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const emptyForm = { name: '', packSize: '', packQty: '1', unit: 'pcs', barcode: '', stock: '0' }

export function ItemVariantsDialog({ item, open, onOpenChange }: ItemVariantsDialogProps) {
  const [variants, setVariants] = useState<ItemVariantResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ItemVariantResponse | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open && item) {
      loadVariants()
    }
  }, [open, item])

  async function loadVariants() {
    if (!item) return
    setLoading(true)
    try {
      const data = await api.variants.list(item.id)
      setVariants(data)
    } catch {
      toast.error('Failed to load variants')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!item || !form.name.trim()) {
      toast.error('Variant name is required')
      return
    }
    setSaving(true)
    try {
      const variant = await api.variants.create(item.id, {
        name: form.name.trim(),
        packSize: form.packSize.trim(),
        packQty: parseInt(form.packQty) || 1,
        unit: form.unit.trim() || 'pcs',
        barcode: form.barcode.trim() || undefined,
        stock: parseInt(form.stock) || 0,
      })
      setVariants((prev) => [...prev, variant])
      setForm(emptyForm)
      toast.success(`Variant "${variant.name}" added`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add variant')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!item || !deleteTarget) return
    setDeleting(true)
    try {
      await api.variants.delete(item.id, deleteTarget.id)
      setVariants((prev) => prev.filter((v) => v.id !== deleteTarget.id))
      toast.success(`Variant "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete variant')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              Variants — {item?.name}
            </DialogTitle>
            <DialogDescription>
              Manage pack sizes and sub-types for this item (e.g., 250gm Pack ×10, Tukda 1kg).
            </DialogDescription>
          </DialogHeader>

          {/* Existing Variants */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Current Variants ({variants.length})
            </p>

            {loading ? (
              <div className="flex items-center justify-center h-20 text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-xs">Loading variants…</span>
              </div>
            ) : variants.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 text-muted-foreground gap-2 border border-dashed border-border rounded-xl">
                <Package className="size-6 opacity-20" />
                <p className="text-xs">No variants yet. Add one below.</p>
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/10">
                    <TableRow className="border-border/20">
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest">Variant Name</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest">Pack Size</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest">Pack Qty</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest">Unit</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest">Stock</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest">Barcode</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variants.map((v) => (
                      <TableRow key={v.id} className="border-border/10 hover:bg-muted/5 transition-colors">
                        <TableCell className="font-semibold text-sm">{v.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{v.packSize || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] bg-muted/30">×{v.packQty}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{v.unit}</TableCell>
                        <TableCell className="text-xs font-mono">{v.stock}</TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground">{v.barcode || '—'}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(v)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <Separator className="opacity-30" />

          {/* Add New Variant Form */}
          <div className="space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Add New Variant</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Variant Name *</Label>
                <Input
                  placeholder="e.g. 250gm Pack, Tukda, Mamra"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="bg-background border-border h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Pack Size</Label>
                <Input
                  placeholder="e.g. 250gm, 500gm, 1Kg"
                  value={form.packSize}
                  onChange={(e) => setForm({ ...form, packSize: e.target.value })}
                  className="bg-background border-border h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Units per Pack</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 10"
                  value={form.packQty}
                  onChange={(e) => setForm({ ...form, packQty: e.target.value })}
                  className="bg-background border-border h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Unit</Label>
                <Input
                  placeholder="pcs, kg, g, L"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="bg-background border-border h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Opening Stock</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className="bg-background border-border h-10"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Barcode (optional)</Label>
                <Input
                  placeholder="Scan or enter barcode"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="bg-background border-border h-10 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                className="rounded-xl gap-2 shadow-lg shadow-primary/20"
                onClick={handleAdd}
                disabled={saving || !form.name.trim()}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add Variant
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete variant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
