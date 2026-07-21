'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  FileUp,
  Download,
  LayoutGrid,
  List,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, ItemResponse } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'

// Sub-components
import { InventoryTable } from '@/components/inventory/InventoryTable'
import { BulkImportDialog } from '@/components/inventory/BulkImportDialog'
import { AddItemDialog } from '@/components/inventory/AddItemDialog'

export default function InventoryView({ title = 'Inventory' }: { title?: string }) {
  const { user, flags } = useAppStore()
  const isAdmin = user?.role === 'admin'

  // Data state
  const [items, setItems] = useState<ItemResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Layout state
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fg_items_view_mode') as 'list' | 'grid'
      if (saved === 'list' || saved === 'grid') {
        setViewMode(saved)
      }
    }
  }, [])

  // Filter state
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('') // Debounced input
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 12

  // Debounce search input to avoid firing on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await api.items.categories()
      setCategories(['All', ...cats])
    } catch {
      // silent — categories are non-critical
    }
  }, [])

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.items.list({
        search,
        category: categoryFilter === 'All' ? undefined : categoryFilter,
        page,
        pageSize
      })
      setItems(res.items)
      setTotalItems(res.pagination.totalCount)
      setTotalPages(res.pagination.totalPages)
    } catch {
      toast.error('Failed to load items')
    } finally {
      setLoading(false)
    }
  }, [search, categoryFilter, page])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const onImportSuccess = () => {
    fetchItems()
    fetchCategories()
  }

  const inStockCount = items.filter(i => i.stock > i.minStock).length
  const lowStockCount = items.filter(i => i.stock > 0 && i.stock <= i.minStock).length
  const outOfStockCount = items.filter(i => i.stock === 0).length

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          <div className="mt-1.5 flex items-center gap-4">
            <span className="text-sm text-muted-foreground tabular-nums font-medium">{totalItems} items</span>
            <span className="w-px h-3 bg-border" />
            <span className="flex items-center gap-1.5 text-xs">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="font-medium text-emerald-700 tabular-nums">{inStockCount}</span>
              <span className="text-muted-foreground">in stock</span>
            </span>
            {lowStockCount > 0 && (
              <>
                <span className="w-px h-3 bg-border" />
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  <span className="font-semibold text-amber-700 tabular-nums">{lowStockCount}</span>
                  <span className="text-muted-foreground">low stock</span>
                </span>
              </>
            )}
            {outOfStockCount > 0 && (
              <>
                <span className="w-px h-3 bg-border" />
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="size-1.5 rounded-full bg-rose-500" />
                  <span className="font-semibold text-rose-700 tabular-nums">{outOfStockCount}</span>
                  <span className="text-muted-foreground">out of stock</span>
                </span>
              </>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowBulkImport(true)}>
              <FileUp className="size-3.5" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            {flags.csvExport && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                disabled={items.length === 0}
                onClick={async () => {
                  try {
                    toast.info('Preparing export...')
                    const res = await api.items.list({ pageSize: 2000 })
                    const allItems = res.items
                    const headers = ['ID', 'Name', 'Category', 'Unit', 'Stock', 'Reserved', 'Available', 'Min Stock']
                    const rows = allItems.map((i) => [i.id, i.name, i.category, i.unit, i.stock, i.reservedQty, i.stock - i.reservedQty, i.minStock])
                    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
                    const blob = new Blob([csv], { type: 'text/csv' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `inventory_full_${new Date().toISOString().split('T')[0]}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                    toast.success(`Exported ${allItems.length} items`)
                  } catch {
                    toast.error('Export failed')
                  }
                }}
              >
                <Download className="size-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            <Button size="sm" className="h-8 gap-1.5 text-xs rounded-[8px]" onClick={() => setShowAddDialog(true)}>
              <Plus className="size-3.5" />
              Add item
            </Button>
          </div>
        )}
      </div>

      {/* Filters — inline, no card wrapper */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            className="pl-9 h-8 text-sm border-border bg-background"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setPage(1) }}>
          <SelectTrigger className="w-[160px] h-8 text-sm border-border bg-background">
            <Filter className="size-3 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View Mode Toggle */}
        <div className="flex border border-border rounded-md overflow-hidden shrink-0">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 rounded-none border-0 px-2.5 text-muted-foreground"
            onClick={() => { setViewMode('list'); localStorage.setItem('fg_items_view_mode', 'list'); }}
            title="List view"
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 rounded-none border-0 px-2.5 text-muted-foreground"
            onClick={() => { setViewMode('grid'); localStorage.setItem('fg_items_view_mode', 'grid'); }}
            title="Grid view"
          >
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <InventoryTable items={items} loading={loading} onRefresh={onImportSuccess} viewMode={viewMode} />

        {/* Pagination */}
        <div className="border-t border-border/40 bg-muted/10 px-4 py-2.5 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Page {page} of {totalPages || 1} · {totalItems} total items
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="size-7 border-border"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7 border-border"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Bulk Import Dialog */}
      <BulkImportDialog 
        open={showBulkImport} 
        onOpenChange={setShowBulkImport} 
        onImportSuccess={onImportSuccess} 
      />

      <AddItemDialog 
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={onImportSuccess}
      />
    </div>
  )
}
