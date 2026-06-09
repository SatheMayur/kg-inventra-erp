'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  FileText,
  Mail,
  Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ---- Types ----

interface LowStockAlert {
  type: 'LOW_STOCK'
  itemId: string
  itemName: string
  stock: number
  minStock: number
  severity: 'critical' | 'warning'
}

interface MaintenanceAlert {
  type: 'MAINTENANCE_DUE'
  scheduleId: string
  title: string
  itemName: string
  dueDate: string
  status: string
}

type Alert = LowStockAlert | MaintenanceAlert

interface AlertCounts {
  lowStock: number
  maintenance: number
  total: number
}

interface MaintenanceSchedule {
  id: string
  itemId: string
  title: string
  dueDate: string
  recurringDays: number | null
  lastCompleted: string | null
  status: 'PENDING' | 'OVERDUE' | 'COMPLETED'
  notes: string | null
  createdAt: string
  item: { name: string }
}

// ---- Helpers ----

function token() {
  return (typeof window !== 'undefined' && localStorage.getItem('token')) || ''
}

function authHeaders(): Record<string, string> {
  const t = token()
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...options, headers: { ...authHeaders(), ...(options?.headers ?? {}) } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ---- Status Badge ----

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'PENDING':
      return (
        <Badge variant="outline" className="border-amber-500/20 text-amber-700 bg-amber-500/10 text-[10px]">
          Pending
        </Badge>
      )
    case 'OVERDUE':
      return (
        <Badge variant="outline" className="border-rose-500/20 text-rose-700 bg-rose-500/10 text-[10px]">
          Overdue
        </Badge>
      )
    case 'COMPLETED':
      return (
        <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-500/10 text-[10px]">
          <CheckCircle2 className="size-2.5 mr-1" />Completed
        </Badge>
      )
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>
  }
}

// ---- Main View ----

export default function AlertsView() {
  const user = useAppStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [counts, setCounts] = useState<AlertCounts>({ lowStock: 0, maintenance: 0, total: 0 })
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [schedulesLoading, setSchedulesLoading] = useState(true)

  // Send notifications state
  const [showSend, setShowSend] = useState(false)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)

  // Add schedule dialog
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ itemId: '', title: '', dueDate: '', recurringDays: '', notes: '' })
  const [addSaving, setAddSaving] = useState(false)

  // Completing a schedule
  const [completingId, setCompletingId] = useState<string | null>(null)

  // Deleting a schedule
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ alerts: Alert[]; counts: AlertCounts }>('/api/alerts')
      setAlerts(data.alerts)
      setCounts(data.counts)
    } catch {
      toast.error('Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true)
    try {
      const data = await apiFetch<{ schedules: MaintenanceSchedule[] }>('/api/maintenance-schedules')
      setSchedules(data.schedules)
    } catch {
      toast.error('Failed to load maintenance schedules')
    } finally {
      setSchedulesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAlerts()
    loadSchedules()
    api.items.list({ pageSize: 1000 }).then((r) => setItems(r.items)).catch(() => {})
  }, [loadAlerts, loadSchedules])

  // ---- Send Notifications ----
  async function handleSend() {
    setSending(true)
    try {
      const body: { email?: string } = {}
      if (sendEmail.trim()) body.email = sendEmail.trim()
      const data = await apiFetch<{ notified: number; emailed: boolean }>('/api/alerts/send', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      toast.success(`${data.notified} notification${data.notified !== 1 ? 's' : ''} created${data.emailed ? ' · email sent' : ''}`)
      setShowSend(false)
      setSendEmail('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send notifications')
    } finally {
      setSending(false)
    }
  }

  // ---- Add Schedule ----
  async function handleAddSchedule() {
    if (!addForm.itemId || !addForm.title.trim() || !addForm.dueDate) {
      toast.error('Item, title, and due date are required')
      return
    }
    setAddSaving(true)
    try {
      const body: Record<string, unknown> = {
        itemId: addForm.itemId,
        title: addForm.title.trim(),
        dueDate: new Date(addForm.dueDate).toISOString(),
      }
      if (addForm.recurringDays) body.recurringDays = Number(addForm.recurringDays)
      if (addForm.notes.trim()) body.notes = addForm.notes.trim()

      await apiFetch('/api/maintenance-schedules', { method: 'POST', body: JSON.stringify(body) })
      toast.success('Schedule created')
      setShowAdd(false)
      setAddForm({ itemId: '', title: '', dueDate: '', recurringDays: '', notes: '' })
      loadSchedules()
      loadAlerts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create schedule')
    } finally {
      setAddSaving(false)
    }
  }

  // ---- Complete Schedule ----
  async function handleComplete(id: string, title: string) {
    setCompletingId(id)
    try {
      await apiFetch(`/api/maintenance-schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'complete' }),
      })
      toast.success(`"${title}" marked complete`)
      loadSchedules()
      loadAlerts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete schedule')
    } finally {
      setCompletingId(null)
    }
  }

  // ---- Delete Schedule ----
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await apiFetch(`/api/maintenance-schedules/${id}`, { method: 'DELETE' })
      toast.success('Schedule deleted')
      loadSchedules()
      loadAlerts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete schedule')
    } finally {
      setDeletingId(null)
    }
  }

  const criticalCount = alerts.filter((a) => a.type === 'LOW_STOCK' && a.severity === 'critical').length
  const lowStockCount = alerts.filter((a) => a.type === 'LOW_STOCK' && a.severity === 'warning').length

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Bell className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Alerts &amp; Maintenance</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">Alerts</h2>
          <p className="text-muted-foreground">Monitor low stock and upcoming maintenance tasks.</p>
        </div>
        <Button
          variant="outline"
          className="rounded-xl gap-2"
          onClick={() => { loadAlerts(); loadSchedules() }}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
              <AlertTriangle className="size-5 text-rose-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Critical (Out of Stock)</p>
              <p className="text-2xl font-bold">{loading ? '—' : criticalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <AlertTriangle className="size-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Low Stock</p>
              <p className="text-2xl font-bold">{loading ? '—' : lowStockCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <Wrench className="size-5 text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Maintenance Due</p>
              <p className="text-2xl font-bold">{loading ? '—' : counts.maintenance}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="alerts" className="space-y-6">
        <TabsList className="bg-muted/20 p-1 border border-border rounded-xl">
          <TabsTrigger value="alerts" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
            All Alerts
            {!loading && counts.total > 0 && (
              <Badge className="bg-rose-500 text-white text-[10px] h-4 px-1.5 rounded-full">
                {counts.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2">
            Maintenance Schedules
            {!schedulesLoading && schedules.filter((s) => s.status !== 'COMPLETED').length > 0 && (
              <Badge className="bg-purple-500 text-white text-[10px] h-4 px-1.5 rounded-full">
                {schedules.filter((s) => s.status !== 'COMPLETED').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ---- All Alerts Tab ---- */}
        <TabsContent value="alerts" className="mt-0 space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button
                className="rounded-xl gap-2 shadow-lg shadow-primary/20"
                onClick={() => setShowSend(true)}
                disabled={counts.total === 0}
              >
                <Mail className="size-4" /> Send Notifications
              </Button>
            </div>
          )}

          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Type</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Item</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Details</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Severity / Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={4} className="h-14 animate-pulse bg-muted/10" />
                      </TableRow>
                    ))
                  ) : alerts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-56 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <FileText className="size-10 opacity-20" />
                          <p className="text-sm">No active alerts. Everything looks good.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    alerts.map((alert, i) => (
                      <TableRow key={i} className="group border-border/20 hover:bg-primary/5 transition-colors">
                        <TableCell>
                          {alert.type === 'LOW_STOCK' ? (
                            <Badge variant="outline" className="border-amber-500/20 text-amber-700 bg-amber-500/10 gap-1 text-[10px]">
                              <AlertTriangle className="size-2.5" /> Low Stock
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-purple-500/20 text-purple-700 bg-purple-500/10 gap-1 text-[10px]">
                              <Wrench className="size-2.5" /> Maintenance
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {alert.type === 'LOW_STOCK' ? alert.itemName : alert.itemName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {alert.type === 'LOW_STOCK' ? (
                            <span>
                              Stock: <span className="font-semibold text-foreground">{alert.stock}</span>
                              {' '}&mdash; Min: {alert.minStock}
                            </span>
                          ) : (
                            <span>
                              {alert.title} &mdash; Due: {format(new Date(alert.dueDate), 'dd MMM yyyy')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {alert.type === 'LOW_STOCK' ? (
                            alert.severity === 'critical' ? (
                              <Badge variant="outline" className="border-rose-500/20 text-rose-700 bg-rose-500/10 text-[10px]">
                                Critical
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-500/20 text-amber-700 bg-amber-500/10 text-[10px]">
                                Warning
                              </Badge>
                            )
                          ) : (
                            <StatusBadge status={alert.status} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ---- Maintenance Schedules Tab ---- */}
        <TabsContent value="maintenance" className="mt-0 space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button
                className="rounded-xl gap-2 shadow-lg shadow-primary/20"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="size-4" /> Add Schedule
              </Button>
            </div>
          )}

          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Item</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Title</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Due Date</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Recurring</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedulesLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6} className="h-14 animate-pulse bg-muted/10" />
                      </TableRow>
                    ))
                  ) : schedules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-56 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <Wrench className="size-10 opacity-20" />
                          <p className="text-sm">No maintenance schedules yet.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    schedules.map((s) => (
                      <TableRow key={s.id} className="group border-border/20 hover:bg-primary/5 transition-colors">
                        <TableCell className="text-xs font-semibold">{s.item.name}</TableCell>
                        <TableCell className="text-xs">{s.title}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(s.dueDate), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.recurringDays ? `Every ${s.recurringDays}d` : <span className="italic opacity-40">—</span>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isAdmin && s.status !== 'COMPLETED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-emerald-500/20 text-emerald-700 hover:bg-emerald-500/10 gap-1.5"
                                onClick={() => handleComplete(s.id, s.title)}
                                disabled={completingId === s.id}
                              >
                                {completingId === s.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="size-3" />
                                )}
                                Complete
                              </Button>
                            )}
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] font-bold uppercase tracking-wider rounded-lg border-rose-500/20 text-rose-700 hover:bg-rose-500/10 gap-1.5"
                                onClick={() => handleDelete(s.id)}
                                disabled={deletingId === s.id}
                              >
                                {deletingId === s.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Trash2 className="size-3" />
                                )}
                                Delete
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
      </Tabs>

      {/* Send Notifications Dialog */}
      <Dialog open={showSend} onOpenChange={setShowSend}>
        <DialogContent className="sm:max-w-sm border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="size-5 text-primary" /> Send Alert Notifications
            </DialogTitle>
            <DialogDescription>
              Creates in-app notifications for all current alerts. Optionally sends an email summary.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Email (optional)
              </Label>
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                className="bg-background border-border rounded-xl"
              />
              <p className="text-[10px] text-muted-foreground">Leave blank to create in-app notifications only.</p>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/10">
            <Button variant="ghost" onClick={() => setShowSend(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              className="rounded-xl px-8 shadow-lg shadow-primary/20 gap-2"
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Schedule Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="size-5 text-primary" /> Add Maintenance Schedule
            </DialogTitle>
            <DialogDescription>
              Schedule a maintenance task for an inventory item.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Item *</Label>
              <Select
                value={addForm.itemId}
                onValueChange={(v) => setAddForm((f) => ({ ...f, itemId: v }))}
              >
                <SelectTrigger className="bg-background border-border rounded-xl h-10">
                  <SelectValue placeholder="Select item…" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Title *</Label>
              <Input
                placeholder="e.g. Monthly inspection, Filter change…"
                value={addForm.title}
                onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                className="bg-background border-border rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Due Date *</Label>
              <Input
                type="date"
                value={addForm.dueDate}
                onChange={(e) => setAddForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="bg-background border-border rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Recurring (days, optional)
              </Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g. 30 for monthly"
                value={addForm.recurringDays}
                onChange={(e) => setAddForm((f) => ({ ...f, recurringDays: e.target.value }))}
                className="bg-background border-border rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Notes (optional)</Label>
              <Input
                placeholder="Any additional remarks…"
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                className="bg-background border-border rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/10">
            <Button variant="ghost" onClick={() => setShowAdd(false)} disabled={addSaving}>
              Cancel
            </Button>
            <Button
              className="rounded-xl px-8 shadow-lg shadow-primary/20 gap-2"
              onClick={handleAddSchedule}
              disabled={addSaving || !addForm.itemId || !addForm.title || !addForm.dueDate}
            >
              {addSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
