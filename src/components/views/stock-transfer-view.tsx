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
import { api, StockTransferResponse, ItemResponse, PetpoojaPOResponse } from '@/lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

const LOCATIONS = [
  'Main Store',
  'Warehouse',
  'Cold Storage',
  'Petpooja Kitchen',
  'Receiving Bay',
  'Production Floor',
]

function StatusBadge({ status, reconciled }: { status: string; reconciled: boolean }) {
  if (reconciled) {
    return (
      <Badge variant="outline" className="border-purple-500/20 text-purple-700 bg-purple-500/10 gap-1 text-[10px]">
        <GitMerge className="size-2.5" /> Reconciled
      </Badge>
    )
  }
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
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>
  }
}

const emptyItem = { itemId: '', itemName: '', qty: '', unit: 'pcs', variantId: '', variantName: '' }

export default function StockTransferView() {
  const [transfers, setTransfers] = useState<StockTransferResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<ItemResponse[]>([])

  // Stats derived from loaded data
  const draftCount = transfers.filter((t) => t.status === 'DRAFT').length
  const pendingReconcileCount = transfers.filter((t) => t.status === 'CONFIRMED' && !t.ppReconciled).length
  const reconciledCount = transfers.filter((t) => t.ppReconciled).length

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

  // Reconcile dialog
  const [reconcileTarget, setReconcileTarget] = useState<StockTransferResponse | null>(null)
  const [ppPoRef, setPpPoRef] = useState('')
  const [reconciling, setReconciling] = useState(false)

  // Petpooja PO fetch
  const [ppPOs, setPpPOs] = useState<PetpoojaPOResponse[]>([])
  const [fetchingPOs, setFetchingPOs] = useState(false)
  const [ppFetchError, setPpFetchError] = useState('')

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

  // ---- Reconcile ----
  async function handleReconcile() {
    if (!reconcileTarget || !ppPoRef.trim()) {
      toast.error('Enter Petpooja PO reference')
      return
    }
    setReconciling(true)
    try {
      await api.stockTransfers.reconcile(reconcileTarget.id, ppPoRef.trim())
      toast.success(`Reconciled with ${ppPoRef.trim()}`)
      setReconcileTarget(null)
      setPpPoRef('')
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reconcile')
    } finally {
      setReconciling(false)
    }
  }

  async function fetchPPPOs() {
    setFetchingPOs(true)
    setPpFetchError('')
    setPpPOs([])
    try {
      const pos = await api.petpooja.purchaseOrders()
      setPpPOs(pos)
      if (pos.length === 0) setPpFetchError('No purchase orders found in Petpooja.')
    } catch (err: unknown) {
      setPpFetchError(err instanceof Error ? err.message : 'Failed to fetch Petpooja POs')
    } finally {
      setFetchingPOs(false)
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

  const pendingReconcile = filteredTransfers.filter((t) => t.status === 'CONFIRMED' && !t.ppReconciled)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <ArrowRightLeft className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Stock Transfer</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">Transfer Memos</h2>
          <p className="text-muted-foreground">
            Create and reconcile stock movement memos with Petpooja POs.
          </p>
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
            <div className="size-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
              <AlertTriangle className="size-5 text-rose-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Pending Reconciliation</p>
              <p className="text-2xl font-bold">{loading ? '—' : pendingReconcileCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <GitMerge className="size-5 text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Reconciled</p>
              <p className="text-2xl font-bold">{loading ? '—' : reconciledCount}</p>
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
          <TabsTrigger value="reconcile" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
            Pending Reconciliation
            {pendingReconcileCount > 0 && (
              <Badge className="bg-rose-500 text-white text-[10px] h-4 px-1.5 rounded-full">
                {pendingReconcileCount}
              </Badge>
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
                        <TableCell>
                          {t.ppPoReference ? (
                            <span className="font-mono text-[11px] text-primary">{t.ppPoReference}</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={t.status} reconciled={t.ppReconciled} />
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
                                className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-purple-500/20 text-purple-700 hover:bg-purple-500/10 gap-1.5"
                                onClick={() => {
                                  setReconcileTarget(t)
                                  setPpPoRef(t.ppPoReference || '')
                                }}
                              >
                                <ScanBarcode className="size-3" />
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
        <TabsContent value="reconcile" className="mt-0">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Memo #</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Transfer</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Items Transferred</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Confirmed On</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5} className="h-12 animate-pulse bg-muted/5" />
                      </TableRow>
                    ))
                  ) : pendingReconcile.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <GitMerge className="size-8 opacity-20" />
                          <p className="text-sm">No pending reconciliations.</p>
                          <p className="text-xs text-muted-foreground/60">
                            Confirm a transfer memo to begin reconciliation with Petpooja.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingReconcile.map((t) => (
                      <TableRow key={t.id} className="border-border/20 hover:bg-primary/5 transition-colors">
                        <TableCell className="font-mono text-xs font-bold">{t.memoNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span>{t.fromLocation}</span>
                            <ArrowRightLeft className="size-3 text-muted-foreground" />
                            <span>{t.toLocation}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            {t.items.map((item) => (
                              <div key={item.id} className="flex items-center gap-2 text-[11px]">
                                <span className="font-medium">{item.itemName}</span>
                                {item.variantName && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-muted/30">
                                    {item.variantName}
                                  </Badge>
                                )}
                                <span className="text-muted-foreground tabular-nums">
                                  {item.qty} {item.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {format(new Date(t.updatedAt), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                            onClick={() => {
                              setReconcileTarget(t)
                              setPpPoRef(t.ppPoReference || '')
                            }}
                          >
                            <ScanBarcode className="size-3" />
                            Enter PP PO Ref
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
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {i.photoUrl ? (
                                  <img src={i.photoUrl} alt="" loading="lazy" className="size-5 rounded object-cover" />
                                ) : (
                                  <span className="size-5 rounded bg-muted/40 inline-block" />
                                )}
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

      {/* Reconcile Dialog */}
      <Dialog open={!!reconcileTarget} onOpenChange={(o) => { if (!o) { setReconcileTarget(null); setPpPoRef(''); setPpPOs([]); setPpFetchError('') } }}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanBarcode className="size-5 text-purple-600" /> Reconcile with Petpooja PO
            </DialogTitle>
            <DialogDescription>
              Enter the Petpooja PO reference for memo <strong>{reconcileTarget?.memoNumber}</strong>.
              This links your internal transfer record to Petpooja&apos;s inward entry.
            </DialogDescription>
          </DialogHeader>

          {reconcileTarget && (
            <div className="space-y-4 py-2">
              {/* Summary of memo items */}
              <div className="p-3 rounded-xl bg-muted/15 border border-border/30 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Transferred Items</p>
                {reconcileTarget.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-xs">
                    <span className="font-medium">
                      {item.itemName}
                      {item.variantName ? ` (${item.variantName})` : ''}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {item.qty} {item.unit}
                    </span>
                  </div>
                ))}
                <Separator className="opacity-20" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{reconcileTarget.fromLocation} → {reconcileTarget.toLocation}</span>
                  <span>{format(new Date(reconcileTarget.createdAt), 'dd MMM yyyy')}</span>
                </div>
              </div>

              {/* Fetch from Petpooja */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                    Fetch from Petpooja
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] gap-1.5 rounded-lg"
                    onClick={fetchPPPOs}
                    disabled={fetchingPOs}
                  >
                    {fetchingPOs ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    {fetchingPOs ? 'Fetching…' : 'Fetch POs'}
                  </Button>
                </div>
                {ppFetchError && (
                  <p className="text-[10px] text-destructive">{ppFetchError}</p>
                )}
                {ppPOs.length > 0 && (
                  <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/20">
                    {ppPOs.map((po) => (
                      <button
                        key={po.poId}
                        type="button"
                        onClick={() => setPpPoRef(po.poNo)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-primary/5 transition-colors flex items-center justify-between gap-2 ${ppPoRef === po.poNo ? 'bg-primary/10 font-semibold' : ''}`}
                      >
                        <div>
                          <span className="font-mono font-bold">{po.poNo}</span>
                          <span className="text-muted-foreground ml-2">{po.vendorName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground tabular-nums">₹{po.totalAmount.toLocaleString()}</span>
                          <ExternalLink className="size-3 text-muted-foreground/40" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                  Petpooja PO Reference *
                </Label>
                <Input
                  placeholder="e.g. PP-2024-001 or scan barcode"
                  value={ppPoRef}
                  onChange={(e) => setPpPoRef(e.target.value)}
                  className="bg-background border-border h-11 font-mono"
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground">
                  Pick from Petpooja above, scan the barcode, or enter manually.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              variant="ghost"
              onClick={() => { setReconcileTarget(null); setPpPoRef('') }}
              disabled={reconciling}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl px-8 bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 gap-2"
              onClick={handleReconcile}
              disabled={reconciling || !ppPoRef.trim()}
            >
              {reconciling ? <Loader2 className="size-4 animate-spin" /> : <GitMerge className="size-4" />}
              Mark Reconciled
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
