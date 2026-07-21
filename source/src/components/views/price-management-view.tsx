'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, BarChart3, Building, Calendar, Check,
  ChevronRight, DollarSign, Download, FileSpreadsheet, Filter, HelpCircle,
  History, Info, Layers, Loader2, Plus, RefreshCw, Save, Search, ShoppingBag,
  TrendingDown, TrendingUp, UploadCloud, AlertCircle, CheckCircle2, X
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { requestJson } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type PriceTransaction = {
  id: string
  itemId: string
  categoryId?: string | null
  unitId?: string | null
  supplierId?: string | null
  transactionDate: string
  rate: number
  quantity: number
  lineAmount: number
  gstRate: number
  taxAmount: number
  grossAmount: number
  grossRate: number
  invoiceNumber?: string | null
  notes?: string | null
  sourceType: string
  originalItemText?: string | null
  item?: { id: string; name: string; category: string; unit: string } | null
  supplier?: { id: string; name: string } | null
}

type ItemSummary = {
  itemId: string
  itemName: string
  category: string
  unit: string
  firstRate: number
  lastRate: number
  minRate: number
  maxRate: number
  minGrossRate: number
  maxGrossRate: number
  simpleAvgRate: number
  simpleAvgGrossRate: number
  weightedAvgRate: number
  weightedAvgGrossRate: number
  totalQty: number
  totalSpendBase: number
  totalSpendGross: number
  purchaseCount: number
  supplierCount: number
  trend: 'Rising' | 'Slight Rise' | 'Stable' | 'Falling' | 'Dropping' | '—'
  deltaPercentage: number | null
  deltaAmount: number | null
}

type CategorySpending = {
  grandTotalSpend: number
  categoryReports: Array<{
    category: string
    itemsCount: number
    totalQty: number
    totalSpend: number
    percentOfBudget: number
    topItemName: string
    topItemSpend: number
    avgRate: number
  }>
  top10Items: ItemSummary[]
}

export default function PriceManagementView() {
  const [activeTab, setActiveTab] = useState('summary')
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<PriceTransaction[]>([])
  const [itemSummaries, setItemSummaries] = useState<ItemSummary[]>([])
  const [categorySpending, setCategorySpending] = useState<CategorySpending | null>(null)
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-03')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Add Transaction Modal
  const [addOpen, setAddOpen] = useState(false)
  const [activeItems, setActiveItems] = useState<Array<{ id: string; name: string; category: string; unit: string }>>([])
  const [activeSuppliers, setActiveSuppliers] = useState<Array<{ id: string; name: string }>>([])
  const [newTx, setNewTx] = useState({
    itemId: '',
    supplierId: '',
    transactionDate: new Date().toISOString().split('T')[0],
    rate: '',
    quantity: '',
    gstRate: '0',
    invoiceNumber: '',
    notes: ''
  })
  const [busy, setBusy] = useState(false)

  // Excel Import Wizard State
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<{
    totalRows: number
    mappedRows: number
    unmappedRowsCount: number
    unmappedItems: string[]
    parsedRows: Array<Record<string, unknown>>
    availableDbItems: Array<{ id: string; name: string; category: string; unit: string }>
  } | null>(null)
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [txData, summaryData, itemsData, suppliersData] = await Promise.all([
        requestJson<{ transactions: PriceTransaction[] }>(`/api/price-management/transactions?limit=1000`),
        requestJson<{ itemSummaries: ItemSummary[]; categorySpending: CategorySpending }>(`/api/price-management/summary?month=${selectedMonth}&category=${categoryFilter}`),
        requestJson<{ items: Array<{ id: string; name: string; category: string; unit: string }> }>('/api/items'),
        requestJson<{ suppliers: Array<{ id: string; name: string }> }>('/api/suppliers')
      ])
      setTransactions(txData.transactions || [])
      setItemSummaries(summaryData.itemSummaries || [])
      setCategorySpending(summaryData.categorySpending || null)
      setActiveItems(itemsData.items || [])
      setActiveSuppliers(suppliersData.suppliers || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load price management data')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, categoryFilter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleAddTransaction = async () => {
    if (!newTx.itemId) return toast.error('Please select an item')
    if (!Number(newTx.rate) || Number(newTx.rate) <= 0) return toast.error('Please enter a valid rate')
    if (!Number(newTx.quantity) || Number(newTx.quantity) <= 0) return toast.error('Please enter a valid quantity')

    setBusy(true)
    try {
      await requestJson('/api/price-management/transactions', {
        method: 'POST',
        body: JSON.stringify({
          itemId: newTx.itemId,
          supplierId: newTx.supplierId || null,
          transactionDate: newTx.transactionDate,
          rate: Number(newTx.rate),
          quantity: Number(newTx.quantity),
          gstRate: Number(newTx.gstRate || 0),
          invoiceNumber: newTx.invoiceNumber || null,
          notes: newTx.notes || null
        })
      })
      toast.success('Price transaction saved')
      setAddOpen(false)
      setNewTx({ itemId: '', supplierId: '', transactionDate: new Date().toISOString().split('T')[0], rate: '', quantity: '', gstRate: '0', invoiceNumber: '', notes: '' })
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save transaction')
    } finally {
      setBusy(false)
    }
  }

  const handleFilePreview = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('action', 'PREVIEW')

      const res = await fetch('/api/price-management/import', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to preview file')
      }
      const data = await res.json()
      setImportPreview(data)
      setImportFile(file)
      toast.success(`Workbook parsed: ${data.totalRows} rows (${data.mappedRows} mapped, ${data.unmappedRowsCount} unmapped)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process Excel preview')
    } finally {
      setUploading(false)
    }
  }

  const handleCommitImport = async () => {
    if (!importFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('action', 'COMMIT')
      formData.append('mappings', JSON.stringify(manualMappings))

      const res = await fetch('/api/price-management/import', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to import records')
      }
      const data = await res.json()
      toast.success(`Successfully imported ${data.importedCount} price transactions!`)
      setImportFile(null)
      setImportPreview(null)
      setManualMappings({})
      await loadData()
      setActiveTab('summary')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setUploading(false)
    }
  }

  const filteredSummaries = itemSummaries.filter((s) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return s.itemName.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
  })

  const getTrendBadge = (trend: ItemSummary['trend'], deltaPct: number | null) => {
    switch (trend) {
      case 'Rising':
        return <Badge variant="destructive" className="font-medium flex items-center gap-1"><ArrowUpRight className="size-3" /> Rising (+{deltaPct}%)</Badge>
      case 'Slight Rise':
        return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium flex items-center gap-1"><TrendingUp className="size-3" /> Slight Rise (+{deltaPct}%)</Badge>
      case 'Stable':
        return <Badge variant="secondary" className="font-medium flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-500" /> Stable ({deltaPct ? `${deltaPct}%` : '0%'})</Badge>
      case 'Falling':
        return <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 font-medium flex items-center gap-1"><TrendingDown className="size-3" /> Falling ({deltaPct}%)</Badge>
      case 'Dropping':
        return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium flex items-center gap-1"><ArrowDownRight className="size-3" /> Dropping ({deltaPct}%)</Badge>
      default:
        return <Badge variant="outline" className="text-muted-foreground font-mono">—</Badge>
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="size-6 text-primary" />
            Grocery & Consumables Price Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Operational rate tracking, weighted average purchase rate analysis, and monthly spend reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px] font-medium">
              <Calendar className="size-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026-03">March 2026</SelectItem>
              <SelectItem value="2026-02">February 2026</SelectItem>
              <SelectItem value="2026-01">January 2026</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={cn('size-4 mr-1.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-1.5" />
            Log Purchase Rate
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Monthly Spend</CardTitle>
            <DollarSign className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{categorySpending?.grandTotalSpend ? categorySpending.grandTotalSpend.toLocaleString('en-IN') : '0'}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-emerald-500 font-medium font-mono">Gross Incl. 5% GST</span> across {itemSummaries.length} items
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priced Items</CardTitle>
            <ShoppingBag className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{itemSummaries.length} Items</div>
            <p className="text-xs text-muted-foreground mt-1">
              {transactions.length} total invoice entries recorded
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price Movements</CardTitle>
            <TrendingUp className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-emerald-600 flex items-center gap-0.5">
                <TrendingDown className="size-4" /> {itemSummaries.filter((s) => s.trend === 'Falling' || s.trend === 'Dropping').length} Cheaper
              </span>
              <span className="text-sm font-semibold text-destructive flex items-center gap-0.5">
                <TrendingUp className="size-4" /> {itemSummaries.filter((s) => s.trend === 'Rising' || s.trend === 'Slight Rise').length} Rose
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Comparing first vs last date in {selectedMonth}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Spend Category</CardTitle>
            <Layers className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">
              {categorySpending?.categoryReports[0]?.category || 'Grocery / Dry'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ₹{categorySpending?.categoryReports[0]?.totalSpend ? categorySpending.categoryReports[0].totalSpend.toLocaleString('en-IN') : '0'} ({categorySpending?.categoryReports[0]?.percentOfBudget || 0}% of budget)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Component */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto p-1 bg-muted/60 gap-1">
          <TabsTrigger value="summary" className="text-xs font-medium flex items-center gap-1.5">
            <BarChart3 className="size-3.5" /> Item Price Summary
          </TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs font-medium flex items-center gap-1.5">
            <History className="size-3.5" /> Purchase Log ({transactions.length})
          </TabsTrigger>
          <TabsTrigger value="comparison" className="text-xs font-medium flex items-center gap-1.5">
            <Calendar className="size-3.5" /> Period Comparison
          </TabsTrigger>
          <TabsTrigger value="category" className="text-xs font-medium flex items-center gap-1.5">
            <Layers className="size-3.5" /> Spending Summary
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs font-medium flex items-center gap-1.5">
            <FileSpreadsheet className="size-3.5" /> Excel Import Wizard
          </TabsTrigger>
        </TabsList>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card/40 p-3 rounded-lg border border-border/40">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search items by name or category..."
              className="pl-9 text-sm h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="size-4 text-muted-foreground hidden sm:inline" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] h-9 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="Vegetable">Vegetables</SelectItem>
                <SelectItem value="Grocery / Dry">Grocery / Dry</SelectItem>
                <SelectItem value="Dairy">Dairy</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tab 1: Item Price Summary */}
        <TabsContent value="summary" className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="py-4">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>Item Price Summary — March 2026</span>
                <span className="text-xs font-normal text-muted-foreground">End-of-Month Weighted & Simple Average Rates</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="p-3">Item</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3 text-right">Weighted Avg Rate</th>
                    <th className="p-3 text-right">Simple Avg Rate</th>
                    <th className="p-3 text-right">Min Rate</th>
                    <th className="p-3 text-right">Max Rate</th>
                    <th className="p-3 text-right">Total Qty</th>
                    <th className="p-3 text-right">Total Spend (₹)</th>
                    <th className="p-3 text-center">Price Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-muted-foreground">
                        <Loader2 className="size-6 animate-spin mx-auto mb-2" /> Loading item price summaries...
                      </td>
                    </tr>
                  ) : filteredSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-muted-foreground">
                        No item price data available for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredSummaries.map((s) => (
                      <tr key={s.itemId} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-semibold text-foreground">{s.itemName}</td>
                        <td className="p-3 text-muted-foreground">{s.category}</td>
                        <td className="p-3 font-mono">
                          <Badge variant="outline" className="text-[10px]">{s.unit}</Badge>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-primary">₹{s.weightedAvgGrossRate.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-muted-foreground">₹{s.simpleAvgGrossRate.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-muted-foreground">₹{s.minGrossRate.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-muted-foreground">₹{s.maxGrossRate.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono">{s.totalQty} {s.unit}</td>
                        <td className="p-3 text-right font-mono font-semibold">₹{s.totalSpendGross.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-center">{getTrendBadge(s.trend, s.deltaPercentage)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Purchase Log (Transactions) */}
        <TabsContent value="transactions" className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Purchase Log Transactions</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="size-3.5 mr-1" /> Add Entry
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="p-3">Date</th>
                    <th className="p-3">Item Name</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Base Rate</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-right">Gross Amount</th>
                    <th className="p-3">Supplier</th>
                    <th className="p-3">Invoice No</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-muted-foreground">
                        <Loader2 className="size-6 animate-spin mx-auto mb-2" /> Loading purchase log...
                      </td>
                    </tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-muted-foreground">
                        No purchase log transactions recorded yet. Click &quot;Add Entry&quot; or run Excel Import.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono">{t.transactionDate.split('T')[0]}</td>
                        <td className="p-3 font-semibold">{t.item?.name || t.originalItemText || 'Item'}</td>
                        <td className="p-3 font-mono">{t.item?.unit || t.unitId || 'pcs'}</td>
                        <td className="p-3 text-muted-foreground">{t.item?.category || t.categoryId || 'General'}</td>
                        <td className="p-3 text-right font-mono">₹{t.rate.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono">{t.quantity}</td>
                        <td className="p-3 text-right font-mono font-semibold">₹{t.grossAmount.toFixed(2)}</td>
                        <td className="p-3 text-muted-foreground">{t.supplier?.name || t.originalSupplierText || '—'}</td>
                        <td className="p-3 font-mono text-muted-foreground">{t.invoiceNumber || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Period Comparison */}
        <TabsContent value="comparison" className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="py-4">
              <CardTitle className="text-base font-semibold">Period Comparison — Weekly Rate Movement</CardTitle>
              <CardDescription className="text-xs">Rate changes across purchase dates in March 2026</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="p-3">Item</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">01 Mar 2026</th>
                    <th className="p-3 text-right">08 Mar 2026</th>
                    <th className="p-3 text-right">15 Mar 2026</th>
                    <th className="p-3 text-right">22 Mar 2026</th>
                    <th className="p-3 text-right">29 Mar 2026</th>
                    <th className="p-3 text-right">Monthly Avg</th>
                    <th className="p-3 text-center">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredSummaries.map((s) => (
                    <tr key={s.itemId} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-semibold">{s.itemName}</td>
                      <td className="p-3 text-muted-foreground">{s.category}</td>
                      <td className="p-3 text-right font-mono">₹{s.firstRate.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono">—</td>
                      <td className="p-3 text-right font-mono">—</td>
                      <td className="p-3 text-right font-mono">—</td>
                      <td className="p-3 text-right font-mono">₹{s.lastRate.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold text-primary">₹{s.weightedAvgGrossRate.toFixed(2)}</td>
                      <td className="p-3 text-center">{getTrendBadge(s.trend, s.deltaPercentage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Spending Summary */}
        <TabsContent value="category" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Category Breakdown Cards */}
            <Card className="lg:col-span-2 border-border/50">
              <CardHeader className="py-4">
                <CardTitle className="text-base font-semibold">Category Budget Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {categorySpending?.categoryReports.map((cat) => (
                  <div key={cat.category} className="p-4 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{cat.category}</span>
                      <Badge variant="outline" className="font-mono">{cat.percentOfBudget}% of budget</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Total Spend</span>
                        <span className="font-mono font-bold text-primary">₹{cat.totalSpend.toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Items Count</span>
                        <span className="font-semibold">{cat.itemsCount} Items</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Top Spend Item</span>
                        <span className="font-medium text-foreground truncate block">{cat.topItemName}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top 10 Items by Spend */}
            <Card className="border-border/50">
              <CardHeader className="py-4">
                <CardTitle className="text-base font-semibold">Top 10 Most Expensive Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/30 text-xs">
                  {categorySpending?.top10Items.map((item, idx) => (
                    <div key={item.itemId} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-bold block">{idx + 1}. {item.itemName}</span>
                        <span className="text-[10px] text-muted-foreground">{item.category} · {item.totalQty} {item.unit}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-primary block">₹{item.totalSpendGross.toLocaleString('en-IN')}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">₹{item.weightedAvgGrossRate.toFixed(2)} / {item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 5: Excel Import Wizard */}
        <TabsContent value="import" className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="py-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <UploadCloud className="size-5 text-primary" /> Excel Import Wizard (`Grocery_Price_Tracker_v3.xlsx`)
              </CardTitle>
              <CardDescription className="text-xs">
                Upload historical price tracker Excel workbooks. Unmapped items can be interactively assigned to Item Master records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="border-2 border-dashed border-border/70 rounded-xl p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors">
                <FileSpreadsheet className="size-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-bold text-sm mb-1">Select Excel Workbook</h3>
                <p className="text-xs text-muted-foreground mb-4">Upload `.xlsx` containing `Purchase Log` sheet</p>
                <input
                  type="file"
                  id="excel-file-input"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      void handleFilePreview(e.target.files[0])
                    }
                  }}
                />
                <Button size="sm" onClick={() => document.getElementById('excel-file-input')?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <UploadCloud className="size-4 mr-1.5" />}
                  Browse Workbook
                </Button>
              </div>

              {/* Import Preview Results */}
              {importPreview && (
                <div className="space-y-4 border-t border-border/40 pt-4">
                  <div className="flex items-center justify-between bg-card/60 p-4 rounded-lg border border-border/40">
                    <div>
                      <h4 className="font-bold text-sm flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-emerald-500" /> Workbook Preview Ready
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Total Rows: <span className="font-bold text-foreground">{importPreview.totalRows}</span> | Mapped: <span className="font-bold text-emerald-600">{importPreview.mappedRows}</span> | Unmapped: <span className="font-bold text-amber-600">{importPreview.unmappedRowsCount}</span>
                      </p>
                    </div>
                    <Button onClick={() => void handleCommitImport()} disabled={uploading}>
                      {uploading ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Save className="size-4 mr-1.5" />}
                      Import {importPreview.mappedRows} Transactions
                    </Button>
                  </div>

                  {/* Unmapped Items Review */}
                  {importPreview.unmappedItems.length > 0 && (
                    <Card className="border-amber-500/30 bg-amber-500/5">
                      <CardHeader className="py-3">
                        <CardTitle className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <AlertCircle className="size-4" /> Unmapped Items Resolution Required
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-xs">
                        {importPreview.unmappedItems.map((unmappedName) => (
                          <div key={unmappedName} className="flex items-center justify-between gap-4 p-2 rounded bg-background border border-border/40">
                            <span className="font-semibold text-foreground">{unmappedName}</span>
                            <Select
                              value={manualMappings[unmappedName] || ''}
                              onValueChange={(val) => setManualMappings((prev) => ({ ...prev, [unmappedName]: val }))}
                            >
                              <SelectTrigger className="w-[260px] h-8 text-xs">
                                <SelectValue placeholder="Assign to Item Master..." />
                              </SelectTrigger>
                              <SelectContent>
                                {importPreview.availableDbItems.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name} ({item.category})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manual Purchase Rate Entry Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Plus className="size-4 text-primary" /> Log Manual Purchase Rate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs font-semibold">Select Item Master *</Label>
              <Select value={newTx.itemId} onValueChange={(val) => setNewTx((prev) => ({ ...prev, itemId: val }))}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Choose Item..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {activeItems.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} ({i.category} · {i.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Base Rate (₹/unit) *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 70"
                  className="h-9 text-xs mt-1 font-mono"
                  value={newTx.rate}
                  onChange={(e) => setNewTx((prev) => ({ ...prev, rate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Quantity Purchased *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 15"
                  className="h-9 text-xs mt-1 font-mono"
                  value={newTx.quantity}
                  onChange={(e) => setNewTx((prev) => ({ ...prev, quantity: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Date</Label>
                <Input
                  type="date"
                  className="h-9 text-xs mt-1 font-mono"
                  value={newTx.transactionDate}
                  onChange={(e) => setNewTx((prev) => ({ ...prev, transactionDate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">GST Rate (%)</Label>
                <Select value={newTx.gstRate} onValueChange={(val) => setNewTx((prev) => ({ ...prev, gstRate: val }))}>
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue placeholder="GST Rate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Exempt)</SelectItem>
                    <SelectItem value="5">5% GST</SelectItem>
                    <SelectItem value="12">12% GST</SelectItem>
                    <SelectItem value="18">18% GST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Supplier (Optional)</Label>
              <Select value={newTx.supplierId} onValueChange={(val) => setNewTx((prev) => ({ ...prev, supplierId: val }))}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Select Supplier..." />
                </SelectTrigger>
                <SelectContent className="max-h-48">
                  {activeSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Invoice Reference</Label>
              <Input
                placeholder="e.g. INV-2026-001"
                className="h-9 text-xs mt-1 font-mono"
                value={newTx.invoiceNumber}
                onChange={(e) => setNewTx((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void handleAddTransaction()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Save className="size-4 mr-1.5" />}
              Save Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
