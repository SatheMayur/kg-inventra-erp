'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ArrowRightLeft,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  GitMerge,
  Loader2,
  FileText,
  X,
  ScanBarcode,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ItemThumb } from '@/components/inventory/item-thumb'
import { api, StockTransferResponse, ItemResponse } from '@/lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

const LOCATIONS = [
  'Main Store',
  'Warehouse',
  'Cold Storage',
  'Receiving Bay',
  'Production Floor',
]

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'CONFIRMED':
      return (
        <Badge variant="outline" className="border-sky-500/20 text-sky-700 bg-sky-500/10 gap-1 text-[10px]">
          <CheckCircle2 className="size-2.5" /> Confirmed
        </Badge>
      )
    case 'DRAFT':
      return (
        <Badge variant="outline" className="border-amber-500/20 text-amber-700 bg-amber-500/10 gap-1 text-[10px]">
          <Clock className="size-2.5" /> Draft
        </Badge>
      )
    case 'RECONCILED':
      return (
        <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-500/10 gap-1 text-[10px]">
          <GitMerge className="size-2.5" /> Reconciled
        </Badge>
      )
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>
  }
}

const emptyItem = { itemId: '', itemName: '', qty: '', unit: 'pcs', variantId: '', variantName: '' }

function ItemSelectThumb({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [error, setError] = useState(false)
  if (error || !src) {
    return <span className="size-5 rounded bg-muted/40 inline-block shrink-0" />
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="size-5 rounded object-cover shrink-0"
      onError={() => setError(true)}
    />
  )
}

export default function StockTransferView({
  title = 'Transfer Memos',
  description = 'Create and reconcile stock movement memos with Petpooja POs.',
}: {
  title?: string
  description?: string
}) {
  const [transfers, setTransfers] = useState<StockTransferResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<ItemResponse[]>([])

  // Stats derived from loaded data
  const draftCount = transfers.filter((t) => t.status === 'DRAFT').length
  const pendingReconciliationCount = transfers.filter((t) => t.status === 'CONFIRMED' && !t.ppReconciled).length
  const reconciledCount = transfers.filter((t) => t.ppReconciled || t.status === 'RECONCILED').length


  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    fromLocation: '',
    toLocation: '',
    notes: '',
    items: [{ ...emptyItem }],
  })
  const [saving, setSaving] = useState(false)

  // Confirm state
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [reconcilingId, setReconcilingId] = useState<string | null>(null)
  const [reconcileTransfer, setReconcileTransfer] = useState<StockTransferResponse | null>(null)
  const [ppPoReference, setPpPoReference] = useState('')


  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [transferData, itemData] = await Promise.all([
        api.stockTransfers.list(),
        api.items.list({ pageSize: 1000 }).then((r) => r.items),
      ])
      setTransfers(transferData)
      setItems(itemData)
    } catch {
      toast.error('Failed to load transfer data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Create ----
  function addItemRow() {
    setCreateForm((f) => ({ ...f, items: [...f.items, { ...emptyItem }] }))
  }

  function removeItemRow(idx: number) {
    setCreateForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  function setItemRow(idx: number, patch: Partial<typeof emptyItem>) {
    setCreateForm((f) => {
      const next = [...f.items]
      next[idx] = { ...next[idx], ...patch }
      return { ...f, items: next }
    })
  }

  async function handleCreate() {
    if (!createForm.fromLocation || !createForm.toLocation) {
      toast.error('From and To locations are required')
      return
    }
    const validItems = createForm.items.filter((i) => i.itemId && parseFloat(i.qty) > 0)
    if (validItems.length === 0) {
      toast.error('Add at least one item with a valid quantity')
      return
    }
    setSaving(true)
    try {
      await api.stockTransfers.create({
        fromLocation: createForm.fromLocation,
        toLocation: createForm.toLocation,
        notes: createForm.notes,
        items: validItems.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          qty: parseFloat(i.qty),
          unit: i.unit,
          variantId: i.variantId || undefined,
          variantName: i.variantName || undefined,
        })),
      })
      toast.success('Transfer memo created')
      setShowCreate(false)
      setCreateForm({ fromLocation: '', toLocation: '', notes: '', items: [{ ...emptyItem }] })
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create transfer')
    } finally {
      setSaving(false)
    }
  }

  // ---- Confirm ----
  async function handleConfirm(id: string) {
    setConfirmingId(id)
    try {
      await api.stockTransfers.confirm(id)
      toast.success('Transfer confirmed — stock updated')
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm transfer')
    } finally {
      setConfirmingId(null)
    }
  }

  function openReconcileDialog(transfer: StockTransferResponse) {
    setReconcileTransfer(transfer)
    setPpPoReference(transfer.ppPoReference || '')
  }

  async function handleReconcile() {
    if (!reconcileTransfer) return
    const trimmedRef = ppPoReference.trim()
    if (!trimmedRef) {
      toast.error('Petpooja PO reference is required')
      return
    }

    setReconcilingId(reconcileTransfer.id)
    try {
      await api.stockTransfers.reconcile(reconcileTransfer.id, { ppPoReference: trimmedRef })
      toast.success('Transfer reconciled with Petpooja PO')
      setReconcileTransfer(null)
      setPpPoReference('')
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reconcile transfer')
    } finally {
      setReconcilingId(null)
    }
  }

  const filteredTransfers = transfers.filter(
    (t) =>
      !search ||
      t.memoNumber.toLowerCase().includes(search.toLowerCase()) ||
      t.fromLocation.toLowerCase().includes(search.toLowerCase()) ||
      t.toLocation.toLowerCase().includes(search.toLowerCase()) ||
      (t.ppPoReference || '').toLowerCase().includes(search.toLowerCase())
  )
  const pendingReconciliationTransfers = filteredTransfers.filter(
    (t) => t.status === 'CONFIRMED' && !t.ppReconciled
  )

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <ArrowRightLeft className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Stock Transfer</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <Button
          className="rounded-xl shadow-lg shadow-primary/20 gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="size-4" /> New Transfer Memo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Clock className="size-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Draft Memos</p>
              <p className="text-2xl font-bold">{loading ? '—' : draftCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <RefreshCw className="size-5 text-sky-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Pending Reconcile</p>
              <p className="text-2xl font-bold">{loading ? '-' : pendingReconciliationCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <GitMerge className="size-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Reconciled</p>
              <p className="text-2xl font-bold">{loading ? '-' : reconciledCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" />
        <Input
          placeholder="Search memo, location, PP ref…"
          className="pl-9 h-9 bg-background border-border"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="memos" className="space-y-6">
        <TabsList className="bg-muted/20 p-1 border border-border rounded-xl">
          <TabsTrigger value="memos" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            All Memos
          </TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
            Pending Reconcile
            {pendingReconciliationCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{pendingReconciliationCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* All Memos Tab */}
        <TabsContent value="memos" className="mt-0">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Memo #</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Movement</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Items</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">PP PO Ref</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Date</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7} className="h-14 animate-pulse bg-muted/10" />
                      </TableRow>
                    ))
                  ) : filteredTransfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-56 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <FileText className="size-10 opacity-20" />
                          <p className="text-sm">No transfer memos found.</p>
                          <Button variant="link" onClick={() => setShowCreate(true)}>
                            Create your first memo
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransfers.map((t) => (
                      <TableRow key={t.id} className="group border-border/20 hover:bg-primary/5 transition-colors">
                        <TableCell className="font-mono text-xs font-bold">{t.memoNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-medium">{t.fromLocation}</span>
                            <ArrowRightLeft className="size-3 text-muted-foreground" />
                            <span className="font-medium">{t.toLocation}</span>
                          </div>
                          {t.notes && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]">{t.notes}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-semibold">{t.items.length}</span>
                            <span className="text-[10px] text-muted-foreground">items</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {t.items.slice(0, 2).map((i) => i.itemName).join(', ')}
                            {t.items.length > 2 ? ` +${t.items.length - 2}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">
                          {t.ppPoReference || '-'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={t.status} />
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {format(new Date(t.createdAt), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {t.status === 'DRAFT' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-emerald-500/20 text-emerald-700 hover:bg-emerald-500/10 gap-1.5"
                                onClick={() => handleConfirm(t.id)}
                                disabled={confirmingId === t.id}
                              >
                                {confirmingId === t.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="size-3" />
                                )}
                                Confirm
                              </Button>
                            )}
                            {t.status === 'CONFIRMED' && !t.ppReconciled && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-sky-500/20 text-sky-700 hover:bg-sky-500/10 gap-1.5"
                                onClick={() => openReconcileDialog(t)}
                                disabled={reconcilingId === t.id}
                              >
                                {reconcilingId === t.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <GitMerge className="size-3" />
                                )}
                                Reconcile
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Pending Reconciliation Tab */}
        <TabsContent value="pending" className="mt-0">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Memo #</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Movement</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Items</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Confirmed On</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5} className="h-14 animate-pulse bg-muted/10" />
                      </TableRow>
                    ))
                  ) : pendingReconciliationTransfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-56 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <CheckCircle2 className="size-10 opacity-20" />
                          <p className="text-sm">No confirmed transfer memos are waiting for reconciliation.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingReconciliationTransfers.map((t) => (
                      <TableRow key={t.id} className="border-border/20 hover:bg-primary/5 transition-colors">
                        <TableCell className="font-mono text-xs font-bold">{t.memoNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-medium">{t.fromLocation}</span>
                            <ArrowRightLeft className="size-3 text-muted-foreground" />
                            <span className="font-medium">{t.toLocation}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium">{t.items.length} items</p>
                          <p className="text-[10px] text-muted-foreground">
                            {t.items.slice(0, 2).map((i) => i.itemName).join(', ')}
                            {t.items.length > 2 ? ` +${t.items.length - 2}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {format(new Date(t.updatedAt), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="h-8 rounded-lg gap-1.5"
                            onClick={() => openReconcileDialog(t)}
                            disabled={reconcilingId === t.id}
                          >
                            {reconcilingId === t.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <GitMerge className="size-3" />
                            )}
                            Reconcile
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Transfer Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="size-5 text-primary" /> New Transfer Memo
            </DialogTitle>
            <DialogDescription>
              Record stock movement between locations. Confirming the memo will deduct from inventory.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Locations */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">From Location *</Label>
                <Select value={createForm.fromLocation} onValueChange={(v) => setCreateForm((f) => ({ ...f, fromLocation: v }))}>
                  <SelectTrigger className="bg-background border-border rounded-xl h-10">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">To Location *</Label>
                <Select value={createForm.toLocation} onValueChange={(v) => setCreateForm((f) => ({ ...f, toLocation: v }))}>
                  <SelectTrigger className="bg-background border-border rounded-xl h-10">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Items *</Label>
                <Button variant="outline" size="sm" className="h-7 text-[10px] rounded-lg gap-1" onClick={addItemRow}>
                  <Plus className="size-3" /> Add Row
                </Button>
              </div>
              <div className="space-y-2">
                {createForm.items.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                    {/* Photo of the item being moved — visual confirmation */}
                    <ItemThumb
                      photoUrl={items.find((i) => i.id === row.itemId)?.photoUrl}
                      name={row.itemName || 'No item selected'}
                      size={36}
                    />
                    <div className="flex-1">
                      <Select
                        value={row.itemId}
                        onValueChange={(v) => {
                          const found = items.find((i) => i.id === v)
                          setItemRow(idx, {
                            itemId: v,
                            itemName: found?.name || '',
                            unit: found?.unit || 'pcs',
                          })
                        }}
                      >
                        <SelectTrigger className="bg-background border-border h-9 text-xs">
                          <SelectValue placeholder="Select item…" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              <span className="flex items-center gap-2">
                                <ItemSelectThumb src={i.photoUrl} alt={i.name} />
                                {i.name} ({i.stock} {i.unit})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Qty"
                        value={row.qty}
                        onChange={(e) => setItemRow(idx, { qty: e.target.value })}
                        className="bg-background border-border h-9 text-xs"
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        placeholder="Unit"
                        value={row.unit}
                        onChange={(e) => setItemRow(idx, { unit: e.target.value })}
                        className="bg-background border-border h-9 text-xs"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeItemRow(idx)}
                      disabled={createForm.items.length === 1}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="opacity-30" />

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Notes (optional)</Label>
              <Input
                placeholder="Delivery instructions, remarks…"
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                className="bg-background border-border rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/10">
            <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="rounded-xl px-8 shadow-lg shadow-primary/20 gap-2"
              onClick={handleCreate}
              disabled={saving || !createForm.fromLocation || !createForm.toLocation}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Create Memo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!reconcileTransfer}
        onOpenChange={(open) => {
          if (!open) {
            setReconcileTransfer(null)
            setPpPoReference('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="size-5 text-primary" /> Reconcile Transfer
            </DialogTitle>
            <DialogDescription>
              Link this confirmed stock transfer with the Petpooja PO reference used at the destination.
            </DialogDescription>
          </DialogHeader>

          {reconcileTransfer && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold">{reconcileTransfer.memoNumber}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reconcileTransfer.fromLocation} to {reconcileTransfer.toLocation}
                    </p>
                  </div>
                  <StatusBadge status={reconcileTransfer.status} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                  Petpooja PO Reference *
                </Label>
                <div className="relative">
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" />
                  <Input
                    value={ppPoReference}
                    onChange={(e) => setPpPoReference(e.target.value)}
                    placeholder="e.g. PP-PO-2026-001"
                    className="pl-9 bg-background border-border rounded-xl"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  After reconciliation, the memo will be locked as reconciled and removed from pending reconciliation.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-border/10">
            <Button
              variant="ghost"
              onClick={() => {
                setReconcileTransfer(null)
                setPpPoReference('')
              }}
              disabled={!!reconcilingId}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl px-6 gap-2"
              onClick={handleReconcile}
              disabled={!ppPoReference.trim() || !!reconcilingId}
            >
              {reconcilingId ? <Loader2 className="size-4 animate-spin" /> : <GitMerge className="size-4" />}
              Reconcile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
