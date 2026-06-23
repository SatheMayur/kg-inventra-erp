'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  HandHeart,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Package,
  Search,
  CheckCircle2,
  Printer,
  ListChecks,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/lib/store'
import { api, type ItemResponse, type RequestResponse } from '@/lib/api'
import { toast } from 'sonner'

// ── Status helpers ──────────────────────────────────────────

type Status = RequestResponse['status']

function statusBadge(status: Status) {
  const map: Record<Status, string> = {
    Pending: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    Approved: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
    PartiallyIssued: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
    ReadyForPickup: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
    Issued: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    Rejected: 'bg-rose-500/10 text-rose-700 border-rose-500/20',
    Cancelled: 'bg-stone-500/10 text-stone-500 border-stone-500/20',
  }
  // Display-only label mapping; the stored status value is unchanged.
  const labels: Partial<Record<Status, string>> = {
    Issued: 'Completed',
    PartiallyIssued: 'Partially Issued',
  }
  return (
    <Badge variant="outline" className={`text-xs ${map[status]}`}>
      {labels[status] ?? status}
    </Badge>
  )
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase()
}

// ── Main component ──────────────────────────────────────────

export default function IssuanceView() {
  const user = useAppStore((s) => s.user)
  const setPendingCount = useAppStore((s) => s.setPendingCount)

  // Data
  const [requests, setRequests] = useState<RequestResponse[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [loading, setLoading] = useState(true)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Action loading states (request id)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [isBatchIssuing, setIsBatchIssuing] = useState(false)

  // Issue confirmation dialog
  const [issueReq, setIssueReq] = useState<RequestResponse | null>(null)
  const [issueLines, setIssueLines] = useState<Record<string, string>>({})

  // Initialize issue lines map when the request changes
  useEffect(() => {
    if (!issueReq) {
      setIssueLines({})
      return
    }
    const initial: Record<string, string> = {}
    if (issueReq.lines && issueReq.lines.length > 0) {
      issueReq.lines.forEach((l) => {
        if (l.status === 'Approved' || l.status === 'PartiallyIssued') {
          const remaining = l.approvedQty - l.issuedQty
          if (remaining > 0) {
            initial[l.id] = String(remaining)
          }
        }
      })
    } else {
      initial['legacy'] = String(issueReq.qty)
    }
    setIssueLines(initial)
  }, [issueReq])

   // Conflict dialog
  const [conflictInfo, setConflictInfo] = useState<{
    req: RequestResponse
    serverVersion: number
    expectedVersion: number
  } | null>(null)

  const handlePrint = (req: RequestResponse) => {
    window.print()
  }

  // ── Fetch data ──────────────────────────────────────────

  const fetchRequests = useCallback(async () => {
    try {
      // Fetch both Pending and Approved requests
      const [pending, approved, ready] = await Promise.all([
        api.requests.list({ status: 'Pending' }),
        api.requests.list({ status: 'Approved' }),
        api.requests.list({ status: 'ReadyForPickup' }),
      ])
      // Sort: Pending, then Approved, then ReadyForPickup; within each, newest first
      const byNewest = (a: RequestResponse, b: RequestResponse) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      const sorted = [
        ...[...pending].sort(byNewest),
        ...[...approved].sort(byNewest),
        ...[...ready].sort(byNewest),
      ]
      setRequests(sorted)
    } catch {
      toast.error('Failed to load requests')
    }
  }, [])

  const fetchItems = useCallback(async () => {
    try {
      // Fetch all items (large pageSize) so the issuance view has full stock data
      const data = await api.items.list({ pageSize: 1000 })
      setItems(data.items)
    } catch {
      toast.error('Failed to load items')
    }
  }, [])

  const refreshPendingBadge = useCallback(async () => {
    try {
      const data = await api.reporting.dashboard()
      setPendingCount(data.pendingCount + data.approvedCount)
    } catch {
      // silent
    }
  }, [setPendingCount])

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      await Promise.all([fetchRequests(), fetchItems()])
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [fetchRequests, fetchItems])

  // ── Helpers ─────────────────────────────────────────────

  function getLineItem(itemId: string): ItemResponse | undefined {
    return items.find((i) => i.id === itemId)
  }

  function getLineAvailable(itemId: string, requestedQty: number): number {
    const item = getLineItem(itemId)
    if (!item) return 0
    // Total stock - (Total reserved - Current request's reservation portion)
    return item.stock - (item.reservedQty - requestedQty)
  }

  function isRequestSufficient(req: RequestResponse): boolean {
    if (req.lines && req.lines.length > 0) {
      return req.lines.every((line) => {
        if (line.status === 'Rejected' || line.status === 'Cancelled') return true
        const remaining = line.approvedQty - line.issuedQty
        if (remaining <= 0) return true
        return getLineAvailable(line.itemId, remaining) >= remaining
      })
    }
    // Legacy fallback
    const item = items.find((i) => i.id === req.itemId)
    if (!item) return false
    return item.stock - (item.reservedQty - req.qty) >= req.qty
  }

  // ── Action handlers ─────────────────────────────────────

  async function handleApprove(id: string) {
    setActionLoading(id)
    try {
      await api.requests.approve(id)
      toast.success('Request approved')
      await fetchRequests()
      await fetchItems()
      await refreshPendingBadge()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReady(id: string) {
    setActionLoading(id)
    try {
      await api.requests.markReady(id)
      toast.success('Marked ready for pickup')
      await fetchRequests()
      await refreshPendingBadge()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark ready')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id)
    try {
      await api.requests.reject(id)
      toast.success('Request rejected')
      await fetchRequests()
      await fetchItems()
      await refreshPendingBadge()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleIssue() {
    if (!issueReq || !user) return

    const linesToIssue: Array<{ lineId: string; qty: number }> = []

    if (issueReq.lines && issueReq.lines.length > 0) {
      // Validate inputs
      for (const line of issueReq.lines) {
        const val = issueLines[line.id]
        if (val) {
          const qty = parseInt(val, 10)
          if (isNaN(qty) || qty < 0) {
            toast.error(`Invalid quantity for line: ${line.itemName}`)
            return
          }
          if (qty > 0) {
            const maxAllowed = line.approvedQty - line.issuedQty
            if (qty > maxAllowed) {
              toast.error(`Cannot issue more than approved remaining (${maxAllowed}) for ${line.itemName}`)
              return
            }
            const avail = getLineAvailable(line.itemId, maxAllowed)
            if (qty > avail) {
              toast.error(`Insufficient stock for ${line.itemName}. Max available: ${avail}`)
              return
            }
            linesToIssue.push({ lineId: line.id, qty })
          }
        }
      }

      if (linesToIssue.length === 0) {
        toast.error('Please enter a quantity greater than zero for at least one item')
        return
      }
    } else {
      // Legacy fallback
      const item = items.find((i) => i.id === issueReq.itemId)
      if (!item) {
        toast.error('Item not found')
        return
      }
      const avail = item.stock - (item.reservedQty - issueReq.qty)
      if (issueReq.qty > avail) {
        toast.error('Insufficient stock')
        return
      }
    }

    setActionLoading(issueReq.id)
    try {
      if (issueReq.lines && issueReq.lines.length > 0) {
        await api.requests.issue(issueReq.id, {
          issuedBy: user.name,
          lines: linesToIssue,
        })
      } else {
        await api.requests.issue(issueReq.id, {
          issuedBy: user.name,
        })
      }
      toast.success('Item issued successfully')
      setIssueReq(null)
      await fetchRequests()
      await fetchItems()
      await refreshPendingBadge()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to issue request')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleConflictRefresh() {
    if (!conflictInfo) return
    await fetchItems()
    setConflictInfo(null)
    setIssueReq(conflictInfo.req)
  }

  async function handleIssueAllApproved() {
    if (!user) return
    const approvedWithStock = requests.filter(
      (r) => r.status === 'Approved' && isRequestSufficient(r)
    )
    if (approvedWithStock.length === 0) {
      toast.info('No approved requests with sufficient stock')
      return
    }

    setIsBatchIssuing(true)
    let issued = 0
    let failed = 0

    for (const req of approvedWithStock) {
      try {
        await api.requests.issue(req.id, { issuedBy: user.name })
        issued++
        // Optimistically remove from local list
        setRequests((prev) => prev.filter((r) => r.id !== req.id))
      } catch {
        failed++
      }
    }

    await fetchRequests()
    await fetchItems()
    await refreshPendingBadge()
    setIsBatchIssuing(false)

    if (failed === 0) {
      toast.success(`Issued ${issued} request${issued !== 1 ? 's' : ''} successfully`)
    } else {
      toast.warning(`Issued ${issued}, failed ${failed}`)
    }
  }

  // ── Filtered data ────────────────────────────────────────

  const filtered = requests.filter((r) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      r.id.toLowerCase().includes(q) ||
      r.employee.toLowerCase().includes(q) ||
      r.itemName.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q)
    )
  })

  // ── Issue dialog data ────────────────────────────────────

  const issueItem = issueReq ? getLineItem(issueReq.itemId) : null
  const issueAvailable = issueItem ? issueItem.stock - (issueItem.reservedQty - issueReq!.qty) : 0
  const stockAfterIssue = (issueItem?.stock ?? 0) - (issueReq?.qty ?? 0)

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HandHeart className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">Pending Approval / Issuance</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
            {requests.length} pending
          </Badge>
          {requests.some((r) => r.status === 'Approved' && getLineAvailable(r.itemId, r.qty) >= r.qty) && (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-500/100 text-white"
              disabled={isBatchIssuing || !!actionLoading}
              onClick={handleIssueAllApproved}
            >
              {isBatchIssuing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ListChecks className="size-3.5" />
              )}
              Issue All Approved
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={async () => { await fetchRequests(); await fetchItems(); await refreshPendingBadge(); }} disabled={loading} className="gap-1.5">
            <HandHeart className="size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search by employee, item, department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 pr-3 text-sm bg-background border-border"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-border/30">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="size-10 rounded-lg" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-md" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CheckCircle2 className="size-12 mb-3 text-emerald-500/50" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs mt-1">No pending approvals or issuances</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/30">
                  <TableHead className="text-muted-foreground text-xs">ID</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Employee</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Department</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Item</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Qty</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Available</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Date</TableHead>
                  <TableHead className="text-muted-foreground text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((req) => {
                  const sufficient = isRequestSufficient(req)
                  const available = req.lines && req.lines.length > 1
                    ? '—'
                    : getLineAvailable(req.itemId, req.qty)
                  const isLoading = actionLoading === req.id

                  return (
                    <TableRow
                      key={req.id}
                      className="hover:bg-primary/5 transition-colors"
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {shortId(req.id)}
                      </TableCell>
                      <TableCell className="text-sm">{req.employee}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{req.department}</TableCell>
                      <TableCell className="text-sm">{req.itemName}</TableCell>
                      <TableCell className="text-sm font-medium">{req.qty}</TableCell>
                      <TableCell>
                        <span
                          className={`text-sm font-medium ${
                            sufficient ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {req.lines && req.lines.length > 1 ? (
                            sufficient ? 'Stock Available' : 'Shortage'
                          ) : (
                            `${available}`
                          )}
                          {!sufficient && (
                            <AlertTriangle className="inline size-3 ml-1 -mt-0.5" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{statusBadge(req.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(req.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {req.status === 'Pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 gap-1 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-500/10"
                                disabled={!!actionLoading}
                                onClick={() => handleApprove(req.id)}
                              >
                                {isLoading ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Check className="size-3.5" />
                                )}
                                <span className="hidden sm:inline">Approve</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 gap-1 text-rose-700 hover:text-rose-800 hover:bg-rose-500/10"
                                disabled={!!actionLoading}
                                onClick={() => handleReject(req.id)}
                              >
                                {isLoading ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <X className="size-3.5" />
                                )}
                                <span className="hidden sm:inline">Reject</span>
                              </Button>
                            </>
                          )}
                          {(req.status === 'Approved' || req.status === 'ReadyForPickup') && (
                            <>
                              {req.status === 'Approved' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 gap-1"
                                  disabled={!!actionLoading}
                                  onClick={() => handleReady(req.id)}
                                >
                                  <span className="hidden sm:inline">Mark ready</span>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="h-7 px-2.5 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                                disabled={!!actionLoading || !sufficient}
                                onClick={() => setIssueReq(req)}
                              >
                                {isLoading ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <HandHeart className="size-3.5" />
                                )}
                                <span className="hidden sm:inline">Issue</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 gap-1 text-rose-700 hover:text-rose-800 hover:bg-rose-500/10"
                                disabled={!!actionLoading}
                                onClick={() => handleReject(req.id)}
                              >
                                {isLoading ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <X className="size-3.5" />
                                )}
                                <span className="hidden sm:inline">Reject</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Issue Confirmation Dialog ──────────────────────── */}
      <Dialog open={!!issueReq} onOpenChange={(open) => !open && setIssueReq(null)}>
        <DialogContent className="sm:max-w-xl bg-card/95 backdrop-blur-xl border-border/50 max-h-[85vh] flex flex-col p-0 overflow-hidden">
          {issueReq && (
            <>
              <DialogHeader className="px-6 pt-6 pb-3">
                <DialogTitle className="flex items-center gap-2 font-bold text-base">
                  <HandHeart className="size-4 text-primary" />
                  Confirm Issuance — Request {shortId(issueReq.id)}
                </DialogTitle>
                <DialogDescription>
                  Enter the quantity you wish to issue for each approved item.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 px-6 py-2 overflow-y-auto flex-1 text-xs">
                <div className="grid grid-cols-2 gap-3 py-1">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Employee</p>
                    <p className="text-sm font-medium">{issueReq.employee}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Department</p>
                    <p className="text-sm font-medium">{issueReq.department}</p>
                  </div>
                </div>

                {issueReq.note && (
                  <div className="rounded-md bg-muted/20 border border-border/40 px-3 py-2">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Employee Note</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{issueReq.note}</p>
                  </div>
                )}

                <Separator className="bg-border/30" />

                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Item Allocation</p>
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border/30 text-muted-foreground">
                          <th className="p-2 font-bold uppercase tracking-wider text-[9px]">Item Name</th>
                          <th className="p-2 text-center font-bold uppercase tracking-wider text-[9px]">Approved</th>
                          <th className="p-2 text-center font-bold uppercase tracking-wider text-[9px]">Issued</th>
                          <th className="p-2 text-center font-bold uppercase tracking-wider text-[9px]">Available</th>
                          <th className="p-2 text-right font-bold uppercase tracking-wider text-[9px] w-24">This Issue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {issueReq.lines && issueReq.lines.length > 0 ? (
                          issueReq.lines.map((line) => {
                            if (line.status === 'Rejected' || line.status === 'Cancelled') return null
                            const maxAllowed = line.approvedQty - line.issuedQty
                            const avail = getLineAvailable(line.itemId, maxAllowed)
                            return (
                              <tr key={line.id} className="hover:bg-muted/10">
                                <td className="p-2 font-medium">{line.itemName}</td>
                                <td className="p-2 text-center font-mono">{line.approvedQty}</td>
                                <td className="p-2 text-center font-mono">{line.issuedQty}</td>
                                <td className={`p-2 text-center font-mono font-medium ${avail >= maxAllowed ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {avail}
                                </td>
                                <td className="p-2 text-right">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={Math.min(maxAllowed, avail)}
                                    value={issueLines[line.id] ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      setIssueLines((prev) => ({ ...prev, [line.id]: val }))
                                    }}
                                    placeholder="0"
                                    className="h-7 text-right bg-background border-border/50 text-xs w-20 font-mono inline-block"
                                  />
                                </td>
                              </tr>
                            )
                          })
                        ) : (
                          // Legacy fallback dialog row
                          <tr className="hover:bg-muted/10">
                            <td className="p-2 font-medium">{issueReq.itemName}</td>
                            <td className="p-2 text-center font-mono">{issueReq.qty}</td>
                            <td className="p-2 text-center font-mono">—</td>
                            <td className="p-2 text-center font-mono font-medium">{issueItem ? issueItem.stock - issueItem.reservedQty : 0}</td>
                            <td className="p-2 text-right">
                              <Input
                                type="number"
                                min={0}
                                max={issueReq.qty}
                                value={issueLines['legacy'] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setIssueLines((prev) => ({ ...prev, legacy: val }))
                                }}
                                placeholder="0"
                                className="h-7 text-right bg-background border-border/50 text-xs w-20 font-mono inline-block"
                              />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <DialogFooter className="px-6 py-4 border-t border-border/20 bg-muted/5 flex items-center justify-end gap-2 sm:gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIssueReq(null)}
                  className="border-border text-xs"
                  disabled={!!actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleIssue}
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs shadow-lg shadow-primary/20"
                  disabled={!!actionLoading}
                >
                  {actionLoading === issueReq.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Confirm Issue
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Conflict Dialog ────────────────────────────────── */}
      <Dialog open={!!conflictInfo} onOpenChange={(open) => !open && setConflictInfo(null)}>
        <DialogContent className="sm:max-w-md">
          {conflictInfo && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="size-4" />
                  Version Conflict
                </DialogTitle>
                <DialogDescription>
                  The item stock has been modified since you loaded this page.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                    <p className="text-xs text-rose-600 mb-0.5">Your Version</p>
                    <p className="text-sm font-mono font-medium text-rose-700">
                      v{conflictInfo.expectedVersion}
                    </p>
                  </div>
                  <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                    <p className="text-xs text-emerald-600 mb-0.5">Server Version</p>
                    <p className="text-sm font-mono font-medium text-emerald-700">
                      v{conflictInfo.serverVersion}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  The item &quot;{conflictInfo.req.itemName}&quot; has been updated by another user. 
                  Please refresh to get the latest stock data before retrying.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConflictInfo(null)}
                  className="border-border"
                >
                  Dismiss
                </Button>
                <Button
                  onClick={handleConflictRefresh}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                >
                  <Package className="size-3.5" />
                  Refresh &amp; Retry
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
