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
  CheckCircle2,
  DollarSign,
  Users,
  ArrowLeftRight,
  FileDown,
  Activity,
  History,
  Calendar,
  FileText,
  RefreshCw,
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

type DailyOperationsReport = {
  reportDate: string
  generatedAt: string
  summary: Record<string, number>
  urgentActions: Array<{ severity: string; area: string; title: string; detail: string }>
  stockRiskItems: Array<{ id: string; name: string; category: string; unit: string; available: number; minStock: number; shortageQty: number; severity: string }>
  pendingRequests: Array<{ id: string; requestNumber: string; employee: string; department: string; status: string; priority: string; requestedQty: number; issuedQty: number; ageInDays: number }>
  purchaseOrders: Array<{ id: string; poNumber: string; supplierName: string; status: string; totalAmount: number; expectedDeliveryDate?: string | null; pendingQty: number; ageInDays: number; overdue: boolean }>
  dailyProcurement: Array<{ id: string; batchNumber: string; status: string; deliveryDate: string; deliveryTimeSlot?: string | null; departmentName?: string | null; finalPurchaseQty: number; openLines: number; activeConversations: number; unreadVendorMessages: number }>
  whatsappFailures: Array<{ id: string; phone: string; messageType: string; error?: string | null; updatedAt: string }>
  topConsumedItems: Array<{ itemId: string; itemName: string; qty: number; transactions: number }>
}

export default function ReportingView() {
  const flags = useAppStore((s) => s.flags)
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [deptView, setDeptView] = useState<'qty' | 'spending'>('qty')
  const [deptData, setDeptData] = useState<DeptConsumption[]>([])
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [stockoutRisk, setStockoutRisk] = useState<StockoutRiskItem[]>([])
  const [periodComp, setPeriodComp] = useState<PeriodComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [dailyOps, setDailyOps] = useState<DailyOperationsReport | null>(null)
  const [dailyOpsLoading, setDailyOpsLoading] = useState(false)

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

  const [histData, setHistData] = useState<{ totalQuantity: number; totalSpent: number; deptConsumption: any[]; topItems: any[] } | null>(null)
  const [histLoading, setHistLoading] = useState(false)

  // Machine Consumption Report states
  const [machineData, setMachineData] = useState<any[]>([])
  const [machineLoading, setMachineLoading] = useState(false)
  const [machineLoaded, setMachineLoaded] = useState(false)

  // Requisitions Aging Tracker states
  const [agingData, setAgingData] = useState<any[]>([])
  const [agingLoading, setAgingLoading] = useState(false)
  const [agingLoaded, setAgingLoaded] = useState(false)

  // Pending POs & Delivery states
  const [poTrackingData, setPoTrackingData] = useState<any[]>([])
  const [poTrackingLoading, setPoTrackingLoading] = useState(false)
  const [poTrackingLoaded, setPoTrackingLoaded] = useState(false)

  // Sourcing History states
  const [sourcingData, setSourcingData] = useState<any[]>([])
  const [sourcingLoading, setSourcingLoading] = useState(false)
  const [sourcingLoaded, setSourcingLoaded] = useState(false)

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

  const fetchDailyOperations = useCallback(async () => {
    try {
      setDailyOpsLoading(true)
      const data = await api.reporting.dailyOperations()
      setDailyOps(data)
    } catch {
      toast.error('Failed to load daily operations report')
    } finally {
      setDailyOpsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (reportingEnabled) fetchDailyOperations()
  }, [fetchDailyOperations, reportingEnabled])

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

  const fetchHistorical = useCallback(async () => {
    try {
      setHistLoading(true)
      const data = await api.reporting.historicalConsumption()
      setHistData(data)
    } catch {
      toast.error('Failed to load historical consumption data')
    } finally {
      setHistLoading(false)
    }
  }, [])

  const fetchMachineConsumption = useCallback(async () => {
    try {
      setMachineLoading(true)
      const res = await api.reporting.machineConsumption()
      setMachineData(res.consumption)
      setMachineLoaded(true)
    } catch {
      toast.error('Failed to load machine consumption report')
    } finally {
      setMachineLoading(false)
    }
  }, [])

  const fetchRequisitionsAging = useCallback(async () => {
    try {
      setAgingLoading(true)
      const res = await api.reporting.requisitionsAging()
      setAgingData(res.requisitions)
      setAgingLoaded(true)
    } catch {
      toast.error('Failed to load requisitions aging report')
    } finally {
      setAgingLoading(false)
    }
  }, [])

  const fetchPOTracking = useCallback(async () => {
    try {
      setPoTrackingLoading(true)
      const res = await api.reporting.purchaseOrdersTracking()
      setPoTrackingData(res.purchaseOrders)
      setPoTrackingLoaded(true)
    } catch {
      toast.error('Failed to load purchase orders tracking report')
    } finally {
      setPoTrackingLoading(false)
    }
  }, [])

  const fetchSourcingHistory = useCallback(async () => {
    try {
      setSourcingLoading(true)
      const res = await api.reporting.sourcingHistory()
      setSourcingData(res.sourcingHistory)
      setSourcingLoaded(true)
    } catch {
      toast.error('Failed to load sourcing history report')
    } finally {
      setSourcingLoading(false)
    }
  }, [])

  const exportToCSV = (data: any[], headers: string[], filename: string) => {
    if (!data || data.length === 0) {
      toast.error('No data to export')
      return
    }
    const csvRows: string[] = []
    csvRows.push(headers.join(','))
    
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header]
        const escaped = ('' + (val ?? '')).replace(/"/g, '""')
        return `"${escaped}"`
      })
      csvRows.push(values.join(','))
    }
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportPOTracking = () => {
    const flatData = poTrackingData.flatMap(po => 
      po.items.map((pi: any) => ({
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        status: po.status,
        createdAt: new Date(po.createdAt).toLocaleDateString(),
        expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString() : 'N/A',
        ageInDays: po.ageInDays,
        totalAmount: po.totalAmount,
        itemName: pi.itemName,
        orderedQty: pi.orderedQty,
        receivedQty: pi.receivedQty,
        pendingQty: pi.pendingQty,
        unit: pi.unit,
        unitPrice: pi.unitPrice
      }))
    )
    exportToCSV(
      flatData,
      ['poNumber', 'supplierName', 'status', 'createdAt', 'expectedDeliveryDate', 'ageInDays', 'totalAmount', 'itemName', 'orderedQty', 'receivedQty', 'pendingQty', 'unit', 'unitPrice'],
      'purchase_orders_delivery_tracking'
    )
  }

  const handleExportDailyOperations = () => {
    if (!dailyOps) {
      toast.error('Daily operations report is not loaded')
      return
    }

    const rows = [
      ...dailyOps.urgentActions.map((row) => ({
        section: 'Urgent Action',
        name: row.title,
        status: row.severity,
        metric: row.area,
        detail: row.detail,
      })),
      ...dailyOps.stockRiskItems.map((row) => ({
        section: 'Stock Risk',
        name: row.name,
        status: row.severity,
        metric: `${row.available} ${row.unit} available`,
        detail: `${row.shortageQty} ${row.unit} below minimum stock`,
      })),
      ...dailyOps.pendingRequests.map((row) => ({
        section: 'Pending Requisition',
        name: row.requestNumber,
        status: row.status,
        metric: `${row.ageInDays} days`,
        detail: `${row.employee} / ${row.department} / ${row.requestedQty - row.issuedQty} pending qty`,
      })),
      ...dailyOps.purchaseOrders.map((row) => ({
        section: 'Purchase Order',
        name: row.poNumber,
        status: row.status,
        metric: row.overdue ? 'Overdue' : `${row.ageInDays} days`,
        detail: `${row.supplierName} / pending qty ${row.pendingQty} / value ${row.totalAmount}`,
      })),
      ...dailyOps.topConsumedItems.map((row) => ({
        section: 'Top Consumption',
        name: row.itemName,
        status: 'OUT',
        metric: `${row.qty}`,
        detail: `${row.transactions} transaction(s) today`,
      })),
    ]

    exportToCSV(rows, ['section', 'name', 'status', 'metric', 'detail'], `daily_operations_${dailyOps.reportDate}`)
  }

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
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1 bg-muted/30 p-1">
          <TabsTrigger value="overview">
            <BarChart3 className="size-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="daily-operations" onClick={fetchDailyOperations}>
            <FileText className="size-3.5 mr-1.5" />
            Daily Ops
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
          <TabsTrigger value="machine-consumption" onClick={() => { if (!machineLoaded) fetchMachineConsumption() }}>
            <Activity className="size-3.5 mr-1.5" />
            Machine Consumption
          </TabsTrigger>
          <TabsTrigger value="requisitions-aging" onClick={() => { if (!agingLoaded) fetchRequisitionsAging() }}>
            <Clock className="size-3.5 mr-1.5" />
            Requisitions Aging
          </TabsTrigger>
          <TabsTrigger value="po-tracking" onClick={() => { if (!poTrackingLoaded) fetchPOTracking() }}>
            <Calendar className="size-3.5 mr-1.5" />
            PO & Delivery
          </TabsTrigger>
          <TabsTrigger value="sourcing-history" onClick={() => { if (!sourcingLoaded) fetchSourcingHistory() }}>
            <History className="size-3.5 mr-1.5" />
            Sourcing History
          </TabsTrigger>
          <TabsTrigger value="historical" onClick={fetchHistorical}>
            <Clock className="size-3.5 mr-1.5" />
            Historical Seeding
          </TabsTrigger>
        </TabsList>

        {/* Daily Operations tab */}
        <TabsContent value="daily-operations" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  Daily Operations Report
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  One-page summary for stock risk, requisitions, purchase orders, daily procurement, and WhatsApp queue health.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={fetchDailyOperations} disabled={dailyOpsLoading} className="gap-1.5">
                  <RefreshCw className={`size-3.5 ${dailyOpsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportDailyOperations} disabled={!dailyOps || dailyOpsLoading} className="gap-1.5">
                  <FileDown className="size-3.5" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {dailyOpsLoading && !dailyOps ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)}
                </div>
              ) : !dailyOps ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="mb-2 size-8 opacity-30" />
                  <p className="text-sm">Daily operations report is not loaded.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                    <span>Report date: <span className="font-semibold text-foreground">{dailyOps.reportDate}</span></span>
                    <span>Generated: <span className="font-semibold text-foreground">{new Date(dailyOps.generatedAt).toLocaleString()}</span></span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                    {[
                      ['Stock Risk', dailyOps.summary.stockRiskCount, 'items need attention'],
                      ['Out of Stock', dailyOps.summary.outOfStockCount, 'critical stockouts'],
                      ['Pending SR', dailyOps.summary.pendingRequests, 'open requisitions'],
                      ['Open PO', dailyOps.summary.openPurchaseOrders, 'purchase orders'],
                      ['Overdue PO', dailyOps.summary.overduePurchaseOrders, 'supplier follow-up'],
                      ['Vendor Replies', dailyOps.summary.pendingVendorReplies, 'pending/review'],
                      ['GRN Today', dailyOps.summary.goodsReceiptsToday, 'receipts posted'],
                      ['WA Failed', dailyOps.summary.whatsappFailed, 'message failures'],
                    ].map(([label, value, hint]) => (
                      <div key={label} className="rounded-xl border border-border/50 bg-background/60 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                        <p className="mt-1 text-2xl font-extrabold text-foreground">{value}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="border-border/60 bg-muted/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className="size-4 text-amber-500" />
                          Urgent Actions
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {dailyOps.urgentActions.length === 0 ? (
                          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-3 text-sm text-emerald-600">
                            <CheckCircle2 className="size-4" />
                            No urgent blockers detected.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {dailyOps.urgentActions.map((action, index) => (
                              <div key={`${action.area}-${index}`} className="rounded-lg border border-border/50 bg-background/70 p-3">
                                <Badge className={action.severity === 'critical' ? 'bg-rose-500/15 text-rose-600 border-rose-500/30' : 'bg-amber-500/15 text-amber-600 border-amber-500/30'}>
                                  {action.area}
                                </Badge>
                                <p className="mt-2 text-sm font-semibold">{action.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{action.detail}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-border/60 bg-muted/5 xl:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Top Stock Risk</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {dailyOps.stockRiskItems.length === 0 ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">No stock risk items found.</p>
                        ) : (
                          <div className="overflow-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                                  <th className="pb-2 pr-4 font-medium">Item</th>
                                  <th className="pb-2 pr-4 font-medium">Category</th>
                                  <th className="pb-2 pr-4 font-medium text-right">Available</th>
                                  <th className="pb-2 pr-4 font-medium text-right">Min</th>
                                  <th className="pb-2 font-medium">Risk</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dailyOps.stockRiskItems.slice(0, 8).map((item) => (
                                  <tr key={item.id} className="border-b border-border/20 last:border-0">
                                    <td className="py-2.5 pr-4 font-semibold">{item.name}</td>
                                    <td className="py-2.5 pr-4 text-muted-foreground">{item.category}</td>
                                    <td className="py-2.5 pr-4 text-right">{item.available} {item.unit}</td>
                                    <td className="py-2.5 pr-4 text-right">{item.minStock} {item.unit}</td>
                                    <td className="py-2.5">
                                      <Badge className={item.severity === 'critical' ? 'bg-rose-500/15 text-rose-600 border-rose-500/30' : 'bg-amber-500/15 text-amber-600 border-amber-500/30'}>
                                        {item.severity}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <Card className="border-border/60 bg-muted/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Pending Requisitions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {dailyOps.pendingRequests.length === 0 ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">No pending requisitions.</p>
                        ) : (
                          <div className="space-y-2">
                            {dailyOps.pendingRequests.slice(0, 6).map((request) => (
                              <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/70 p-3">
                                <div>
                                  <p className="text-sm font-semibold">{request.requestNumber}</p>
                                  <p className="text-xs text-muted-foreground">{request.employee} / {request.department}</p>
                                </div>
                                <div className="text-right">
                                  <Badge variant="outline" className="text-[10px]">{request.status}</Badge>
                                  <p className="mt-1 text-[10px] text-muted-foreground">{request.ageInDays} day(s) old</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-border/60 bg-muted/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">PO & Supplier Follow-up</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {dailyOps.purchaseOrders.length === 0 ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">No open purchase orders.</p>
                        ) : (
                          <div className="space-y-2">
                            {dailyOps.purchaseOrders.slice(0, 6).map((po) => (
                              <div key={po.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/70 p-3">
                                <div>
                                  <p className="text-sm font-semibold">{po.poNumber}</p>
                                  <p className="text-xs text-muted-foreground">{po.supplierName} / pending {po.pendingQty}</p>
                                </div>
                                <div className="text-right">
                                  <Badge className={po.overdue ? 'bg-rose-500/15 text-rose-600 border-rose-500/30' : 'bg-sky-500/15 text-sky-600 border-sky-500/30'}>
                                    {po.overdue ? 'Overdue' : po.status}
                                  </Badge>
                                  <p className="mt-1 text-[10px] text-muted-foreground">{formatCurrency(po.totalAmount)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overview tab */}
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
                  <div className="max-h-[320px] overflow-y-auto pr-2">
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
                  </div>
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
                <div className="max-h-[320px] overflow-y-auto pr-2">
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
                </div>
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

        <TabsContent value="historical" className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="pt-6">
                {histLoading ? (
                  <Skeleton className="h-10 w-48" />
                ) : (
                  <div className="flex items-center gap-3">
                    <TrendingUp className="size-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {(histData?.totalQuantity ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Quantity Consumed (Seeded)</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="pt-6">
                {histLoading ? (
                  <Skeleton className="h-10 w-48" />
                ) : (
                  <div className="flex items-center gap-3">
                    <DollarSign className="size-8 text-emerald-500" />
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {formatCurrency(histData?.totalSpent ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Consumption Value (Seeded)</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Department Consumption */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Historical Department Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {histLoading ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : !histData || histData.deptConsumption.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                    No historical department data seeded
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={histData.deptConsumption} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis
                        dataKey="department"
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
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
                        formatter={(val: number) => [formatCurrency(val), 'Value Spent']}
                      />
                      <Bar dataKey="spending" radius={[4, 4, 0, 0]}>
                        {histData.deptConsumption.map((_, index) => (
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
                <CardTitle className="text-base">Top Seeded Consumed Items</CardTitle>
              </CardHeader>
              <CardContent>
                {histLoading ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : !histData || histData.topItems.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                    No historical item data seeded
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart layout="vertical" data={histData.topItems} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={{ stroke: 'var(--border)' }}
                        width={120}
                      />
                      <RechartsTooltip {...tooltipStyle} />
                      <Bar dataKey="qty" radius={[0, 4, 4, 0]} fill="#fb923c" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Machine Consumption Tab Content ── */}
        <TabsContent value="machine-consumption" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="size-4 text-primary animate-pulse" />
                Machine & Cost Center Consumption Analysis
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCSV(
                  machineData,
                  ['machine', 'department', 'itemName', 'category', 'totalQty', 'unit', 'totalSpent', 'lastIssued'],
                  'machine_consumption_report'
                )}
                disabled={machineLoading || machineData.length === 0}
                className="gap-1.5"
              >
                <FileDown className="size-3.5" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {machineLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : machineData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground italic">
                  <Activity className="mb-2 size-8 opacity-30" />
                  No machine consumption data found.
                </div>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground sticky top-0 bg-card">
                        <th className="pb-2 pr-4 font-medium">Machine / Cost Center</th>
                        <th className="pb-2 pr-4 font-medium">Department</th>
                        <th className="pb-2 pr-4 font-medium">Item Name</th>
                        <th className="pb-2 pr-4 font-medium">Category</th>
                        <th className="pb-2 pr-4 font-medium text-right">Qty Consumed</th>
                        <th className="pb-2 pr-4 font-medium text-right">Total Cost</th>
                        <th className="pb-2 font-medium">Last Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {machineData.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/20 last:border-0 hover:bg-muted/5">
                          <td className="py-2.5 pr-4 font-semibold text-primary">{row.machine}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{row.department}</td>
                          <td className="py-2.5 pr-4 font-medium">{row.itemName}</td>
                          <td className="py-2.5 pr-4">
                            <Badge variant="outline" className="text-[10px] bg-muted/10">{row.category}</Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-right font-medium">{row.totalQty} {row.unit}</td>
                          <td className="py-2.5 pr-4 text-right font-bold text-amber-600">₹{row.totalSpent.toLocaleString()}</td>
                          <td className="py-2.5 text-xs text-muted-foreground">{new Date(row.lastIssued).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Requisitions Aging Tab Content ── */}
        <TabsContent value="requisitions-aging" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                Pending Requisitions Aging Tracker
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCSV(
                  agingData,
                  ['requestNumber', 'employee', 'department', 'machine', 'createdAt', 'ageInDays', 'status', 'totalItemsRequested', 'totalItemsIssued', 'estimatedValue', 'priority'],
                  'requisitions_aging_report'
                )}
                disabled={agingLoading || agingData.length === 0}
                className="gap-1.5"
              >
                <FileDown className="size-3.5" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {agingLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : agingData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground italic">
                  <Check className="mb-2 size-8 text-emerald-500" />
                  All requisitions are fully processed. No pending requests.
                </div>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground sticky top-0 bg-card">
                        <th className="pb-2 pr-4 font-medium">Requisition No.</th>
                        <th className="pb-2 pr-4 font-medium">Age</th>
                        <th className="pb-2 pr-4 font-medium">Employee</th>
                        <th className="pb-2 pr-4 font-medium">Dept / Machine</th>
                        <th className="pb-2 pr-4 font-medium">Priority</th>
                        <th className="pb-2 pr-4 font-medium text-right">Items (Req / Iss)</th>
                        <th className="pb-2 pr-4 font-medium text-right">Est. Value</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.map((row) => {
                        let ageColor = 'text-emerald-500'
                        let ageBg = 'bg-emerald-500/10'
                        if (row.ageInDays >= 14) {
                          ageColor = 'text-rose-500'
                          ageBg = 'bg-rose-500/10'
                        } else if (row.ageInDays >= 7) {
                          ageColor = 'text-orange-500'
                          ageBg = 'bg-orange-500/10'
                        } else if (row.ageInDays >= 3) {
                          ageColor = 'text-amber-500'
                          ageBg = 'bg-amber-500/10'
                        }
                        return (
                          <tr key={row.id} className="border-b border-border/20 last:border-0 hover:bg-muted/5">
                            <td className="py-2.5 pr-4 font-semibold text-primary">{row.requestNumber}</td>
                            <td className="py-2.5 pr-4">
                              <Badge className={`text-xs ${ageBg} ${ageColor} border-0`}>
                                {row.ageInDays} days
                              </Badge>
                            </td>
                            <td className="py-2.5 pr-4 font-medium">{row.employee}</td>
                            <td className="py-2.5 pr-4 text-xs">
                              <span className="font-semibold text-muted-foreground">{row.department}</span>
                              {row.machine && row.machine !== 'N/A' && (
                                <span className="block text-[10px] text-amber-600 font-semibold">{row.machine}</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4">
                              <Badge variant="outline" className={`text-[10px] ${row.priority === 'HIGH' || row.priority === 'CRITICAL' ? 'border-rose-500 text-rose-500 bg-rose-500/5' : 'text-muted-foreground'}`}>
                                {row.priority}
                              </Badge>
                            </td>
                            <td className="py-2.5 pr-4 text-right text-xs">
                              <span className="font-semibold">{row.totalItemsRequested}</span>
                              <span className="text-muted-foreground"> / {row.totalItemsIssued}</span>
                            </td>
                            <td className="py-2.5 pr-4 text-right font-bold text-amber-600">₹{row.estimatedValue.toLocaleString()}</td>
                            <td className="py-2.5 text-xs font-medium">{row.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PO & Delivery Tracking Tab Content ── */}
        <TabsContent value="po-tracking" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                Pending Purchase Orders & Delivery Tracker
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPOTracking}
                disabled={poTrackingLoading || poTrackingData.length === 0}
                className="gap-1.5"
              >
                <FileDown className="size-3.5" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {poTrackingLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : poTrackingData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground italic">
                  <Check className="mb-2 size-8 text-emerald-500" />
                  No pending Purchase Orders. All orders are closed or received.
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {poTrackingData.map((po) => (
                    <div key={po.id} className="rounded-xl border border-border bg-muted/5 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-primary">{po.poNumber}</span>
                            <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">{po.status}</Badge>
                          </div>
                          <p className="text-xs font-semibold text-muted-foreground">Supplier: <span className="text-foreground">{po.supplierName}</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-amber-600">₹{po.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                          <p className="text-[10px] text-muted-foreground">Age: {po.ageInDays} days · Expected: {po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString() : 'N/A'}</p>
                        </div>
                      </div>
                      
                      <div className="overflow-x-auto rounded-lg border border-border/30">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/10">
                            <tr className="border-b border-border/20 text-left text-muted-foreground">
                              <th className="p-2 font-medium">Item Name</th>
                              <th className="p-2 font-medium text-right">Ordered Qty</th>
                              <th className="p-2 font-medium text-right">Received Qty</th>
                              <th className="p-2 font-medium text-right">Pending Delivery</th>
                              <th className="p-2 font-medium text-right">Unit Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map((pi: any, itemIdx: number) => (
                              <tr key={itemIdx} className="border-b border-border/10 last:border-0 hover:bg-muted/10">
                                <td className="p-2 font-medium">{pi.itemName}</td>
                                <td className="p-2 text-right">{pi.orderedQty} {pi.unit}</td>
                                <td className="p-2 text-right text-emerald-500 font-medium">{pi.receivedQty} {pi.unit}</td>
                                <td className={`p-2 text-right font-bold ${pi.pendingQty > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                  {pi.pendingQty} {pi.unit}
                                </td>
                                <td className="p-2 text-right font-medium">₹{pi.unitPrice}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sourcing History Tab Content ── */}
        <TabsContent value="sourcing-history" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="size-4 text-primary" />
                Sourcing Purchase History & Rates Analytics
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCSV(
                  sourcingData,
                  ['itemCode', 'itemName', 'category', 'preferredSupplier', 'lastPurchaseRate', 'avgPurchaseRate', 'totalQtyOrdered', 'unit', 'lastPurchaseDate'],
                  'sourcing_purchase_history'
                )}
                disabled={sourcingLoading || sourcingData.length === 0}
                className="gap-1.5"
              >
                <FileDown className="size-3.5" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {sourcingLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : sourcingData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground italic">
                  <History className="mb-2 size-8 opacity-30" />
                  No purchase history available. Purchase orders must be approved first.
                </div>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-xs text-muted-foreground sticky top-0 bg-card">
                        <th className="pb-2 pr-4 font-medium">Item Code</th>
                        <th className="pb-2 pr-4 font-medium">Item Name</th>
                        <th className="pb-2 pr-4 font-medium">Category</th>
                        <th className="pb-2 pr-4 font-medium">Preferred/Last Supplier</th>
                        <th className="pb-2 pr-4 font-medium text-right">Last Price</th>
                        <th className="pb-2 pr-4 font-medium text-right">Avg Price</th>
                        <th className="pb-2 pr-4 font-medium text-right">Total Ordered</th>
                        <th className="pb-2 font-medium">Last Purchase Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourcingData.map((row) => (
                        <tr key={row.itemId} className="border-b border-border/20 last:border-0 hover:bg-muted/5">
                          <td className="py-2.5 pr-4 font-semibold text-muted-foreground text-xs">{row.itemCode}</td>
                          <td className="py-2.5 pr-4 font-bold text-foreground">{row.itemName}</td>
                          <td className="py-2.5 pr-4">
                            <Badge variant="outline" className="text-[10px] bg-muted/10">{row.category}</Badge>
                          </td>
                          <td className="py-2.5 pr-4 font-medium text-muted-foreground">{row.preferredSupplier}</td>
                          <td className="py-2.5 pr-4 text-right font-extrabold text-foreground">₹{row.lastPurchaseRate.toLocaleString()}</td>
                          <td className="py-2.5 pr-4 text-right font-bold text-amber-600">₹{row.avgPurchaseRate.toLocaleString()}</td>
                          <td className="py-2.5 pr-4 text-right font-medium">{row.totalQtyOrdered} {row.unit}</td>
                          <td className="py-2.5 text-xs text-muted-foreground">{new Date(row.lastPurchaseDate).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
