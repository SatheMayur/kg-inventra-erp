'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardList,
  Search,
  Plus,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/lib/store'
import { api, type ItemResponse, type RequestResponse, type UserResponse } from '@/lib/api'
import { toast } from 'sonner'

// Sub-components
import { RequestsTable } from '@/components/requests/RequestsTable'
import { RequestDetailDialog } from '@/components/requests/RequestDetailDialog'
import { NewRequestDialog } from '@/components/requests/NewRequestDialog'

export default function RequestsView({ title }: { title?: string }) {
  const user = useAppStore((s) => s.user)
  const setPendingCount = useAppStore((s) => s.setPendingCount)
  const role = user?.role ?? ''
  const isAdmin = role === 'admin'
  const isDeptHead = role === 'DEPT_HEAD' || !!user?.isDeptHead
  const canIssueRequest = ['admin', 'STORE_ADMIN', 'STORE_OPERATOR'].includes(role)
  const canCreatePO = ['admin', 'STORE_ADMIN', 'PURCHASE_USER'].includes(role)
  const canSeeWorkflowRequests = canIssueRequest || canCreatePO || isDeptHead || role === 'MANAGEMENT'

  // Data
  const [requests, setRequests] = useState<RequestResponse[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [users, setUsers] = useState<UserResponse[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Dialogs
  const [detailReq, setDetailReq] = useState<RequestResponse | null>(null)
  const [newReqOpen, setNewReqOpen] = useState(false)

  // Action loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ── Fetch data ──────────────────────────────────────────

  const fetchRequests = useCallback(async () => {
    try {
      const params: { userId?: string; status?: string } = {}
      if (!canSeeWorkflowRequests && user) params.userId = user.id
      if (statusFilter !== 'all') params.status = statusFilter
      const data = await api.requests.list(params)
      setRequests(data)
    } catch {
      toast.error('Failed to load requests')
    }
  }, [canSeeWorkflowRequests, user, statusFilter])

  const fetchItems = useCallback(async () => {
    try {
      // Fetch all items so detailItem stock lookup always resolves
      const res = await api.items.list({ pageSize: 1000 })
      setItems(res.items)
    } catch {
      toast.error('Failed to load items')
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return
    try {
      const data = await api.users.list()
      setUsers(data.filter((u) => u.active))
    } catch {
      toast.error('Failed to load users')
    }
  }, [isAdmin])

  const refreshPendingBadge = useCallback(async () => {
    try {
      const [pending, approved] = await Promise.all([
        api.requests.list({ status: 'Pending' }),
        api.requests.list({ status: 'Approved' }),
      ])
      setPendingCount(pending.length + approved.length)
    } catch {
      // silent
    }
  }, [setPendingCount])

  // Initial load — single effect handles both mount and filter changes.
  // fetchRequests is memoised on statusFilter, so changing the filter
  // naturally triggers a re-fetch without a second useEffect.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      await Promise.all([fetchRequests(), fetchItems(), fetchUsers()])
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [fetchRequests, fetchItems, fetchUsers])

  // ── Action handlers ─────────────────────────────────────

  async function handleApprove(id: string) {
    setActionLoading(id)
    try {
      await api.requests.approve(id)
      toast.success('Request approved')
      await fetchRequests()
      await refreshPendingBadge()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setActionLoading(null)
      setDetailReq(null)
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id)
    try {
      await api.requests.reject(id)
      toast.success('Request rejected')
      await fetchRequests()
      await refreshPendingBadge()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setActionLoading(null)
      setDetailReq(null)
    }
  }

  async function handleCancel(id: string) {
    if (!user) return
    setActionLoading(id)
    try {
      await api.requests.cancel(id, user.id)
      toast.success('Request cancelled')
      await fetchRequests()
      await refreshPendingBadge()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setActionLoading(null)
      setDetailReq(null)
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

  // ── Stock helper ───────────────────────

  const detailItem = detailReq ? items.find((i) => i.id === (detailReq.lines?.[0]?.itemId ?? detailReq.itemId)) : null
  const detailAvailable = detailItem ? detailItem.stock - (detailItem.reservedQty - (detailReq!.lines?.[0]?.availableQty ?? 0)) : 0

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">{title ?? (isAdmin ? 'All Requests' : 'My Requests')}</h3>
            {!loading && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Managing {filtered.length} active request{filtered.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setNewReqOpen(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            <Plus className="size-4" />
            New Request
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by ID, item or employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-10 bg-background border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-44 bg-background border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="CONVERTED_TO_PO">Converted to PO</SelectItem>
              <SelectItem value="Issued">Issued</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table Section */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <RequestsTable 
          requests={filtered} 
          loading={loading} 
          isAdmin={isAdmin} 
          onRowClick={setDetailReq} 
        />
      </Card>

      {/* Dialogs */}
      <RequestDetailDialog 
        request={detailReq}
        onOpenChange={(open) => !open && setDetailReq(null)}
        isAdmin={isAdmin}
        canIssueRequest={canIssueRequest}
        canCreatePO={canCreatePO}
        canApprove={
          isAdmin || 
          ((role === 'DEPT_HEAD' || user?.isDeptHead) && 
           detailReq?.department === user?.department)
        }
        item={detailItem ?? undefined}
        availableStock={detailAvailable}
        actionLoading={actionLoading}
        onApprove={handleApprove}
        onReject={handleReject}
        onCancel={handleCancel}
        onIssue={() => {
          setDetailReq(null)
          useAppStore.getState().setCurrentView('issuance')
        }}
        onCreatePO={() => {
          const requestNumber = detailReq?.requestNumber || (detailReq ? `SR-${detailReq.id.slice(-6).toUpperCase()}` : 'this requisition')
          setDetailReq(null)
          useAppStore.getState().setCurrentView('purchase-order-process')
          toast.info(`Select ${requestNumber} in the PO screen to create the order`)
        }}
      />

      <NewRequestDialog 
        open={newReqOpen}
        onOpenChange={setNewReqOpen}
        user={user}
        isAdmin={isAdmin}
        items={items}
        users={users}
        onSuccess={() => {
          fetchRequests()
          refreshPendingBadge()
        }}
      />
    </div>
  )
}
