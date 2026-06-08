'use client'

import { useEffect, useState, useCallback } from 'react'
import { ArrowRightLeft, ArrowDown, ArrowUp, Download, Search, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, TransactionResponse } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'

function exportCSV(txns: TransactionResponse[]) {
  const headers = ['ID', 'Type', 'Item', 'Item ID', 'Qty', 'Reference', 'Date']
  const rows = txns.map((t) => [
    t.id,
    t.type,
    t.itemName,
    t.itemId,
    t.qty,
    t.reference,
    new Date(t.date).toLocaleString(),
  ])
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${c}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function TransactionsView() {
  const user = useAppStore((s) => s.user)
  const flags = useAppStore((s) => s.flags)
  const isEmployee = user?.role === 'employee'

  const [transactions, setTransactions] = useState<TransactionResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [periodFilter, setPeriodFilter] = useState<string>('30d')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (isEmployee && user?.id) params.userId = user.id
      if (typeFilter !== 'all') params.type = typeFilter
      if (dateFilter) {
        params.date = dateFilter
      } else if (periodFilter !== 'all') {
        params.period = periodFilter
      }
      const data = await api.transactions.list(params)
      setTransactions(data)
    } catch {
      toast.error('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [isEmployee, user?.id, typeFilter, periodFilter, dateFilter])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const filtered = search
    ? transactions.filter((t) => {
        const q = search.toLowerCase()
        return (
          t.itemName.toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
        )
      })
    : transactions

  const totalIn  = filtered.filter((t) => t.type === 'IN').reduce((s, t) => s + t.qty, 0)
  const totalOut = filtered.filter((t) => t.type === 'OUT').reduce((s, t) => s + t.qty, 0)
  const net = totalIn - totalOut

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {isEmployee ? 'My History' : 'Transaction History'}
          </h3>
          {!loading && (
            <Badge variant="outline" className="text-xs border-border text-muted-foreground">
              {filtered.length} txn{filtered.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchTransactions} disabled={loading} className="gap-1.5">
          <ArrowRightLeft className="size-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search item or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-background border-border text-sm"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="IN">Stock In</SelectItem>
              <SelectItem value="OUT">Stock Out</SelectItem>
            </SelectContent>
          </Select>

          {/* Period — disabled when a specific date is chosen */}
          <Select value={dateFilter ? 'custom' : periodFilter} onValueChange={(v) => { setPeriodFilter(v); setDateFilter('') }} disabled={!!dateFilter}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
              {dateFilter && <SelectItem value="custom">Custom date</SelectItem>}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-[160px] h-9"
            />
            {dateFilter && (
              <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={() => setDateFilter('')} title="Clear date">
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          {flags.csvExport && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto gap-2 h-9"
              onClick={() => {
                if (filtered.length === 0) { toast.error('No transactions to export'); return }
                exportCSV(filtered)
                toast.success('CSV exported')
              }}
              disabled={loading}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/15">
              <ArrowUp className="size-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Stock In</p>
              <p className="text-lg font-semibold text-emerald-500">
                +{totalIn.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-red-500/15">
              <ArrowDown className="size-4 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Stock Out</p>
              <p className="text-lg font-semibold text-red-500">
                -{totalOut.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div
              className={`flex size-9 items-center justify-center rounded-lg ${
                net >= 0 ? 'bg-emerald-500/15' : 'bg-red-500/15'
              }`}
            >
              <ArrowRightLeft
                className={`size-4 ${net >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net</p>
              <p
                className={`text-lg font-semibold ${
                  net >= 0 ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {net >= 0 ? '+' : ''}
                {net.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-0 divide-y divide-border/30">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-4 w-20 font-mono" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ArrowRightLeft className="mb-3 size-10 opacity-30" />
              <p className="text-sm">No transactions found</p>
              <p className="text-xs opacity-60">Try adjusting your filters</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-muted-foreground">ID</TableHead>
                    <TableHead className="text-muted-foreground">Type</TableHead>
                    <TableHead className="text-muted-foreground">Item</TableHead>
                    <TableHead className="text-muted-foreground">Qty</TableHead>
                    <TableHead className="text-muted-foreground">Reference</TableHead>
                    <TableHead className="text-muted-foreground">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.id.slice(0, 8)}…
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`gap-1 ${
                            t.type === 'IN'
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/15'
                              : 'bg-rose-500/10 text-rose-700 border-rose-500/20 hover:bg-rose-500/15'
                          }`}
                        >
                          {t.type === 'IN' ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )}
                          {t.type === 'IN' ? 'Stock In' : 'Stock Out'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{t.itemName}</TableCell>
                      <TableCell>
                        <span
                          className={`font-semibold ${
                            t.type === 'IN' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {t.type === 'IN' ? '+' : '-'}
                          {t.qty}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.reference || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(t.date).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
