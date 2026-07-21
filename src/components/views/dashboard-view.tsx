'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Package,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  BoxesIcon,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Brain,
  ShieldAlert,
  RefreshCw,
  LayoutDashboard,
  Flame,
  Timer,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppStore } from '@/lib/store'
import { api, DashboardData, StockoutRiskItem, TopItem, PeriodComparison } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdminDashboardProps {
  data: DashboardData
  risk: StockoutRiskItem[]
  topItems: TopItem[]
  period: PeriodComparison | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null
  return Math.round(((curr - prev) / prev) * 100)
}

// ─── Trend Badge ─────────────────────────────────────────────────────────────

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
        <TrendingUp className="size-3" />+{pct}%
      </span>
    )
  }
  if (pct < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-500">
        <TrendingDown className="size-3" />{pct}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground/60">
      <Minus className="size-3" />0%
    </span>
  )
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  subInfo,
  trend,
  color,
  urgent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subInfo?: string
  trend?: number | null
  color: 'amber' | 'emerald' | 'rose' | 'sky'
  urgent?: boolean
}) {
  const colorMap = {
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-600', stripe: 'bg-amber-500', border: 'hover:border-amber-300' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', stripe: 'bg-emerald-500', border: 'hover:border-emerald-300' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-600', stripe: 'bg-rose-500', border: 'hover:border-rose-300' },
    sky: { bg: 'bg-sky-500/10', text: 'text-sky-600', stripe: 'bg-sky-500', border: 'hover:border-sky-300' },
  }
  const c = colorMap[color]

  return (
    <Card className={cn(
      'group relative overflow-hidden border bg-card transition-all duration-200 shadow-[0_1px_4px_rgba(0,0,0,0.04)]',
      c.border,
      'hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]',
      urgent && 'border-rose-300'
    )}>
      <div className={cn('absolute inset-x-0 top-0 h-0.5', c.stripe, 'opacity-0 group-hover:opacity-100 transition-opacity')} />
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
            <div className="flex items-center gap-2">
              {subInfo && <p className="text-[10px] text-muted-foreground/50">{subInfo}</p>}
              {trend !== undefined && <TrendBadge pct={trend ?? null} />}
            </div>
          </div>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', c.bg)}>
            <div className={c.text}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Status / Type Badges ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'Approved') return <Badge variant="warning">Approved</Badge>
  if (status === 'Issued') return <Badge variant="success">Issued</Badge>
  if (status === 'Pending') return <Badge variant="pending">Pending</Badge>
  if (status === 'Rejected') return <Badge variant="destructive">Rejected</Badge>
  if (status === 'Cancelled') return <Badge variant="draft">Cancelled</Badge>
  return <Badge variant="outline">{status}</Badge>
}

function TypeBadge({ type }: { type: 'IN' | 'OUT' }) {
  if (type === 'IN') {
    return (
      <Badge variant="success" className="gap-1 px-1.5 py-0">
        <ArrowDown className="size-2.5" />IN
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="gap-1 px-1.5 py-0">
      <ArrowUp className="size-2.5" />OUT
    </Badge>
  )
}

// ─── Stockout Risk Badge ─────────────────────────────────────────────────────

function RiskBadge({ status, daysLeft }: { status: StockoutRiskItem['status']; daysLeft: number | null }) {
  if (status === 'critical' || (daysLeft !== null && daysLeft <= 3)) {
    return (
      <Badge variant="destructive" className="gap-1">
        <Flame className="size-2.5" />
        {daysLeft !== null ? `${daysLeft}d left` : 'Critical'}
      </Badge>
    )
  }
  if (status === 'warning' || (daysLeft !== null && daysLeft <= 7)) {
    return (
      <Badge variant="warning" className="gap-1">
        <Timer className="size-2.5" />
        {daysLeft !== null ? `${daysLeft}d left` : 'Warning'}
      </Badge>
    )
  }
  return (
    <Badge variant="success">
      In Stock
    </Badge>
  )
}

// ─── AI Insights Banner ──────────────────────────────────────────────────────

function AIInsightsBanner({
  data,
  risk,
  topItems,
  period,
}: {
  data: DashboardData
  risk: StockoutRiskItem[]
  topItems: TopItem[]
  period: PeriodComparison | null
}) {
  const insights: { icon: React.ReactNode; text: string; severity: 'critical' | 'warning' | 'info' }[] = []

  const criticalItems = risk.filter((r) => r.status === 'critical' || (r.daysLeft !== null && r.daysLeft <= 3))
  if (criticalItems.length > 0) {
    insights.push({
      icon: <Flame className="size-3.5" />,
      text: `${criticalItems.length} item${criticalItems.length > 1 ? 's' : ''} will stockout within 3 days — immediate reorder required`,
      severity: 'critical',
    })
  }

  if (data.outOfStockCount && data.outOfStockCount > 0) {
    insights.push({
      icon: <ShieldAlert className="size-3.5" />,
      text: `${data.outOfStockCount} item${data.outOfStockCount > 1 ? 's are' : ' is'} completely out of stock and blocking fulfillment`,
      severity: 'critical',
    })
  }

  if (period) {
    const delta = pctChange(period.thisMonth.issued, period.lastMonth.issued)
    if (delta !== null && delta > 0) {
      insights.push({
        icon: <TrendingUp className="size-3.5" />,
        text: `Fulfillment up ${delta}% this month vs last month (${period.thisMonth.issued} vs ${period.lastMonth.issued} issued)`,
        severity: 'info',
      })
    } else if (delta !== null && delta < 0) {
      insights.push({
        icon: <TrendingDown className="size-3.5" />,
        text: `Fulfillment down ${Math.abs(delta)}% this month — ${period.thisMonth.requests} requests, only ${period.thisMonth.issued} issued`,
        severity: 'warning',
      })
    }
  }

  if (topItems.length > 0) {
    insights.push({
      icon: <Zap className="size-3.5" />,
      text: `Highest consumption: ${topItems[0].itemName} (${topItems[0].qty} units this period)`,
      severity: 'info',
    })
  }

  if (insights.length === 0) return null

  const severityStyle = {
    critical: 'bg-rose-500/10 border-rose-500/20 text-rose-800',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-800',
    info: 'bg-sky-500/10 border-sky-500/15 text-sky-800',
  }

  return (
    <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
          <Brain className="size-3.5 text-primary" />
          Intelligence Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {insights.map((ins, i) => (
            <div key={i} className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs', severityStyle[ins.severity])}>
              <span className="mt-0.5 shrink-0">{ins.icon}</span>
              <span className="leading-snug">{ins.text}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-7 w-14" />
                  <Skeleton className="h-2 w-16" />
                </div>
                <Skeleton className="size-9 rounded-xl shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

function AdminDashboard({ data, risk, topItems, period }: AdminDashboardProps) {
  const requestTrend = period ? pctChange(period.thisMonth.requests, period.lastMonth.requests) : null
  const issuedTrend = period ? pctChange(period.thisMonth.issued, period.lastMonth.issued) : null

  const criticalRisk = risk.filter((r) => r.status === 'critical' || (r.daysLeft !== null && r.daysLeft <= 3))
  const alertItems = risk.filter((r) => r.status !== 'ok' && r.status !== 'insufficient').length

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Package className="size-4" />}
          label="Total Items"
          value={data.totalItems}
          subInfo={`${data.totalStock.toLocaleString()} total units`}
          color="amber"
        />
        <StatCard
          icon={<BoxesIcon className="size-4" />}
          label="At Risk"
          value={alertItems > 0 ? alertItems : data.lowStockCount}
          subInfo={data.outOfStockCount ? `${data.outOfStockCount} out of stock` : 'Reorder alerts'}
          color={criticalRisk.length > 0 ? 'rose' : 'amber'}
          urgent={criticalRisk.length > 0}
        />
        <StatCard
          icon={<Clock className="size-4" />}
          label="Pending"
          value={data.pendingCount}
          subInfo={`${data.approvedCount} approved`}
          trend={requestTrend}
          color="sky"
        />
        <StatCard
          icon={<CheckCircle className="size-4" />}
          label="Issued"
          value={data.issuedCount}
          subInfo="This period"
          trend={issuedTrend}
          color="emerald"
        />
      </div>

      {/* ── Intelligence Insights ── */}
      <AIInsightsBanner data={data} risk={risk} topItems={topItems} period={period} />

      {/* ── Alerts + Top Items ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Stockout Risk Alerts (2/3) */}
        <Card className="lg:col-span-2 border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardHeader className="pb-3 px-5 pt-4">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                <AlertTriangle className="size-3.5 text-rose-500" />
                Inventory Alerts
              </span>
              {criticalRisk.length > 0 && (
                <Badge variant="outline" className="border-rose-500/20 text-rose-700 bg-rose-500/10 text-[10px] font-bold gap-1">
                  <Flame className="size-2.5" />
                  {criticalRisk.length} Critical
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {risk.filter(r => r.status !== 'ok').length === 0 && data.lowStockItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border/30 rounded-xl">
                <CheckCircle className="size-7 text-emerald-500/40 mb-2" />
                <p className="text-xs text-muted-foreground">All stock levels healthy</p>
              </div>
            ) : (
              <div className="h-[280px] overflow-y-auto pr-2">
                <div className="space-y-2 pr-2">
                  {/* Prioritize risk items, fall back to lowStockItems */}
                  {(risk.filter(r => r.status !== 'ok' && r.status !== 'insufficient').length > 0
                    ? risk.filter(r => r.status !== 'ok' && r.status !== 'insufficient')
                        .sort((a, b) => {
                          const scoreA = a.daysLeft ?? 999
                          const scoreB = b.daysLeft ?? 999
                          return scoreA - scoreB
                        })
                    : data.lowStockItems.map(item => ({
                        id: item.id,
                        name: item.name,
                        stock: item.stock,
                        unit: '',
                        daysLeft: null,
                        rate: 0,
                        status: item.stock === 0 ? 'critical' as const : 'warning' as const,
                        minStock: item.minStock,
                      }))
                  ).map((item) => {
                    const minStock = 'minStock' in item ? (item as { minStock: number }).minStock : 0
                    const stockPct = minStock
                      ? Math.min(100, (item.stock / (minStock * 3)) * 100)
                      : item.daysLeft !== null ? Math.min(100, (item.daysLeft / 14) * 100) : 50

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                          item.status === 'critical' || (item.daysLeft !== null && item.daysLeft <= 3)
                            ? 'border-rose-500/20 bg-rose-500/8 hover:bg-rose-500/12'
                            : 'border-amber-500/20 bg-amber-500/6 hover:bg-amber-500/10'
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold truncate">{item.name}</p>
                            <RiskBadge status={item.status} daysLeft={item.daysLeft} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={stockPct}
                              className="h-1 flex-1"
                              indicatorClassName={item.status === 'critical' ? 'bg-rose-500' : 'bg-amber-500'}
                            />
                            <span className="text-[10px] font-bold text-muted-foreground/70 whitespace-nowrap">
                              {item.stock} {item.unit || 'units'}
                              {item.daysLeft !== null && item.daysLeft > 0 && (
                                <span className="text-muted-foreground/50"> · {item.rate.toFixed(1)}/day</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Consumed Items (1/3) */}
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] flex flex-col">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
              <Zap className="size-3.5 text-amber-500" />
              Top Consumed
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 px-5 pb-4">
            {topItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <p className="text-xs text-muted-foreground/60">No consumption data</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {topItems.slice(0, 6).map((item, i) => {
                  const maxQty = topItems[0]?.qty || 1
                  const pct = Math.round((item.qty / maxQty) * 100)
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate flex-1">{item.itemName}</p>
                        <span className="text-[10px] font-bold text-muted-foreground/70 tabular-nums shrink-0">{item.qty}</span>
                      </div>
                      <Progress
                        value={pct}
                        className="h-1"
                        indicatorClassName={i === 0 ? 'bg-amber-500' : 'bg-muted-foreground/30'}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Requests + Transactions ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Recent Requests */}
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
              <Clock className="size-3.5 text-sky-500" />
              Latest Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader className="bg-muted/10 backdrop-blur-sm sticky top-0">
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 px-5">Employee</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50">Item</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 text-right">Qty</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 pr-5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentRequests.map((req) => (
                    <TableRow key={req.id} className="border-border/10 hover:bg-primary/5 transition-colors">
                      <TableCell className="py-2 px-5">
                        <p className="text-xs font-semibold truncate max-w-[100px]">{req.employee}</p>
                        <p className="text-[10px] text-muted-foreground/50">{req.department}</p>
                      </TableCell>
                      <TableCell className="py-2 text-xs truncate max-w-[120px]">{req.itemName}</TableCell>
                      <TableCell className="py-2 text-xs font-bold text-right tabular-nums">{req.qty}</TableCell>
                      <TableCell className="py-2 pr-5"><StatusBadge status={req.status} /></TableCell>
                    </TableRow>
                  ))}
                  {data.recentRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground/60">No recent requests</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
              <ArrowRightLeft className="size-3.5 text-emerald-500" />
              Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader className="bg-muted/10 sticky top-0 backdrop-blur-sm">
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 px-5">Type</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50">Asset</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 text-right">Qty</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 pr-5">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentTransactions.map((txn) => (
                    <TableRow key={txn.id} className="border-border/10 hover:bg-primary/5 transition-colors">
                      <TableCell className="py-2 px-5"><TypeBadge type={txn.type} /></TableCell>
                      <TableCell className="py-2 text-xs font-medium truncate max-w-[140px]">{txn.itemName}</TableCell>
                      <TableCell className="py-2 text-xs font-bold text-right tabular-nums">{txn.qty}</TableCell>
                      <TableCell className="py-2 text-[10px] text-muted-foreground/60 pr-5">{formatDate(txn.date)}</TableCell>
                    </TableRow>
                  ))}
                  {data.recentTransactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground/60">No transactions recorded</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Employee Dashboard ──────────────────────────────────────────────────────

function EmployeeDashboard({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Clock className="size-4" />} label="Total Requests" value={data.totalRequests ?? data.recentRequests.length} subInfo="Lifetime" color="amber" />
        <StatCard icon={<AlertTriangle className="size-4" />} label="Pending" value={data.pendingCount} subInfo="Awaiting action" color="sky" />
        <StatCard icon={<CheckCircle className="size-4" />} label="Fulfilled" value={data.issuedCount} subInfo="Successfully received" color="emerald" />
        <StatCard icon={<ArrowRightLeft className="size-4" />} label="Transactions" value={data.totalTransactions ?? data.recentTransactions.length} subInfo="All movements" color="amber" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">My Request History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-72 overflow-auto">
              <Table>
                <TableHeader className="bg-muted/10 backdrop-blur-sm">
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 px-5">Item</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 text-right">Qty</TableHead>
                    <TableHead className="h-8 text-[10px] uppercase font-bold text-muted-foreground/50 pr-5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentRequests.map((req) => (
                    <TableRow key={req.id} className="border-border/10 hover:bg-primary/5 transition-colors">
                      <TableCell className="py-2 px-5 text-xs">{req.itemName}</TableCell>
                      <TableCell className="py-2 text-xs font-bold text-right tabular-nums">{req.qty}</TableCell>
                      <TableCell className="py-2 pr-5"><StatusBadge status={req.status} /></TableCell>
                    </TableRow>
                  ))}
                  {data.recentRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-xs text-muted-foreground/60">No requests yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
              <LayoutDashboard className="size-3.5 text-primary" />
              Quick Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-2">
            {[
              { step: 1, color: 'bg-primary/15 text-primary', title: 'Submit a Request', desc: 'Go to My Requests → New Request. Search item and add a description.' },
              { step: 2, color: 'bg-sky-500/15 text-sky-500', title: 'Track Status', desc: 'Pending → Approved → Issued. Cancel a Pending request any time.' },
              { step: 3, color: 'bg-emerald-500/15 text-emerald-500', title: 'Collect Your Item', desc: 'Once Issued, collect from store. Check My History for full log.' },
            ].map(({ step, color, title, desc }) => (
              <div key={step} className="flex items-start gap-3 p-3 rounded-xl bg-muted/10 border border-white/30">
                <div className={cn('size-5 rounded-full flex items-center justify-center shrink-0 mt-0.5', color)}>
                  <span className="text-[10px] font-bold">{step}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold">{title}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Main Dashboard View ──────────────────────────────────────────────────────

export default function DashboardView() {
  const user = useAppStore((s) => s.user)
  const setPendingCount = useAppStore((s) => s.setPendingCount)
  const isAdmin = !!user && ['admin', 'STORE_ADMIN', 'STORE_OPERATOR', 'MANAGEMENT'].includes(user.role)

  const [data, setData] = useState<DashboardData | null>(null)
  const [risk, setRisk] = useState<StockoutRiskItem[]>([])
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [period, setPeriod] = useState<PeriodComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const params = !isAdmin ? { userId: user.id } : undefined
      if (isAdmin) {
        const [dashRes, riskRes, topRes, periodRes] = await Promise.all([
          api.reporting.dashboard(params),
          api.reporting.stockoutRisk().catch(() => [] as StockoutRiskItem[]),
          api.reporting.topItems().catch(() => [] as TopItem[]),
          api.reporting.periodComparison().catch(() => null),
        ])
        setData(dashRes)
        setRisk(riskRes)
        setTopItems(topRes)
        setPeriod(periodRes)
        setPendingCount(dashRes.pendingCount + dashRes.approvedCount)
      } else {
        const dashRes = await api.reporting.dashboard(params)
        setData(dashRes)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [user, setPendingCount])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) return <DashboardSkeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertTriangle className="size-10 text-rose-500/40 mb-4" />
        <h4 className="text-base font-bold tracking-tight">Sync Failed</h4>
        <p className="text-sm text-muted-foreground/60 mb-6 text-center max-w-sm">{error}</p>
        <button
          onClick={fetchDashboard}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          <RefreshCw className="size-3.5" />
          Reconnect
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold tracking-tight">
            {isAdmin ? 'System Intelligence' : 'My Overview'}
          </h3>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {isAdmin
              ? 'Real-time inventory health, alerts, and operational metrics'
              : 'Your active requests and inventory activity'}
          </p>
        </div>
        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/10 text-muted-foreground font-bold text-[10px] uppercase tracking-wider hover:bg-muted/20 transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {!isAdmin
        ? <EmployeeDashboard data={data} />
        : <AdminDashboard data={data} risk={risk} topItems={topItems} period={period} />
      }
    </div>
  )
}
