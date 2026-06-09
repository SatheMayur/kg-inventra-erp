'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PackageCheck,
  Plus,
  Loader2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
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

interface CheckoutUser {
  name: string
  empId: string
}

interface CheckoutItem {
  name: string
  unit: string
}

interface CheckoutRecord {
  id: string
  itemId: string
  userId: string
  qty: number
  purpose: string | null
  checkedOutAt: string
  expectedReturnAt: string | null
  returnedAt: string | null
  status: 'ACTIVE' | 'OVERDUE' | 'RETURNED'
  notes: string | null
  item: CheckoutItem
  user: CheckoutUser
}

// ---- Status Badge ----

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge variant="outline" className="border-sky-500/20 text-sky-700 bg-sky-500/10 gap-1 text-[10px]">
          <Clock className="size-2.5" /> Active
        </Badge>
      )
    case 'OVERDUE':
      return (
        <Badge variant="outline" className="border-rose-500/20 text-rose-700 bg-rose-500/10 gap-1 text-[10px]">
          <AlertTriangle className="size-2.5" /> Overdue
        </Badge>
      )
    case 'RETURNED':
      return (
        <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-500/10 gap-1 text-[10px]">
          <CheckCircle2 className="size-2.5" /> Returned
        </Badge>
      )
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>
  }
}

// ---- Helpers ----

async function fetchCheckouts(status?: string): Promise<CheckoutRecord[]> {
  const params = status ? `?status=${status}` : ''
  const res = await fetch(`/api/checkouts${params}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load checkouts')
  const data = await res.json()
  return data.checkouts
}

async function returnCheckout(id: string): Promise<void> {
  const token = (typeof window !== 'undefined' && localStorage.getItem('token')) || ''
  const res = await fetch(`/api/checkouts/${id}/return`, {
    method: 'PATCH',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to return item')
  }
}

// ---- Main View ----

export default function CheckoutView() {
  const [checkouts, setCheckouts] = useState<CheckoutRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ItemResponse[]>([])

  // Stats
  const activeCount = checkouts.filter((c) => c.status === 'ACTIVE').length
  const overdueCount = checkouts.filter((c) => c.status === 'OVERDUE').length
  const today = new Date().toDateString()
  const returnedTodayCount = checkouts.filter(
    (c) => c.status === 'RETURNED' && c.returnedAt && new Date(c.returnedAt).toDateString() === today
  ).length

  // New checkout dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    itemId: '',
    qty: '',
    purpose: '',
    expectedReturnAt: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Return confirm
  const [returningId, setReturningId] = useState<string | null>(null)
  const [confirmReturn, setConfirmReturn] = useState<CheckoutRecord | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [all, itemData] = await Promise.all([
        fetchCheckouts(),
        api.items.list({ pageSize: 1000 }).then((r) => r.items),
      ])
      setCheckouts(all)
      setItems(itemData)
    } catch {
      toast.error('Failed to load checkout data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ---- Create checkout ----
  async function handleCreate() {
    if (!createForm.itemId) {
      toast.error('Select an item')
      return
    }
    const qty = parseFloat(createForm.qty)
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        itemId: createForm.itemId,
        qty,
      }
      if (createForm.purpose.trim()) body.purpose = createForm.purpose.trim()
      if (createForm.expectedReturnAt) body.expectedReturnAt = new Date(createForm.expectedReturnAt).toISOString()
      if (createForm.notes.trim()) body.notes = createForm.notes.trim()

      const res = await fetch('/api/checkouts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create checkout')
      }
      toast.success('Checkout recorded')
      setShowCreate(false)
      setCreateForm({ itemId: '', qty: '', purpose: '', expectedReturnAt: '', notes: '' })
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create checkout')
    } finally {
      setSaving(false)
    }
  }

  // ---- Return ----
  async function handleReturn() {
    if (!confirmReturn) return
    setReturningId(confirmReturn.id)
    try {
      await returnCheckout(confirmReturn.id)
      toast.success(`${confirmReturn.item.name} marked as returned`)
      setConfirmReturn(null)
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to return item')
    } finally {
      setReturningId(null)
    }
  }

  const activeRows = checkouts.filter((c) => c.status === 'ACTIVE' || c.status === 'OVERDUE')
  const allRows = checkouts

  function renderTable(rows: CheckoutRecord[], showEmpty: string) {
    return (
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Item</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Checked Out By</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Qty</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Purpose</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Checked Out At</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Expected Return</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8} className="h-14 animate-pulse bg-muted/10" />
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-56 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <FileText className="size-10 opacity-20" />
                      <p className="text-sm">{showEmpty}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((c) => (
                  <TableRow key={c.id} className="group border-border/20 hover:bg-primary/5 transition-colors">
                    <TableCell>
                      <p className="text-xs font-semibold">{c.item.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.item.unit}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{c.user.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{c.user.empId}</p>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums font-semibold">
                      {c.qty}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                      {c.purpose || <span className="italic opacity-40">—</span>}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(new Date(c.checkedOutAt), 'dd MMM yyyy, HH:mm')}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {c.expectedReturnAt
                        ? format(new Date(c.expectedReturnAt), 'dd MMM yyyy')
                        : <span className="italic opacity-40">—</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {(c.status === 'ACTIVE' || c.status === 'OVERDUE') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-emerald-500/20 text-emerald-700 hover:bg-emerald-500/10 gap-1.5"
                          onClick={() => setConfirmReturn(c)}
                          disabled={returningId === c.id}
                        >
                          {returningId === c.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3" />
                          )}
                          Return
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <PackageCheck className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Check-in / Check-out</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">Item Custody</h2>
          <p className="text-muted-foreground">Track item custody — who has what, and when it&apos;s due back.</p>
        </div>
        <Button
          className="rounded-xl shadow-lg shadow-primary/20 gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="size-4" /> New Checkout
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <Clock className="size-5 text-sky-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Active Checkouts</p>
              <p className="text-2xl font-bold">{loading ? '—' : activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
              <AlertTriangle className="size-5 text-rose-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Overdue</p>
              <p className="text-2xl font-bold">{loading ? '—' : overdueCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="size-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Returned Today</p>
              <p className="text-2xl font-bold">{loading ? '—' : returnedTodayCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="space-y-6">
        <TabsList className="bg-muted/20 p-1 border border-border rounded-xl">
          <TabsTrigger value="active" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
            Active
            {!loading && activeCount > 0 && (
              <Badge className="bg-sky-500 text-white text-[10px] h-4 px-1.5 rounded-full">
                {activeCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            All History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-0">
          {renderTable(activeRows, 'No active checkouts. All items are in.')}
        </TabsContent>

        <TabsContent value="all" className="mt-0">
          {renderTable(allRows, 'No checkout records found.')}
        </TabsContent>
      </Tabs>

      {/* New Checkout Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="size-5 text-primary" /> New Checkout
            </DialogTitle>
            <DialogDescription>
              Record that you are taking an item out of inventory.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Item *</Label>
              <Select
                value={createForm.itemId}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, itemId: v }))}
              >
                <SelectTrigger className="bg-background border-border rounded-xl h-10">
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

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Qty *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={createForm.qty}
                onChange={(e) => setCreateForm((f) => ({ ...f, qty: e.target.value }))}
                className="bg-background border-border rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Purpose</Label>
              <Input
                placeholder="e.g. Kitchen use, Event, Maintenance…"
                value={createForm.purpose}
                onChange={(e) => setCreateForm((f) => ({ ...f, purpose: e.target.value }))}
                className="bg-background border-border rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Expected Return (optional)</Label>
              <Input
                type="date"
                value={createForm.expectedReturnAt}
                onChange={(e) => setCreateForm((f) => ({ ...f, expectedReturnAt: e.target.value }))}
                className="bg-background border-border rounded-xl"
              />
            </div>

            <Separator className="opacity-30" />

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Notes (optional)</Label>
              <Input
                placeholder="Any additional remarks…"
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
              disabled={saving || !createForm.itemId || !createForm.qty}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
              Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Confirm Dialog */}
      <Dialog open={!!confirmReturn} onOpenChange={(o) => { if (!o) setConfirmReturn(null) }}>
        <DialogContent className="sm:max-w-sm border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-emerald-600" /> Confirm Return
            </DialogTitle>
            <DialogDescription>
              Mark <strong>{confirmReturn?.item.name}</strong> as returned?
              {confirmReturn && (
                <span className="block mt-1 text-xs text-muted-foreground">
                  Checked out by <strong>{confirmReturn.user.name}</strong> · {confirmReturn.qty} {confirmReturn.item.unit}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setConfirmReturn(null)} disabled={!!returningId}>
              Cancel
            </Button>
            <Button
              className="rounded-xl px-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 gap-2"
              onClick={handleReturn}
              disabled={!!returningId}
            >
              {returningId ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Mark Returned
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
