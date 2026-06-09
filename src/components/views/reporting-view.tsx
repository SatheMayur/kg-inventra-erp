'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Clock,
  Check,
  DollarSign,
  Users,
  ArrowLeftRight,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  api,
  DeptConsumption,
  TopItem,
  StockoutRiskItem,
  PeriodComparison,
  InventoryValueResponse,
  UserActivityResponse,
  ItemFlowResponse,
} from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'

const CHART_COLORS = [
  '#f59e0b',
  '#10b981',
  '#38bdf8',
  '#f43f5e',
  '#a78bfa',
  '#fb923c',
  '#34d399',
]

const tooltipStyle = {
  contentStyle: {
    background: '#22263a',
    border: '1px solid #2d3348',
    borderRadius: 8,
    color: '#e2e8f0',
  },
  labelStyle: { color: '#e2e8f0' },
}

const PERIODS = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
] as const

type PeriodKey = (typeof PERIODS)[number]['key']

export default function ReportingView() {
  const flags = useAppStore((s) => s.flags)
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [deptView, setDeptView] = useState<'qty' | 'spending'>('qty')
  const [deptData, setDeptData] = useState<DeptConsumption[]>([])
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [stockoutRisk, setStockoutRisk] = useState<StockoutRiskItem[]>([])
  const [periodComp, setPeriodComp] = useState<PeriodComparison | null>(null)
  const [loading, setLoading] = useState(true)

  // New tab states
  const [invValue, setInvValue] = useState<InventoryValueResponse | null>(null)
  const [invValueLoading, setInvValueLoading] = useState(false)
  const [invValueLoaded, setInvValueLoaded] = useState(false)

  const [activityDays, setActivityDays] = useState(30)
  const [userActivity, setUserActivity] = useState<UserActivityResponse | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)

  const [flowDays, setFlowDays] = useState(30)
  const [itemFlow, setItemFlow] = useState<ItemFlowResponse | null>(null)
  const [flowLoading, setFlowLoading] = useState(false)

  // Check if reporting flag is on
  const reportingEnabled = flags.reporting !== false

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [depts, items, risk, comp] = await Promise.all([
        api.reporting.deptConsumption({ period }),
        api.reporting.topItems({ period }),
        api.reporting.stockoutRisk(),
        api.reporting.periodComparison(),
      ])
      setDeptData(depts)
      setTopItems(items)
      setStockoutRisk(risk)
      setPeriodComp(comp)
    } catch {
      toast.error('Failed to load reporting data')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    if (reportingEnabled) {
      fetchData()
    }
  }, [fetchData, reportingEnabled])

  const fetchInvValue = useCallback(async () => {
    try {
      setInvValueLoading(true)
      const data = await api.reporting.inventoryValue()
      setInvValue(data)
      setInvValueLoaded(true)
    } catch {
      toast.error('Failed to load inventory value data')
    } finally {
      setInvValueLoading(false)
    }
  }, [])

  const fetchUserActivity = useCallback(async () => {
    try {
      setActivityLoading(true)
      const data = await api.reporting.userActivity({ days: activityDays })
      setUserActivity(data)
    } catch {
      toast.error('Failed to load user activity data')
    } finally {
      setActivityLoading(false)
    }
  }, [activityDays])

  const fetchItemFlow = useCallback(async () => {
    try {
      setFlowLoading(true)
      const data = await api.reporting.itemFlow({ days: flowDays })
      setItemFlow(data)
    } catch {
      toast.error('Failed to load item flow data')
    } finally {
      setFlowLoading(false)
    }
  }, [flowDays])

  useEffect(() => {
    if (reportingEnabled) fetchUserActivity()
  }, [fetchUserActivity, reportingEnabled])

  useEffect(() => {
    if (reportingEnabled) fetchItemFlow()
  }, [fetchItemFlow, reportingEnabled])

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)

  if (!reportingEnabled) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">Reporting & Analytics</h3>
        </div>
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BarChart3 className="mb-3 size-10 opacity-30" />
            <p className="text-sm">Reporting is disabled</p>
            <p className="text-xs opacity-60">
              Enable the Reporting feature flag in Settings to view analytics.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  function getRiskColor(status: string) {
    switch (status) {
      case 'critical':
        return 'text-red-500'
      case 'warning':
        return 'text-amber-500'
      case 'ok':
        return 'text-emerald-500'
      case 'insufficient':
        return 'text-sky-500'
      default:
        return 'text-muted-foreground'
    }
  }

  function getRiskProgressColor(status: string) {
    switch (status) {
      case 'critical':
        return '[&>div]:bg-red-500'
      case 'warning':
        return '[&>div]:bg-amber-500'
      case 'ok':
        return '[&>div]:bg-emerald-500'
      case 'insufficient':
        return '[&>div]:bg-sky-500'
      default:
        return '[&>div]:bg-muted-foreground'
    }
  }

  function getDaysLeftText(item: StockoutRiskItem) {
    if (item.daysLeft === null) return 'N/A'
    if (item.status === 'insufficient') return 'No data'
    return `${item.daysLeft}d`
  }

  const changePct = periodComp?.changePct ?? 0
  const thisMonth = periodComp?.thisMonth ?? { qty: 0, count: 0, requests: 0, issued: 0 }
  const lastMonth = periodComp?.lastMonth ?? { qty: 0, count: 0, requests: 0, issued: 0 }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">Reporting & Analytics</h3>
          {periodComp && (
            <Badge variant="outline" className="text-xs border-border/40 text-muted-foreground">
              {thisMonth.count} txns this month
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5">
          <BarChart3 className="size-3.5" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">
            <BarChart3 className="size-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="inventory-value" onClick={() => { if (!invValueLoaded) fetchInvValue() }}>
            <DollarSign className="size-3.5 mr-1.5" />
            Inventory Value
          </TabsTrigger>
          <TabsTrigger value="user-activity">
            <Users className="size-3.5 mr-1.5" />
            User Activity
          </TabsTrigger>
          <TabsTrigger value="item-flow">
            <ArrowLeftRight className="size-3.5 mr-1.5" />
            Item Flow
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab (existing content, unchanged) ── */}
        <TabsContent value="overview" className="space-y-4">
          {/* Period Selector */}
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.key}
                variant={period === p.key ? 'default' : 'outline'}
                size="sm"
                className={
                  period === p.key
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 rounded-full'
                    : 'rounded-full'
                }
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Department Consumption / Spending */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Department Analysis</CardTitle>
                <div className="flex bg-muted/20 rounded-lg p-0.5 border border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 px-2 text-[10px] rounded-md ${deptView === 'qty' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                    onClick={() => setDeptView('qty')}
                  >
                    Quantity
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 px-2 text-[10px] rounded-md ${deptView === 'spending' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                    onClick={() => setDeptView('spending')}
                  >
                    Spending
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : deptData.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                    No data for this period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={deptData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis
                        dataKey="department"
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={{ stroke: 'var(--border)' }}
                      />
                      <YAxis
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={{ stroke: 'var(--border)' }}
                        tickFormatter={(val) => deptView === 'spending' ? `₹${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}` : val}
                      />
                      <RechartsTooltip
                        {...tooltipStyle}
                        formatter={(val: number) => [
                          deptView === 'spending' ? formatCurrency(val) : val,
                          deptView === 'spending' ? 'Total Spent' : 'Total Qty',
                        ]}
                      />
                      <Bar dataKey={deptView} radius={[4, 4, 0, 0]}>
                        {deptData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Consumed Items */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Consumed Items</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : topItems.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                    No data for this period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart layout="vertical" data={topItems} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis
                        type="number"
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={{ stroke: 'var(--border)' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="itemName"
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={{ stroke: 'var(--border)' }}
                        width={120}
                      />
                      <RechartsTooltip {...tooltipStyle} />
                      <Bar dataKey="qty" radius={[0, 4, 4, 0]} fill="#38bdf8" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom Section */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Stockout Risk Prediction */}
            <Card className="border-border bg-card lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  <CardTitle className="text-base">Stockout Risk Prediction</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : stockoutRisk.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Check className="mb-2 size-8 text-emerald-500" />
                    <p className="text-sm">No stockout risks detected</p>
                    <p className="text-xs opacity-60">All items are well-stocked</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[320px]">
                    <div className="space-y-3">
                      {stockoutRisk.map((item) => {
                        const riskPct =
                          item.status === 'critical' ? 90
                            : item.status === 'warning' ? 60
                              : item.status === 'ok' ? 25
                                : 100
                        return (
                          <div key={item.id} className="flex items-center gap-4 rounded-lg border border-border/50 p-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium">{item.name}</p>
                                <Badge
                                  className={`text-[10px] ${item.status === 'critical'
                                    ? 'bg-red-500/15 text-red-500 border-red-500/30'
                                    : item.status === 'warning'
                                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                                      : item.status === 'insufficient'
                                        ? 'bg-sky-500/15 text-sky-500 border-sky-500/30'
                                        : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                                    }`}
                                >
                                  {item.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Stock: {item.stock} {item.unit} · Rate: {item.rate.toFixed(1)}/day
                              </p>
                            </div>
                            <div className="w-28 shrink-0">
                              <Progress value={riskPct} className={`h-2 ${getRiskProgressColor(item.status)}`} />
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Clock className={`size-3.5 ${getRiskColor(item.status)}`} />
                              <span className={`text-sm font-semibold ${getRiskColor(item.status)}`}>
                                {getDaysLeftText(item)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Month over Month */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-primary" />
                  <CardTitle className="text-base">Month over Month</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    <Skeleton className="mx-auto h-16 w-32" />
                    <div className="grid grid-cols-2 gap-3">
                      <Skeleton className="h-24" />
                      <Skeleton className="h-24" />
                    </div>
                  </div>
                ) : !periodComp ? (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    No comparison data
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-foreground">
                        {(thisMonth.qty ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">qty this month</p>
                      <div className="mt-2 flex items-center justify-center gap-1">
                        {changePct > 0 ? (
                          <TrendingUp className="size-4 text-red-500" />
                        ) : changePct < 0 ? (
                          <TrendingDown className="size-4 text-emerald-500" />
                        ) : (
                          <Minus className="size-4 text-muted-foreground" />
                        )}
                        <span className={`text-sm font-semibold ${changePct > 0 ? 'text-red-500' : changePct < 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted-foreground">vs last month</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border/30 bg-muted/10 p-3 text-center">
                        <p className="text-lg font-semibold text-foreground">{(thisMonth.qty ?? 0).toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">This Month</p>
                        <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          <p>{thisMonth.count} txns</p>
                          <p>{thisMonth.requests} requests</p>
                          <p>{thisMonth.issued} issued</p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/30 bg-muted/10 p-3 text-center">
                        <p className="text-lg font-semibold text-foreground">{(lastMonth.qty ?? 0).toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">Last Month</p>
                        <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          <p>{lastMonth.count} txns</p>
                          <p>{lastMonth.requests} requests</p>
                          <p>{lastMonth.issued} issued</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Inventory Value tab ── */}
        <TabsContent value="inventory-value" className="space-y-4">
          {/* Total value stat */}
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              {invValueLoading ? (
                <Skeleton className="h-10 w-48" />
              ) : (
                <div className="flex items-center gap-3">
                  <DollarSign className="size-8 text-amber-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {formatCurrency(invValue?.totalValue ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Inventory Value</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category bar chart */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Value by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {invValueLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : !invValue || invValue.byCategory.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={invValue.byCategory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis
                      dataKey="category"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={{ stroke: 'var(--border)' }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={{ stroke: 'var(--border)' }}
                      tickFormatter={(val) => `₹${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                    />
                    <RechartsTooltip
                      {...tooltipStyle}
                      formatter={(val: number) => [formatCurrency(val), 'Total Value']}
                    />
                    <Bar dataKey="totalValue" radius={[4, 4, 0, 0]}>
                      {invValue.byCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Category table */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {invValueLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !invValue || invValue.byCategory.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">No data</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Category</th>
                        <th className="pb-2 pr-4 font-medium text-right">Items</th>
                        <th className="pb-2 pr-4 font-medium text-right">Total Stock</th>
                        <th className="pb-2 font-medium text-right">Total Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invValue.byCategory.map((row) => (
                        <tr key={row.category} className="border-b border-border/20 last:border-0">
                          <td className="py-2 pr-4 font-medium">{row.category}</td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">{row.itemCount}</td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">{row.totalStock.toLocaleString()}</td>
                          <td className="py-2 text-right font-semibold">{formatCurrency(row.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── User Activity tab ── */}
        <TabsContent value="user-activity" className="space-y-4">
          {/* Period selector */}
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                variant={activityDays === d ? 'default' : 'outline'}
                size="sm"
                className={activityDays === d ? 'bg-primary text-primary-foreground hover:bg-primary/90 rounded-full' : 'rounded-full'}
                onClick={() => setActivityDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>

          {/* Bar chart */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Actions per User</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : !userActivity || userActivity.users.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  No activity in this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={userActivity.users} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis
                      dataKey="userName"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={{ stroke: 'var(--border)' }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={{ stroke: 'var(--border)' }}
                    />
                    <RechartsTooltip {...tooltipStyle} formatter={(val: number) => [val, 'Actions']} />
                    <Bar dataKey="actionCount" radius={[4, 4, 0, 0]}>
                      {userActivity.users.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* User table */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">User Breakdown</CardTitle>
              {userActivity && (
                <Badge variant="outline" className="text-xs border-border/40 text-muted-foreground">
                  {userActivity.totalActions} total actions
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !userActivity || userActivity.users.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">No data</div>
              ) : (
                <ScrollArea className="max-h-[320px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">User</th>
                        <th className="pb-2 pr-4 font-medium text-right">Total Actions</th>
                        <th className="pb-2 font-medium">Top Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userActivity.users.map((row) => {
                        const topActions = Object.entries(row.actions)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 3)
                        return (
                          <tr key={row.userName} className="border-b border-border/20 last:border-0">
                            <td className="py-2 pr-4 font-medium">{row.userName}</td>
                            <td className="py-2 pr-4 text-right font-semibold">{row.actionCount}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                {topActions.map(([action, count]) => (
                                  <span key={action} className="rounded bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {action} ({count})
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Item Flow tab ── */}
        <TabsContent value="item-flow" className="space-y-4">
          {/* Period selector */}
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                variant={flowDays === d ? 'default' : 'outline'}
                size="sm"
                className={flowDays === d ? 'bg-primary text-primary-foreground hover:bg-primary/90 rounded-full' : 'rounded-full'}
                onClick={() => setFlowDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total IN', value: itemFlow?.totalIn ?? 0, color: 'text-emerald-500' },
              { label: 'Total OUT', value: itemFlow?.totalOut ?? 0, color: 'text-rose-500' },
              { label: 'Net', value: (itemFlow?.totalIn ?? 0) - (itemFlow?.totalOut ?? 0), color: 'text-foreground' },
            ].map(({ label, value, color }) => (
              <Card key={label} className="border-border bg-card">
                <CardContent className="pt-4 pb-4 text-center">
                  {flowLoading ? (
                    <Skeleton className="mx-auto h-8 w-20" />
                  ) : (
                    <>
                      <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Daily flow chart */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily Flow</CardTitle>
            </CardHeader>
            <CardContent>
              {flowLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : !itemFlow || itemFlow.daily.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  No transactions in this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={itemFlow.daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={{ stroke: 'var(--border)' }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={{ stroke: 'var(--border)' }}
                    />
                    <RechartsTooltip {...tooltipStyle} />
                    <Bar dataKey="inQty" name="IN" fill="#10b981" radius={[4, 4, 0, 0]} stackId="flow" />
                    <Bar dataKey="outQty" name="OUT" fill="#f43f5e" radius={[4, 4, 0, 0]} stackId="flow" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top items by flow */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Items by Flow Volume</CardTitle>
            </CardHeader>
            <CardContent>
              {flowLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !itemFlow || itemFlow.byItem.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">No data</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Item</th>
                      <th className="pb-2 pr-4 font-medium text-right">IN</th>
                      <th className="pb-2 pr-4 font-medium text-right">OUT</th>
                      <th className="pb-2 font-medium text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemFlow.byItem.map((row) => (
                      <tr key={row.itemName} className="border-b border-border/20 last:border-0">
                        <td className="py-2 pr-4 font-medium">{row.itemName}</td>
                        <td className="py-2 pr-4 text-right text-emerald-500">{row.totalIn.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right text-rose-500">{row.totalOut.toLocaleString()}</td>
                        <td className={`py-2 text-right font-semibold ${row.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {row.net >= 0 ? '+' : ''}{row.net.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
