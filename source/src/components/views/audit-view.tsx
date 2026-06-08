'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ShieldAlert,
  Search,
  User,
  Activity,
  Info,
  Monitor,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, AuditLog } from '@/lib/api'
import { format } from 'date-fns'
import { toast } from 'sonner'

export default function AuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Debounce search — 400ms
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (val: string) => {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(val)
      setPage(1)
    }, 400)
  }

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.reporting.auditLogs({ page, search: search || undefined })
      setLogs(res.logs)
      setTotalPages(res.pagination.totalPages)
      setTotalCount(res.pagination.totalCount)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const exportToCSV = () => {
    if (logs.length === 0) return
    const headers = ['Timestamp', 'Action', 'User Name', 'User ID', 'Target', 'Target ID', 'Source IP']
    const rows = logs.map((log) => [
      format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      log.action,
      log.userName || 'System',
      log.userId || '-',
      log.targetName || '-',
      log.targetId || '-',
      log.ip || 'Local',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `audit_logs_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`
    link.click()
  }

  function getActionColor(action: string) {
    if (action.includes('DELETE')) return 'border-rose-500/20 text-rose-700 bg-rose-500/10'
    if (action.includes('CREATE')) return 'border-emerald-500/20 text-emerald-700 bg-emerald-500/10'
    if (action.includes('UPDATE')) return 'border-sky-500/20 text-sky-700 bg-sky-500/10'
    if (action === 'LOGIN') return 'border-amber-500/20 text-amber-700 bg-amber-500/10'
    return 'border-border text-muted-foreground'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">Security & Audit Logs</h3>
          {!loading && (
            <Badge variant="outline" className="text-xs border-border text-muted-foreground">
              {totalCount.toLocaleString()} total
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search action, user, target..."
              className="pl-9 bg-background border-border h-10 rounded-xl"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={logs.length === 0}
            className="h-10 rounded-xl border-border bg-transparent hover:bg-muted/20 gap-2 font-bold px-4"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardContent className="p-0">
          {/* Column headers */}
          <div className="border-b border-border/40 bg-muted/15 px-6 py-3 grid grid-cols-12 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            <div className="col-span-2">Time</div>
            <div className="col-span-2">Action</div>
            <div className="col-span-3">User</div>
            <div className="col-span-3">Target</div>
            <div className="col-span-2 text-right">Source</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/20 min-h-[400px]">
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="px-6 py-4 grid grid-cols-12 gap-4">
                  <Skeleton className="h-4 col-span-2" />
                  <Skeleton className="h-4 col-span-2" />
                  <Skeleton className="h-4 col-span-3" />
                  <Skeleton className="h-4 col-span-3" />
                  <Skeleton className="h-4 col-span-2" />
                </div>
              ))
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Activity className="size-10 mb-4 opacity-20" />
                <p className="text-sm">No activity logs found</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="px-6 py-4 grid grid-cols-12 items-center gap-4 hover:bg-primary/5 transition-colors">
                  <div className="col-span-2 flex flex-col">
                    <span className="text-xs font-medium text-foreground">
                      {format(new Date(log.createdAt), 'HH:mm:ss')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(log.createdAt), 'dd MMM yyyy')}
                    </span>
                  </div>

                  <div className="col-span-2">
                    <Badge variant="outline" className={`text-[10px] font-bold ${getActionColor(log.action)}`}>
                      {log.action}
                    </Badge>
                  </div>

                  <div className="col-span-3 flex items-center gap-2">
                    <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="size-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate text-foreground">{log.userName || 'System'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{log.userId ? log.userId.slice(0, 8) : '-'}</p>
                    </div>
                  </div>

                  <div className="col-span-3 flex items-center gap-2">
                    <div className="size-7 rounded-full bg-muted/30 flex items-center justify-center shrink-0">
                      <Info className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate text-foreground">{log.targetName || '-'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{log.targetId ? log.targetId.slice(0, 8) : '-'}</p>
                    </div>
                  </div>

                  <div className="col-span-2 text-right">
                    <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                      <Monitor className="size-3" />
                      <span>{log.ip || 'Local'}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination footer */}
          <div className="border-t border-border bg-muted/10 px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Page {page} of {totalPages || 1} · {totalCount.toLocaleString()} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-8 border-border"
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8 border-border"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
