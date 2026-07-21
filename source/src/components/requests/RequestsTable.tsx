'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ClipboardList, Download } from 'lucide-react'
import { RequestResponse } from '@/lib/api'
import { toast } from 'sonner'
import { getRequestNextAction, type NextActionTone } from '@/lib/request-fulfillment'

interface RequestsTableProps {
  requests: RequestResponse[]
  loading: boolean
  isAdmin: boolean
  onRowClick: (req: RequestResponse) => void
}

type Status = string

function statusBadge(status: Status) {
  const normalized = status.toUpperCase()
  if (normalized.includes('PENDING')) return <Badge variant="pending">{status}</Badge>
  if (normalized === 'ISSUED' || normalized === 'CLOSED') return <Badge variant="success">{status}</Badge>
  if (normalized === 'APPROVED') return <Badge variant="warning">{status}</Badge>
  if (normalized === 'REJECTED') return <Badge variant="destructive">{status}</Badge>
  if (normalized === 'READYFORPICKUP') return <Badge variant="purple">{status}</Badge>
  if (normalized === 'CANCELLED' || normalized === 'DRAFT') return <Badge variant="draft">{status}</Badge>
  return <Badge variant="info">{status}</Badge>
}

function nextActionBadge(tone: NextActionTone) {
  const map: Record<NextActionTone, string> = {
    success: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    default: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
    muted: 'bg-muted text-muted-foreground border-border',
  }
  return map[tone]
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function shortId(id: string) { return id.slice(0, 8).toUpperCase() }

function exportRequestsCSV(requests: RequestResponse[]) {
  const headers = ['ID', 'Employee', 'Department', 'Item', 'Qty', 'Status', 'Requested', 'Issued', 'Issued By']
  const rows = requests.map((r) => [
    r.id, r.employee, r.department, r.itemName, r.qty, r.status,
    formatDate(r.createdAt), formatDate(r.issuedAt), r.issuedBy || '—',
  ])
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `requests_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function RequestsTable({ requests, loading, isAdmin, onRowClick }: RequestsTableProps) {
  if (loading) {
    return (
      <div className="divide-y divide-border/30">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        ))}
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ClipboardList className="size-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">No requests found</p>
        <p className="text-xs mt-1">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div>
      {isAdmin && requests.length > 0 && (
        <div className="flex justify-end px-4 pt-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-8 text-xs border-border/50"
            onClick={() => { exportRequestsCSV(requests); toast.success('CSV exported') }}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      )}
    <Table className="enterprise-table">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>ID</TableHead>
          {isAdmin && (
            <>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
            </>
          )}
          <TableHead>Item</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Next Action</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Issued</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((req) => {
          const nextAction = getRequestNextAction(req)
          return (
            <TableRow
              key={req.id}
              className="cursor-pointer"
              onClick={() => onRowClick(req)}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                {shortId(req.id)}
              </TableCell>
              {isAdmin && (
                <>
                  <TableCell className="text-sm">{req.employee}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{req.department}</TableCell>
                </>
              )}
              <TableCell className="text-sm">{req.itemName}</TableCell>
              <TableCell className="text-sm">{req.qty}</TableCell>
              <TableCell>{statusBadge(req.status)}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Badge variant="outline" className={`text-[10px] font-semibold px-2 ${nextActionBadge(nextAction.tone)}`}>
                    {nextAction.label}
                  </Badge>
                  {isAdmin && (
                    <p className="text-[10px] text-muted-foreground">{nextAction.owner}</p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDate(req.createdAt)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDate(req.issuedAt)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
    </div>
  )
}
