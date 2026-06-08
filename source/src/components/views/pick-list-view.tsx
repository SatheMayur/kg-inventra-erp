'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardCheck,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  PlayCircle,
  Loader2,
  FileText,
  X,
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
import { api, ItemResponse } from '@/lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ---- Types ----

interface PickListItemResponse {
  id: string
  pickListId: string
  itemId: string
  itemName: string
  qty: number
  pickedQty: number
  unit: string
  status: string
}

interface PickListResponse {
  id: string
  name: string
  status: string
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  items: PickListItemResponse[]
}

// ---- Status badge ----

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge variant="outline" className="border-sky-500/20 text-sky-700 bg-sky-500/10 gap-1 text-[10px]">
          <PlayCircle className="size-2.5" /> Active
        </Badge>
      )
    case 'COMPLETED':
      return (
        <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-500/10 gap-1 text-[10px]">
          <CheckCircle2 className="size-2.5" /> Completed
        </Badge>
      )
    case 'DRAFT':
    default:
      return (
        <Badge variant="outline" className="border-amber-500/20 text-amber-700 bg-amber-500/10 gap-1 text-[10px]">
          <Clock className="size-2.5" /> Draft
        </Badge>
      )
  }
}

function ItemStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'PICKED':
      return (
        <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-500/10 text-[10px]">
          Picked
        </Badge>
      )
    case 'PARTIAL':
      return (
        <Badge variant="outline" className="border-sky-500/20 text-sky-700 bg-sky-500/10 text-[10px]">
          Partial
        </Badge>
      )
    case 'PENDING':
    default:
      return (
        <Badge variant="outline" className="border-amber-500/20 text-amber-700 bg-amber-500/10 text-[10px]">
          Pending
        </Badge>
      )
  }
}

// ---- Helpers ----

async function fetchPickLists(params?: { status?: string }): Promise<PickListResponse[]> {
  const qs = params?.status ? `?status=${params.status}` : ''
  const res = await fetch(`/api/pick-lists${qs}`, { credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to load pick lists')
  }
  const data = await res.json()
  return data.pickLists
}

async function createPickList(body: {
  name: string
  notes?: string
  items: Array<{ itemId: string; itemName: string; qty: number; unit: string }>
}): Promise<PickListResponse> {
  const res = await fetch('/api/pick-lists', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create pick list')
  }
  return (await res.json()).pickList
}

async function patchPickList(id: string, body: Record<string, unknown>): Promise<PickListResponse> {
  const res = await fetch(`/api/pick-lists/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update pick list')
  }
  return (await res.json()).pickList
}

// ---- Component ----

const emptyRow = { itemId: '', itemName: '', qty: '', unit: 'pcs' }

export default function PickListView() {
  const [pickLists, setPickLists] = useState<PickListResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<ItemResponse[]>([])

  // Stats
  const draftCount = pickLists.filter((p) => p.status === 'DRAFT').length
  const activeCount = pickLists.filter((p) => p.status === 'ACTIVE').length
  const completedCount = pickLists.filter((p) => p.status === 'COMPLETED').length

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', notes: '', items: [{ ...emptyRow }] })
  const [saving, setSaving] = useState(false)

  // Detail dialog
  const [detailTarget, setDetailTarget] = useState<PickListResponse | null>(null)
  const [pickedQtys, setPickedQtys] = useState<Record<string, string>>({})
  const [completing, setCompleting] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [lists, itemData] = await Promise.all([
        fetchPickLists(),
        api.items.list({ pageSize: 1000 }).then((r) => r.items),
      ])
      setPickLists(lists)
      setItems(itemData)
    } catch {
      toast.error('Failed to load pick list data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Create ----
  function addRow() {
    setCreateForm((f) => ({ ...f, items: [...f.items, { ...emptyRow }] }))
  }

  function removeRow(idx: number) {
    setCreateForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  function setRow(idx: number, patch: Partial<typeof emptyRow>) {
    setCreateForm((f) => {
      const next = [...f.items]
      next[idx] = { ...next[idx], ...patch }
      return { ...f, items: next }
    })
  }

  async function handleCreate() {
    if (!createForm.name.trim()) {
      toast.error('Pick list name is required')
      return
    }
    const validItems = createForm.items.filter((i) => i.itemId && parseFloat(i.qty) > 0)
    if (validItems.length === 0) {
      toast.error('Add at least one item with a valid quantity')
      return
    }
    setSaving(true)
    try {
      await createPickList({
        name: createForm.name.trim(),
        notes: createForm.notes || undefined,
        items: validItems.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          qty: parseFloat(i.qty),
          unit: i.unit,
        })),
      })
      toast.success('Pick list created')
      setShowCreate(false)
      setCreateForm({ name: '', notes: '', items: [{ ...emptyRow }] })
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create pick list')
    } finally {
      setSaving(false)
    }
  }

  // ---- Activate ----
  async function handleActivate(id: string) {
    setActivating(id)
    try {
      await patchPickList(id, { status: 'ACTIVE' })
      toast.success('Pick list activated')
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to activate')
    } finally {
      setActivating(null)
    }
  }

  // ---- Open detail ----
  function openDetail(pl: PickListResponse) {
    setDetailTarget(pl)
    const initial: Record<string, string> = {}
    for (const it of pl.items) {
      initial[it.id] = String(it.pickedQty)
    }
    setPickedQtys(initial)
  }

  // ---- Save picked qtys + complete ----
  async function handleSavePickedQtys() {
    if (!detailTarget) return
    const updates = detailTarget.items.map((it) => {
      const picked = parseFloat(pickedQtys[it.id] ?? String(it.pickedQty)) || 0
      let status = 'PENDING'
      if (picked >= it.qty) status = 'PICKED'
      else if (picked > 0) status = 'PARTIAL'
      return { id: it.id, pickedQty: picked, status }
    })
    try {
      const updated = await patchPickList(detailTarget.id, { items: updates })
      setDetailTarget(updated)
      toast.success('Picked quantities saved')
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function handleComplete() {
    if (!detailTarget) return
    setCompleting(true)
    try {
      // Save latest picked qtys first, then mark COMPLETED
      const updates = detailTarget.items.map((it) => {
        const picked = parseFloat(pickedQtys[it.id] ?? String(it.pickedQty)) || 0
        let status = 'PENDING'
        if (picked >= it.qty) status = 'PICKED'
        else if (picked > 0) status = 'PARTIAL'
        return { id: it.id, pickedQty: picked, status }
      })
      const updated = await patchPickList(detailTarget.id, { items: updates, status: 'COMPLETED' })
      setDetailTarget(updated)
      toast.success('Pick list marked complete')
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete')
    } finally {
      setCompleting(false)
    }
  }

  const filtered = pickLists.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.notes || '').toLowerCase().includes(search.toLowerCase())
  )

  const activeFiltered = filtered.filter((p) => p.status === 'ACTIVE')

  // ---- Table row ----
  function PickListRow({ pl }: { pl: PickListResponse }) {
    return (
      <TableRow className="group border-border/20 hover:bg-primary/5 transition-colors">
        <TableCell className="font-medium text-sm">{pl.name}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold">{pl.items.length}</span>
            <span className="text-[10px] text-muted-foreground">items</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {pl.items.slice(0, 2).map((i) => i.itemName).join(', ')}
            {pl.items.length > 2 ? ` +${pl.items.length - 2}` : ''}
          </p>
        </TableCell>
        <TableCell>
          <StatusBadge status={pl.status} />
        </TableCell>
        <TableCell className="text-[10px] text-muted-foreground">
          {format(new Date(pl.createdAt), 'dd MMM yyyy')}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg gap-1"
              onClick={() => openDetail(pl)}
            >
              <FileText className="size-3" /> View
            </Button>
            {pl.status === 'DRAFT' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-sky-500/20 text-sky-700 hover:bg-sky-500/10 gap-1"
                onClick={() => handleActivate(pl.id)}
                disabled={activating === pl.id}
              >
                {activating === pl.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <PlayCircle className="size-3" />
                )}
                Activate
              </Button>
            )}
            {pl.status === 'ACTIVE' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-emerald-500/20 text-emerald-700 hover:bg-emerald-500/10 gap-1"
                onClick={() => openDetail(pl)}
              >
                <CheckCircle2 className="size-3" /> Complete
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <ClipboardCheck className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Pick Lists</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">Pick Lists</h2>
          <p className="text-muted-foreground">
            Gather items for jobs and orders.
          </p>
        </div>
        <Button
          className="rounded-xl shadow-lg shadow-primary/20 gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="size-4" /> New Pick List
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Draft</p>
              <p className="text-2xl font-bold">{loading ? '—' : draftCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <PlayCircle className="size-5 text-sky-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Active</p>
              <p className="text-2xl font-bold">{loading ? '—' : activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="size-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Completed</p>
              <p className="text-2xl font-bold">{loading ? '—' : completedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" />
        <Input
          placeholder="Search pick lists…"
          className="pl-9 h-9 bg-background border-border"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="bg-muted/20 p-1 border border-border rounded-xl">
          <TabsTrigger value="all" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            All Lists
          </TabsTrigger>
          <TabsTrigger value="active" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
            Active
            {activeCount > 0 && (
              <Badge className="bg-sky-500 text-white text-[10px] h-4 px-1.5 rounded-full">
                {activeCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* All Lists */}
        <TabsContent value="all" className="mt-0">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Name</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Item Count</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Created</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5} className="h-14 animate-pulse bg-muted/10" />
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-56 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <ClipboardCheck className="size-10 opacity-20" />
                          <p className="text-sm">No pick lists found.</p>
                          <Button variant="link" onClick={() => setShowCreate(true)}>
                            Create your first pick list
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((pl) => <PickListRow key={pl.id} pl={pl} />)
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Active tab */}
        <TabsContent value="active" className="mt-0">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Name</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Item Count</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Created</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5} className="h-12 animate-pulse bg-muted/5" />
                      </TableRow>
                    ))
                  ) : activeFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <PlayCircle className="size-8 opacity-20" />
                          <p className="text-sm">No active pick lists.</p>
                          <p className="text-xs text-muted-foreground/60">
                            Activate a draft pick list to start picking.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeFiltered.map((pl) => <PickListRow key={pl.id} pl={pl} />)
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" /> New Pick List
            </DialogTitle>
            <DialogDescription>
              Name this pick list and add the items you need to gather.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Pick List Name *
              </Label>
              <Input
                placeholder="e.g. Morning kitchen prep"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-background border-border rounded-xl"
                autoFocus
              />
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Items *</Label>
                <Button variant="outline" size="sm" className="h-7 text-[10px] rounded-lg gap-1" onClick={addRow}>
                  <Plus className="size-3" /> Add Row
                </Button>
              </div>
              <div className="space-y-2">
                {createForm.items.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                    <div className="flex-1">
                      <Select
                        value={row.itemId}
                        onValueChange={(v) => {
                          const found = items.find((i) => i.id === v)
                          setRow(idx, {
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
                              {i.name} ({i.stock} {i.unit})
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
                        onChange={(e) => setRow(idx, { qty: e.target.value })}
                        className="bg-background border-border h-9 text-xs"
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        placeholder="Unit"
                        value={row.unit}
                        onChange={(e) => setRow(idx, { unit: e.target.value })}
                        className="bg-background border-border h-9 text-xs"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeRow(idx)}
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
                placeholder="Instructions, remarks…"
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
              disabled={saving || !createForm.name.trim()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
              Create Pick List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailTarget} onOpenChange={(o) => { if (!o) setDetailTarget(null) }}>
        <DialogContent className="sm:max-w-2xl border-border max-h-[90vh] overflow-y-auto">
          {detailTarget && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardCheck className="size-5 text-primary" />
                  {detailTarget.name}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  <StatusBadge status={detailTarget.status} />
                  {detailTarget.notes && (
                    <span className="text-muted-foreground text-xs">{detailTarget.notes}</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                <div className="rounded-xl border border-border/30 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/20">
                      <TableRow className="hover:bg-transparent border-border/50">
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider">Item</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider text-right">Required</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider text-right">Picked</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailTarget.items.map((it) => (
                        <TableRow key={it.id} className="border-border/20">
                          <TableCell className="font-medium text-sm">{it.itemName}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {it.qty} <span className="text-muted-foreground text-[10px]">{it.unit}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {detailTarget.status === 'COMPLETED' ? (
                              <span className="text-sm tabular-nums font-medium">
                                {it.pickedQty} <span className="text-muted-foreground text-[10px]">{it.unit}</span>
                              </span>
                            ) : (
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                value={pickedQtys[it.id] ?? String(it.pickedQty)}
                                onChange={(e) =>
                                  setPickedQtys((prev) => ({ ...prev, [it.id]: e.target.value }))
                                }
                                className="bg-background border-border h-8 text-xs w-24 ml-auto tabular-nums"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <ItemStatusBadge status={it.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <DialogFooter className="pt-4 border-t border-border/10 gap-2">
                <Button variant="ghost" onClick={() => setDetailTarget(null)}>
                  Close
                </Button>
                {detailTarget.status !== 'COMPLETED' && (
                  <>
                    <Button
                      variant="outline"
                      className="rounded-xl gap-2"
                      onClick={handleSavePickedQtys}
                    >
                      Save Progress
                    </Button>
                    <Button
                      className="rounded-xl px-8 shadow-lg shadow-emerald-500/20 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleComplete}
                      disabled={completing}
                    >
                      {completing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Mark Complete
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
