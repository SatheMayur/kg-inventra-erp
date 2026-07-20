'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  ClipboardList,
  Eye,
  FileUp,
  IndianRupee,
  Loader2,
  MessageCircle,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { api, ApiClientError, DailyProcurementBatchResponse, ItemResponse, SupplierResponse } from '@/lib/api'
import { isSupplierUsableForPo } from '@/lib/supplier-dedupe'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type RequirementDraft = {
  id: string
  itemId: string
  operationalRequirement: number
  requiredClosingStock: number
  finalPurchaseQty?: number
  overrideReason: string
  qualityGrade: string
  itemSpec: string
  storageCondition: string
  deliveryLocation: string
  deliveryTimeSlot: string
}

type QuoteFormState = {
  enquiryLineId: string
  availableQuantity: number
  quotedRate: number
  quotedUnit: string
  conversionFactor?: number
  conversionApproximate: boolean
  qualityGrade: string
  transportCharge: number
  taxRate: number
  deliveryTime: string
  validityDateTime: string
  originalMessageText: string
  vendorRemarks: string
  verificationStatus: 'VERIFIED' | 'NEEDS_REVIEW' | 'REJECTED'
}

type DailyItemFormState = {
  name: string
  itemCode: string
  category: string
  baseUnit: string
  purchaseUnit: string
  consumptionUnit: string
  pricingMode: NonNullable<ItemResponse['pricingMode']>
  itemNature: NonNullable<ItemResponse['itemNature']>
  perishable: boolean
  dailyProcurementEligible: boolean
  preferredSupplierId: string
  storageCondition: string
  qualityGradeEnabled: boolean
}

type DuplicatePromptState = {
  mode: 'inline' | 'quick'
  pendingData: Parameters<typeof api.items.create>[0]
  matches: Array<{
    itemId: string
    name: string
    category: string
    unit: string
    active: boolean
    matchType: string
    confidence: number
  }>
  confirmable: boolean
}

type DailyImportResult = Awaited<ReturnType<typeof api.items.dailyImport>>

const todayInputValue = () => new Date().toISOString().slice(0, 10)

const draftId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const emptyRequirementLine = (): RequirementDraft => ({
  id: draftId(),
  itemId: '',
  operationalRequirement: 1,
  requiredClosingStock: 0,
  finalPurchaseQty: undefined,
  overrideReason: '',
  qualityGrade: '',
  itemSpec: '',
  storageCondition: '',
  deliveryLocation: '',
  deliveryTimeSlot: '',
})

const emptyQuoteForm = (): QuoteFormState => ({
  enquiryLineId: '',
  availableQuantity: 0,
  quotedRate: 0,
  quotedUnit: '',
  conversionFactor: undefined,
  conversionApproximate: false,
  qualityGrade: '',
  transportCharge: 0,
  taxRate: 0,
  deliveryTime: '',
  validityDateTime: '',
  originalMessageText: '',
  vendorRemarks: '',
  verificationStatus: 'VERIFIED',
})

const emptyDailyItemForm = (): DailyItemFormState => ({
  name: '',
  itemCode: '',
  category: '',
  baseUnit: 'kg',
  purchaseUnit: 'kg',
  consumptionUnit: 'kg',
  pricingMode: 'DAILY_MARKET_RATE',
  itemNature: 'PERISHABLE',
  perishable: true,
  dailyProcurementEligible: true,
  preferredSupplierId: '',
  storageCondition: '',
  qualityGradeEnabled: true,
})

function isDailyEligibleItem(item: ItemResponse) {
  const procurementType = item.procurementType ?? 'STANDARD'
  return Boolean(
    item.active !== false &&
    item.dailyProcurementEligible &&
    (procurementType === 'DAILY' || procurementType === 'BOTH') &&
    item.itemNature !== 'SERVICE',
  )
}

function itemSearchCorpus(item: ItemResponse) {
  return [
    item.name,
    item.itemCode,
    item.category,
    item.shortName,
    item.subCategory,
    item.unit,
    ...(item.aliases ?? []).map((alias) => alias.aliasText),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function formatQty(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function safeDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : format(date, 'dd MMM yyyy')
}

function statusBadge(status: string) {
  const normalized = status.toUpperCase()
  if (['APPROVED', 'SUPPLY_ORDERED', 'CLOSED'].includes(normalized)) {
    return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20"><CheckCircle2 className="size-3" /> {status.replaceAll('_', ' ')}</Badge>
  }
  if (['PENDING_APPROVAL', 'ALLOCATION_READY', 'ENQUIRY_SENT', 'QUOTES_RECEIVED'].includes(normalized)) {
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20"><AlertCircle className="size-3" /> {status.replaceAll('_', ' ')}</Badge>
  }
  if (['CANCELLED', 'REJECTED', 'FAILED'].includes(normalized)) {
    return <Badge variant="outline" className="bg-rose-500/10 text-rose-700 border-rose-500/20"><AlertCircle className="size-3" /> {status.replaceAll('_', ' ')}</Badge>
  }
  return <Badge variant="outline" className="bg-slate-500/10 text-slate-700 border-slate-500/20">{status.replaceAll('_', ' ')}</Badge>
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}

function DuplicateMatchPanel({
  duplicatePrompt,
  onUseExisting,
  onConfirm,
  busy,
}: {
  duplicatePrompt: DuplicatePromptState | null
  onUseExisting: (itemId: string) => void
  onConfirm: () => void
  busy: boolean
}) {
  if (!duplicatePrompt) return null
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <div className="font-semibold text-amber-900">Possible duplicate item found</div>
      <div className="mt-1 text-xs text-amber-900/80">Select an existing item when it is the same material. Exact active duplicates cannot be recreated.</div>
      <div className="mt-3 space-y-2">
        {duplicatePrompt.matches.map((match) => (
          <div key={`${match.itemId}-${match.matchType}`} className="flex flex-col gap-2 rounded-md border border-amber-500/20 bg-background/70 p-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate font-medium">{match.name}</div>
              <div className="text-xs text-muted-foreground">
                {match.category} / {match.unit} / {match.matchType.replaceAll('_', ' ')} / {(match.confidence * 100).toFixed(0)}%
                {!match.active ? ' / inactive' : ''}
              </div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => onUseExisting(match.itemId)}>Use Existing</Button>
          </div>
        ))}
      </div>
      {duplicatePrompt.confirmable ? (
        <Button type="button" size="sm" className="mt-3" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          Create Anyway
        </Button>
      ) : null}
    </div>
  )
}

function DailyItemSelector({
  lineId,
  selectedItem,
  items,
  loading,
  error,
  showAll,
  recentItemIds,
  onSelect,
  onRefresh,
  onToggleShowAll,
  onAddNew,
  onQuickAdd,
  onImport,
}: {
  lineId: string
  selectedItem?: ItemResponse
  items: ItemResponse[]
  loading: boolean
  error: string
  showAll: boolean
  recentItemIds: Set<string>
  onSelect: (item: ItemResponse) => void
  onRefresh: () => void
  onToggleShowAll: () => void
  onAddNew: () => void
  onQuickAdd: () => void
  onImport: () => void
}) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const filtered = term
      ? items.filter((item) => itemSearchCorpus(item).includes(term))
      : items
    return filtered.slice(0, 200)
  }, [items, searchTerm])

  const groupedItems = useMemo(() => {
    const rendered = new Set<string>()
    const groups: Array<{ label: string; items: ItemResponse[] }> = []
    const recent = filteredItems.filter((item) => recentItemIds.has(item.id)).slice(0, 20)
    if (recent.length > 0) {
      groups.push({ label: 'Recently Used', items: recent })
      for (const item of recent) rendered.add(item.id)
    }

    const frequent = filteredItems
      .filter((item) => !rendered.has(item.id) && ((item.avgDailyConsumption ?? 0) > 0 || (item.onOrderQty ?? 0) > 0))
      .slice(0, 20)
    if (frequent.length > 0) {
      groups.push({ label: 'Frequently Purchased', items: frequent })
      for (const item of frequent) rendered.add(item.id)
    }

    const byCategory = new Map<string, ItemResponse[]>()
    for (const item of filteredItems) {
      if (rendered.has(item.id)) continue
      const category = item.category || 'Uncategorized'
      const group = byCategory.get(category) ?? []
      group.push(item)
      byCategory.set(category, group)
    }
    for (const [category, groupItems] of [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      groups.push({ label: category, items: groupItems })
    }
    return groups
  }, [filteredItems, recentItemIds])

  const renderItem = (item: ItemResponse) => {
    const eligible = isDailyEligibleItem(item)
    return (
      <CommandItem
        key={item.id}
        value={`${item.id} ${itemSearchCorpus(item)}`}
        disabled={!eligible}
        onSelect={() => {
          if (!eligible) return
          onSelect(item)
          setOpen(false)
        }}
        className="items-start gap-3 py-2"
      >
        <Check className={cn('mt-0.5 size-4', selectedItem?.id === item.id ? 'opacity-100' : 'opacity-0')} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{item.name}</span>
            {item.requiresMasterReview ? <Badge variant="outline" className="text-[10px]">Review</Badge> : null}
            {!eligible ? <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-500/30">Not Daily</Badge> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{item.itemCode || 'No code'}</span>
            <span>{item.category}</span>
            <span>{item.baseUnit || item.unit}</span>
            {item.aliases?.length ? <span>Aliases: {item.aliases.slice(0, 2).map((alias) => alias.aliasText).join(', ')}</span> : null}
          </div>
        </div>
      </CommandItem>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={`daily-item-selector-${lineId}`}
          className="h-10 w-full justify-between rounded-md bg-background px-3 font-normal"
        >
          <span className="min-w-0 truncate text-left">
            {selectedItem ? `${selectedItem.name} (${selectedItem.baseUnit || selectedItem.unit})` : 'Select Daily Procurement item'}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        id={`daily-item-selector-${lineId}`}
        align="start"
        sideOffset={6}
        className="z-[90] w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] min-w-[320px] max-w-[680px] p-0"
      >
        <Command shouldFilter={false}>
          <div className="flex items-center justify-between gap-2 border-b px-2 py-2">
            <CommandInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              placeholder="Search name, code, alias, category"
              className="h-9"
            />
            <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={onRefresh}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5" onClick={onAddNew}>
              <PackagePlus className="size-3.5" /> Add New
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5" onClick={onQuickAdd}>
              <Plus className="size-3.5" /> Quick Add
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5" onClick={onImport}>
              <FileUp className="size-3.5" /> Import
            </Button>
            <Button type="button" size="sm" variant={showAll ? 'default' : 'ghost'} className="h-7 gap-1.5 ml-auto" onClick={onToggleShowAll}>
              <Eye className="size-3.5" /> {showAll ? 'Daily Only' : 'Show All'}
            </Button>
          </div>
          <CommandList className="max-h-[320px] overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading Daily Procurement items...
              </div>
            ) : error ? (
              <div className="space-y-3 px-4 py-6 text-sm">
                <div className="flex items-start gap-2 text-rose-700">
                  <AlertCircle className="mt-0.5 size-4" />
                  <span>{error}</span>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={onRefresh}>Retry</Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <CommandEmpty className="px-4 py-6 text-left">
                <div className="space-y-3">
                  <div>
                    <div className="font-semibold text-foreground">No Daily Procurement items are available.</div>
                    <div className="mt-1 text-xs text-muted-foreground">Add a shared Item Master record or import daily items.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={onAddNew}><PackagePlus className="mr-1.5 size-3.5" /> Add New Item</Button>
                    <Button type="button" size="sm" variant="outline" onClick={onImport}><FileUp className="mr-1.5 size-3.5" /> Import Items</Button>
                  </div>
                </div>
              </CommandEmpty>
            ) : (
              <>
                {groupedItems.map((group, index) => (
                  <div key={group.label}>
                    {index > 0 ? <CommandSeparator /> : null}
                    <CommandGroup heading={group.label}>
                      {group.items.map(renderItem)}
                    </CommandGroup>
                  </div>
                ))}
                {filteredItems.length < items.length && !searchTerm ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Showing first 200 items. Search to narrow a large list.</div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default function DailyProcurementPanel({
  items,
  suppliers,
  loadingMasterData,
}: {
  items: ItemResponse[]
  suppliers: SupplierResponse[]
  loadingMasterData: boolean
}) {
  const [batches, setBatches] = useState<DailyProcurementBatchResponse[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [showBatchDialog, setShowBatchDialog] = useState(false)
  const [showQuoteDialog, setShowQuoteDialog] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState(todayInputValue())
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState('')
  const [deliveryLocation, setDeliveryLocation] = useState('')
  const [batchNotes, setBatchNotes] = useState('')
  const [requirementLines, setRequirementLines] = useState<RequirementDraft[]>([emptyRequirementLine()])
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
  const [quoteForm, setQuoteForm] = useState<QuoteFormState>(emptyQuoteForm())
  const [allocationQtyByQuote, setAllocationQtyByQuote] = useState<Record<string, number>>({})
  const [approvalRemarks, setApprovalRemarks] = useState('')
  const [dailyItems, setDailyItems] = useState<ItemResponse[]>([])
  const [loadingDailyItems, setLoadingDailyItems] = useState(false)
  const [dailyItemsError, setDailyItemsError] = useState('')
  const [showAllItems, setShowAllItems] = useState(false)
  const [activeItemLineId, setActiveItemLineId] = useState<string | null>(null)
  const [showInlineItemDialog, setShowInlineItemDialog] = useState(false)
  const [showQuickAddDialog, setShowQuickAddDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [dailyItemForm, setDailyItemForm] = useState<DailyItemFormState>(emptyDailyItemForm())
  const [quickItemName, setQuickItemName] = useState('')
  const [quickItemCategory, setQuickItemCategory] = useState('')
  const [quickItemUnit, setQuickItemUnit] = useState('kg')
  const [itemCategories, setItemCategories] = useState<string[]>([])
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePromptState | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<DailyImportResult | null>(null)
  const [importingItems, setImportingItems] = useState(false)

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => isSupplierUsableForPo(supplier)),
    [suppliers],
  )

  const loadDailyItems = useCallback(async () => {
    setLoadingDailyItems(true)
    setDailyItemsError('')
    try {
      const res = await api.items.list({
        pageSize: 1000,
        procurementContext: 'daily',
        includeAll: showAllItems,
      })
      setDailyItems(res.items)
    } catch (error) {
      const message = apiErrorMessage(error, 'Failed to load Daily Procurement items')
      setDailyItemsError(message)
      toast.error(message)
    } finally {
      setLoadingDailyItems(false)
    }
  }, [showAllItems])

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null,
    [batches, selectedBatchId],
  )

  const recentItemIds = useMemo(() => {
    const ids = new Set<string>()
    for (const batch of batches.slice(0, 10)) {
      for (const line of batch.lines ?? []) ids.add(line.itemId)
    }
    return ids
  }, [batches])

  const enquiryLineOptions = useMemo(() => {
    if (!selectedBatch) return []
    return selectedBatch.lines.flatMap((line) =>
      (line.enquiryLines ?? []).map((enquiryLine: any) => ({
        id: enquiryLine.id,
        line,
        supplierName: enquiryLine.enquiry?.supplier?.name ?? 'Supplier',
        enquiryNumber: enquiryLine.enquiry?.enquiryNumber ?? '',
        unit: enquiryLine.unit,
      })),
    )
  }, [selectedBatch])

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.procurement.daily.list()
      setBatches(data)
      setSelectedBatchId((current) => current || data[0]?.id || '')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to load Daily Procurement batches'))
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshBatch = useCallback(async (id?: string) => {
    const targetId = id || selectedBatch?.id
    if (!targetId) {
      await loadBatches()
      return
    }
    const batch = await api.procurement.daily.get(targetId)
    setBatches((prev) => {
      const exists = prev.some((entry) => entry.id === batch.id)
      if (!exists) return [batch, ...prev]
      return prev.map((entry) => (entry.id === batch.id ? batch : entry))
    })
    setSelectedBatchId(batch.id)
  }, [loadBatches, selectedBatch?.id])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  useEffect(() => {
    void loadDailyItems()
  }, [loadDailyItems])

  useEffect(() => {
    api.items.categories().then(setItemCategories).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedBatchId && batches[0]) setSelectedBatchId(batches[0].id)
  }, [batches, selectedBatchId])

  const resetBatchForm = () => {
    setDeliveryDate(todayInputValue())
    setDeliveryTimeSlot('')
    setDeliveryLocation('')
    setBatchNotes('')
    setRequirementLines([emptyRequirementLine()])
  }

  const updateRequirementLine = (id: string, patch: Partial<RequirementDraft>) => {
    setRequirementLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  const selectItemForActiveLine = (item: ItemResponse) => {
    const targetLineId = activeItemLineId || requirementLines[0]?.id
    if (!targetLineId) return
    updateRequirementLine(targetLineId, {
      itemId: item.id,
      requiredClosingStock: item.safetyStock ?? 0,
      storageCondition: item.storageCondition || requirementLines.find((line) => line.id === targetLineId)?.storageCondition || '',
    })
  }

  const openInlineItemCreate = (lineId: string) => {
    setActiveItemLineId(lineId)
    setDailyItemForm(emptyDailyItemForm())
    setDuplicatePrompt(null)
    setShowInlineItemDialog(true)
  }

  const openQuickItemCreate = (lineId: string) => {
    setActiveItemLineId(lineId)
    setQuickItemName('')
    setQuickItemCategory('')
    setQuickItemUnit('kg')
    setDuplicatePrompt(null)
    setShowQuickAddDialog(true)
  }

  const handleDuplicateError = (error: unknown, mode: 'inline' | 'quick', pendingData: Parameters<typeof api.items.create>[0]) => {
    if (error instanceof ApiClientError && error.status === 409 && error.data?.code === 'ITEM_DUPLICATE') {
      setDuplicatePrompt({
        mode,
        pendingData,
        matches: error.data.matches ?? [],
        confirmable: Boolean(error.data.confirmable),
      })
      return true
    }
    return false
  }

  const completeItemCreate = async (item: ItemResponse, successMessage: string) => {
    setDailyItems((prev) => [item, ...prev.filter((entry) => entry.id !== item.id)])
    selectItemForActiveLine(item)
    setShowInlineItemDialog(false)
    setShowQuickAddDialog(false)
    setDuplicatePrompt(null)
    await loadDailyItems()
    toast.success(successMessage)
  }

  const handleInlineItemCreate = async (confirmDuplicate = false) => {
    if (!dailyItemForm.name.trim() || !dailyItemForm.category || !dailyItemForm.baseUnit.trim()) {
      toast.error('Item name, category, and base unit are required')
      return
    }
    const data: Parameters<typeof api.items.create>[0] = {
      name: dailyItemForm.name.trim(),
      itemCode: dailyItemForm.itemCode.trim() || undefined,
      category: dailyItemForm.category,
      unit: dailyItemForm.baseUnit.trim(),
      stock: 0,
      minStock: 0,
      procurementType: 'DAILY',
      pricingMode: dailyItemForm.pricingMode,
      itemNature: dailyItemForm.itemNature,
      baseUnit: dailyItemForm.baseUnit.trim(),
      purchaseUnit: dailyItemForm.purchaseUnit.trim() || dailyItemForm.baseUnit.trim(),
      consumptionUnit: dailyItemForm.consumptionUnit.trim() || dailyItemForm.baseUnit.trim(),
      unitConversion: 1,
      perishable: dailyItemForm.perishable,
      dailyProcurementEligible: dailyItemForm.dailyProcurementEligible,
      preferredSupplierId: dailyItemForm.preferredSupplierId || undefined,
      storageCondition: dailyItemForm.storageCondition.trim() || undefined,
      qualityGradeEnabled: dailyItemForm.qualityGradeEnabled,
      active: true,
      sourceChannel: 'DAILY_PROCUREMENT_INLINE',
      confirmDuplicate,
    }

    setBusyAction('create-daily-item')
    try {
      const item = await api.items.create(data)
      await completeItemCreate(item, 'Daily Procurement item added')
    } catch (error) {
      if (!handleDuplicateError(error, 'inline', data)) {
        toast.error(apiErrorMessage(error, 'Failed to add Daily Procurement item'))
      }
    } finally {
      setBusyAction(null)
    }
  }

  const handleQuickItemCreate = async (confirmDuplicate = false) => {
    if (!quickItemName.trim() || !quickItemCategory || !quickItemUnit.trim()) {
      toast.error('Item name, category, and unit are required')
      return
    }
    const data: Parameters<typeof api.items.create>[0] = {
      name: quickItemName.trim(),
      category: quickItemCategory,
      unit: quickItemUnit.trim(),
      baseUnit: quickItemUnit.trim(),
      purchaseUnit: quickItemUnit.trim(),
      consumptionUnit: quickItemUnit.trim(),
      stock: 0,
      minStock: 0,
      sourceChannel: 'DAILY_PROCUREMENT_QUICK_ADD',
      active: true,
      confirmDuplicate,
    }

    setBusyAction('quick-add-daily-item')
    try {
      const item = await api.items.create(data)
      await completeItemCreate(item, 'Quick item added for master review')
    } catch (error) {
      if (!handleDuplicateError(error, 'quick', data)) {
        toast.error(apiErrorMessage(error, 'Failed to quick-add item'))
      }
    } finally {
      setBusyAction(null)
    }
  }

  const handleUseDuplicateMatch = (itemId: string) => {
    const item = dailyItems.find((entry) => entry.id === itemId) || items.find((entry) => entry.id === itemId)
    if (!item) {
      toast.error('Matching item is not available in the current selector. Refresh Daily Procurement items.')
      return
    }
    selectItemForActiveLine(item)
    setDuplicatePrompt(null)
    setShowInlineItemDialog(false)
    setShowQuickAddDialog(false)
  }

  const handleConfirmDuplicateCreate = async () => {
    if (!duplicatePrompt?.confirmable) return
    setBusyAction('confirm-daily-item')
    try {
      const item = await api.items.create({ ...duplicatePrompt.pendingData, confirmDuplicate: true })
      await completeItemCreate(
        item,
        duplicatePrompt.mode === 'quick' ? 'Quick item added for master review' : 'Daily Procurement item added',
      )
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to create item after duplicate confirmation'))
    } finally {
      setBusyAction(null)
    }
  }

  const handlePreviewImport = async () => {
    if (!importFile) {
      toast.error('Choose a CSV or Excel file')
      return
    }
    setImportingItems(true)
    try {
      const result = await api.items.dailyImport(importFile, false)
      setImportResult(result)
      toast.success(`Validated ${result.rows.length} row(s)`)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to validate item import'))
    } finally {
      setImportingItems(false)
    }
  }

  const handleCommitImport = async () => {
    if (!importFile) return
    setImportingItems(true)
    try {
      const result = await api.items.dailyImport(importFile, true)
      setImportResult(result)
      if (result.items[0]) {
        setDailyItems((prev) => [...result.items, ...prev.filter((entry) => !result.items.some((item) => item.id === entry.id))])
        selectItemForActiveLine(result.items[0])
      }
      await loadDailyItems()
      toast.success(`${result.importedCount} Daily Procurement item(s) imported`)
    } catch (error) {
      if (error instanceof ApiClientError && error.data?.rows) {
        setImportResult({ rows: error.data.rows, importedCount: 0, items: [] })
      }
      toast.error(apiErrorMessage(error, 'Daily item import failed'))
    } finally {
      setImportingItems(false)
    }
  }

  const handleCreateBatch = async () => {
    const validLines = requirementLines.filter((line) => line.itemId && line.operationalRequirement > 0)
    if (!deliveryDate) {
      toast.error('Delivery date is required')
      return
    }
    if (validLines.length === 0) {
      toast.error('Add at least one valid requirement line')
      return
    }

    setBusyAction('create-batch')
    try {
      const batch = await api.procurement.daily.create({
        deliveryDate,
        deliveryTimeSlot: deliveryTimeSlot || null,
        deliveryLocation: deliveryLocation || null,
        notes: batchNotes || null,
        lines: validLines.map((line) => ({
          itemId: line.itemId,
          operationalRequirement: Number(line.operationalRequirement),
          requiredClosingStock: Number(line.requiredClosingStock || 0),
          finalPurchaseQty: line.finalPurchaseQty === undefined ? undefined : Number(line.finalPurchaseQty),
          overrideReason: line.overrideReason || null,
          qualityGrade: line.qualityGrade || null,
          itemSpec: line.itemSpec || null,
          storageCondition: line.storageCondition || null,
          deliveryLocation: line.deliveryLocation || null,
          deliveryTimeSlot: line.deliveryTimeSlot || null,
        })),
      })
      setBatches((prev) => [batch, ...prev.filter((entry) => entry.id !== batch.id)])
      setSelectedBatchId(batch.id)
      setShowBatchDialog(false)
      resetBatchForm()
      toast.success(`Daily Procurement Batch ${batch.batchNumber} created`)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to create Daily Procurement Batch'))
    } finally {
      setBusyAction(null)
    }
  }

  const handleSendEnquiries = async () => {
    if (!selectedBatch) return
    if (selectedSupplierIds.length === 0) {
      toast.error('Select at least one supplier for rate enquiry')
      return
    }
    setBusyAction('send-enquiries')
    try {
      await api.procurement.daily.sendEnquiries(selectedBatch.id, {
        supplierIds: selectedSupplierIds,
        sendWhatsApp: true,
        language: 'en',
      })
      setSelectedSupplierIds([])
      await refreshBatch(selectedBatch.id)
      toast.success('Rate enquiries queued on WhatsApp')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to send rate enquiries'))
    } finally {
      setBusyAction(null)
    }
  }

  const handleCreateQuote = async () => {
    if (!quoteForm.enquiryLineId) {
      toast.error('Select an enquiry line')
      return
    }
    if (quoteForm.availableQuantity < 0 || quoteForm.quotedRate < 0) {
      toast.error('Quantity and rate must be non-negative')
      return
    }
    if (!quoteForm.quotedUnit.trim()) {
      toast.error('Quoted unit is required')
      return
    }

    setBusyAction('create-quote')
    try {
      await api.procurement.daily.createQuote({
        enquiryLineId: quoteForm.enquiryLineId,
        availableQuantity: Number(quoteForm.availableQuantity),
        quotedRate: Number(quoteForm.quotedRate),
        quotedUnit: quoteForm.quotedUnit,
        conversionFactor: quoteForm.conversionFactor ? Number(quoteForm.conversionFactor) : undefined,
        conversionApproximate: quoteForm.conversionApproximate,
        qualityGrade: quoteForm.qualityGrade || null,
        transportCharge: Number(quoteForm.transportCharge || 0),
        taxRate: Number(quoteForm.taxRate || 0),
        deliveryTime: quoteForm.deliveryTime || undefined,
        validityDateTime: quoteForm.validityDateTime || undefined,
        originalMessageText: quoteForm.originalMessageText || null,
        vendorRemarks: quoteForm.vendorRemarks || null,
        verificationStatus: quoteForm.verificationStatus,
      })
      setShowQuoteDialog(false)
      setQuoteForm(emptyQuoteForm())
      await refreshBatch()
      toast.success('Vendor quote recorded')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to record vendor quote'))
    } finally {
      setBusyAction(null)
    }
  }

  const handleAllocate = async () => {
    if (!selectedBatch) return
    const allocations = selectedBatch.lines.flatMap((line) => {
      const recommendations = selectedBatch.recommendationsByLineId?.[line.id] ?? []
      return recommendations
        .map((rec) => ({
          batchLineId: line.id,
          quoteId: rec.quoteId,
          allocatedQty: Number(allocationQtyByQuote[rec.quoteId] || 0),
          reason: rec.reasons.join('; '),
        }))
        .filter((allocation) => allocation.allocatedQty > 0)
    })

    if (allocations.length === 0) {
      toast.error('Enter at least one allocation quantity')
      return
    }

    setBusyAction('allocate')
    try {
      const batch = await api.procurement.daily.allocate(selectedBatch.id, { allocations })
      setBatches((prev) => prev.map((entry) => (entry.id === batch.id ? batch : entry)))
      setAllocationQtyByQuote({})
      toast.success('Vendor allocation saved')
      await refreshBatch(batch.id)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to save allocation'))
    } finally {
      setBusyAction(null)
    }
  }

  const handleApprove = async () => {
    if (!selectedBatch) return
    setBusyAction('approve')
    try {
      const batch = await api.procurement.daily.approve(selectedBatch.id, { remarks: approvalRemarks || undefined })
      setBatches((prev) => prev.map((entry) => (entry.id === batch.id ? batch : entry)))
      setApprovalRemarks('')
      toast.success(batch.status === 'APPROVED' ? 'Daily Procurement approved' : 'Approval step recorded')
      await refreshBatch(batch.id)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to approve Daily Procurement'))
    } finally {
      setBusyAction(null)
    }
  }

  const handleSendSupplyOrders = async () => {
    if (!selectedBatch) return
    setBusyAction('send-orders')
    try {
      const result = await api.procurement.daily.sendSupplyOrders(selectedBatch.id)
      setBatches((prev) => prev.map((entry) => (entry.id === result.batch.id ? result.batch : entry)))
      toast.success('Daily Supply Orders queued on WhatsApp')
      await refreshBatch(result.batch.id)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to send Daily Supply Orders'))
    } finally {
      setBusyAction(null)
    }
  }

  const selectedQuoteLine = enquiryLineOptions.find((option) => option.id === quoteForm.enquiryLineId)
  const canApprove = selectedBatch?.status === 'ALLOCATION_READY' || selectedBatch?.status === 'PENDING_APPROVAL'
  const canSendOrders = selectedBatch?.status === 'APPROVED' || selectedBatch?.status === 'SUPPLY_ORDERED'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="size-4 text-primary" /> Daily Batches
              </CardTitle>
              <CardDescription>Market procurement workspace</CardDescription>
            </div>
            <Button size="icon" variant="outline" className="size-8" onClick={() => void loadBatches()} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full rounded-lg gap-2" onClick={() => setShowBatchDialog(true)} disabled={loadingMasterData}>
            <Plus className="size-4" /> New Daily Batch
          </Button>
          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/20 animate-pulse" />)
            ) : batches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No daily procurement batches yet.
              </div>
            ) : (
              batches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => setSelectedBatchId(batch.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selectedBatch?.id === batch.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-sm">{batch.batchNumber}</span>
                    {statusBadge(batch.status)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="size-3" /> {safeDate(batch.deliveryDate)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {batch.deliveryLocation || batch.deliveryTimeSlot || 'Location/slot not set'}
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedBatch ? (
        <Card className="border-border bg-card">
          <CardContent className="h-72 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ShoppingBag className="size-10 opacity-30" />
            <p className="text-sm">Create a batch to start Daily Procurement.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{selectedBatch.batchNumber}</CardTitle>
                    {statusBadge(selectedBatch.status)}
                  </div>
                  <CardDescription className="mt-1">
                    Delivery {safeDate(selectedBatch.deliveryDate)}
                    {selectedBatch.deliveryTimeSlot ? `, ${selectedBatch.deliveryTimeSlot}` : ''}
                    {selectedBatch.deliveryLocation ? `, ${selectedBatch.deliveryLocation}` : ''}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="rounded-lg gap-2" onClick={() => setShowQuoteDialog(true)} disabled={enquiryLineOptions.length === 0}>
                    <Scale className="size-4" /> Enter Quote
                  </Button>
                  <Button variant="outline" className="rounded-lg gap-2" onClick={handleAllocate} disabled={busyAction === 'allocate'}>
                    {busyAction === 'allocate' ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
                    Allocate
                  </Button>
                  <Button variant="outline" className="rounded-lg gap-2" onClick={handleApprove} disabled={!canApprove || busyAction === 'approve'}>
                    {busyAction === 'approve' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Approve
                  </Button>
                  <Button className="rounded-lg gap-2" onClick={handleSendSupplyOrders} disabled={!canSendOrders || busyAction === 'send-orders'}>
                    {busyAction === 'send-orders' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Send Orders
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Lines</div>
                  <div className="text-xl font-bold">{selectedBatch.lines.length}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Enquiries</div>
                  <div className="text-xl font-bold">{selectedBatch.enquiries.length}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Quotes</div>
                  <div className="text-xl font-bold">
                    {selectedBatch.lines.reduce((sum, line) => sum + (line.enquiryLines ?? []).reduce((inner, el) => inner + (el.quotes?.length ?? 0), 0), 0)}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Supply Orders</div>
                  <div className="text-xl font-bold">{selectedBatch.supplyOrders.length}</div>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
                  <div className="font-bold text-sm">Requirements, Stock, Net Purchase</div>
                  <Badge variant="outline" className="text-[10px]">Server calculated</Badge>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Requirement</TableHead>
                        <TableHead className="text-right">Closing Stock</TableHead>
                        <TableHead className="text-right">Usable Stock</TableHead>
                        <TableHead className="text-right">Pending Supply</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="text-right">Final</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBatch.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <div className="font-medium">{line.itemName}</div>
                            <div className="text-xs text-muted-foreground">
                              {line.qualityGrade || 'Any grade'}{line.itemSpec ? `, ${line.itemSpec}` : ''}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatQty(line.operationalRequirement)} {line.unit}</TableCell>
                          <TableCell className="text-right">{formatQty(line.requiredClosingStock)}</TableCell>
                          <TableCell className="text-right">{formatQty(line.usableStock)}</TableCell>
                          <TableCell className="text-right">{formatQty(line.confirmedPendingSupply)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatQty(line.calculatedNetQty)}</TableCell>
                          <TableCell className="text-right font-bold">
                            {formatQty(line.finalPurchaseQty)}
                            {line.overrideReason ? <div className="text-[10px] text-amber-700">Override: {line.overrideReason}</div> : null}
                          </TableCell>
                          <TableCell>{statusBadge(line.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><MessageCircle className="size-4 text-primary" /> Rate Enquiry</CardTitle>
              <CardDescription>Choose registered active suppliers and queue Daily Rate Enquiries through WhatsApp.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {activeSuppliers.map((supplier) => (
                  <label key={supplier.id} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                    <Checkbox
                      checked={selectedSupplierIds.includes(supplier.id)}
                      onCheckedChange={(checked) => {
                        setSelectedSupplierIds((prev) =>
                          checked ? [...prev, supplier.id] : prev.filter((id) => id !== supplier.id),
                        )
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{supplier.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{supplier.phone || supplier.contact || 'No WhatsApp phone'}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {selectedSupplierIds.length} supplier(s) selected. Existing open enquiries for the same batch and supplier are reused.
                </div>
                <Button className="rounded-lg gap-2" onClick={handleSendEnquiries} disabled={busyAction === 'send-enquiries' || selectedSupplierIds.length === 0}>
                  {busyAction === 'send-enquiries' ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
                  Send Rate Enquiry
                </Button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Enquiry</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Business Status</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBatch.enquiries.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No enquiries sent yet.</TableCell></TableRow>
                    ) : selectedBatch.enquiries.map((enquiry) => (
                      <TableRow key={enquiry.id}>
                        <TableCell className="font-mono text-xs">{enquiry.enquiryNumber}</TableCell>
                        <TableCell>{enquiry.supplier?.name || enquiry.supplierId}</TableCell>
                        <TableCell>{statusBadge(enquiry.businessStatus)}</TableCell>
                        <TableCell>{statusBadge(enquiry.messageStatus)}</TableCell>
                        <TableCell className="font-mono text-xs">{enquiry.whatsappReference}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Scale className="size-4 text-primary" /> Rate Comparison and Allocation</CardTitle>
              <CardDescription>Verified quotes are compared on normalized landed rate, availability, and grade fit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedBatch.lines.map((line) => {
                const recommendations = selectedBatch.recommendationsByLineId?.[line.id] ?? []
                return (
                  <div key={line.id} className="rounded-lg border border-border overflow-hidden">
                    <div className="px-4 py-3 bg-muted/20 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm">{line.itemName}</div>
                        <div className="text-xs text-muted-foreground">Final quantity {formatQty(line.finalPurchaseQty)} {line.unit}</div>
                      </div>
                      <Badge variant="outline">{recommendations.length} verified option(s)</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Landed Rate</TableHead>
                            <TableHead className="text-right">Available</TableHead>
                            <TableHead>Reasons</TableHead>
                            <TableHead className="w-36 text-right">Allocate</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recommendations.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">No verified normalized quotes yet.</TableCell></TableRow>
                          ) : recommendations.map((rec) => (
                            <TableRow key={rec.quoteId}>
                              <TableCell>
                                <div className="font-semibold">{rec.supplierName}</div>
                                <div className="text-xs text-muted-foreground">Score {rec.score}</div>
                              </TableCell>
                              <TableCell className="text-right font-bold">
                                <span className="inline-flex items-center justify-end gap-1">
                                  <IndianRupee className="size-3" /> {formatMoney(rec.landedRate)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{formatQty(rec.availableQuantity)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{rec.reasons.join('; ')}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.001"
                                  className="h-8 text-right"
                                  value={allocationQtyByQuote[rec.quoteId] ?? ''}
                                  onChange={(event) => setAllocationQtyByQuote((prev) => ({
                                    ...prev,
                                    [rec.quoteId]: Number(event.target.value || 0),
                                  }))}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )
              })}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Approval Remarks</Label>
                <Textarea value={approvalRemarks} onChange={(event) => setApprovalRemarks(event.target.value)} rows={2} placeholder="Commercial approval remarks" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Truck className="size-4 text-primary" /> Final Daily Supply Orders</CardTitle>
              <CardDescription>Review generated vendor-wise orders before sending them through WhatsApp.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Lines</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBatch.supplyOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">Supply Orders will appear after commercial approval.</TableCell></TableRow>
                    ) : selectedBatch.supplyOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                        <TableCell>{order.supplier?.name || order.supplierId}</TableCell>
                        <TableCell className="text-xs">
                          {(order.lines ?? []).map((line) => `${line.itemName}: ${formatQty(line.orderedQty)} ${line.unit}`).join('; ')}
                        </TableCell>
                        <TableCell>{statusBadge(order.status)}</TableCell>
                        <TableCell>{statusBadge(order.messageStatus)}</TableCell>
                        <TableCell className="font-mono text-xs">{order.whatsappReference}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={showBatchDialog} onOpenChange={(open) => {
        setShowBatchDialog(open)
        if (!open) resetBatchForm()
      }}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border bg-background/95">
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="size-5 text-primary" /> New Daily Procurement Batch</DialogTitle>
            <DialogDescription>Enter operational requirements. Compatible lines are consolidated server-side before stock and net purchase calculation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Delivery Date</Label>
                <Input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Time Slot</Label>
                <Input value={deliveryTimeSlot} onChange={(event) => setDeliveryTimeSlot(event.target.value)} placeholder="Morning / 8-10 AM" />
              </div>
              <div className="space-y-2">
                <Label>Delivery Location</Label>
                <Input value={deliveryLocation} onChange={(event) => setDeliveryLocation(event.target.value)} placeholder="Warehouse / Restaurant" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={batchNotes} onChange={(event) => setBatchNotes(event.target.value)} rows={2} />
            </div>
            <Separator />
            <div className="space-y-3">
              {requirementLines.map((line, index) => {
                const item = dailyItems.find((entry) => entry.id === line.itemId) || items.find((entry) => entry.id === line.itemId)
                const usable = item ? Math.max(0, item.stock - item.reservedQty) : 0
                const pending = item?.onOrderQty ?? 0
                const netPreview = item
                  ? Math.max(0, line.operationalRequirement + (line.requiredClosingStock || item.safetyStock || 0) - usable - pending)
                  : 0
                return (
                  <div key={line.id} className="rounded-lg border border-border p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-sm">Requirement Line {index + 1}</div>
                      {requirementLines.length > 1 && (
                        <Button size="icon" variant="ghost" className="size-8 text-rose-600" onClick={() => setRequirementLines((prev) => prev.filter((entry) => entry.id !== line.id))}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-2 md:col-span-2">
                        <Label>Item</Label>
                        <DailyItemSelector
                          lineId={line.id}
                          selectedItem={item}
                          items={dailyItems}
                          loading={loadingDailyItems}
                          error={dailyItemsError}
                          showAll={showAllItems}
                          recentItemIds={recentItemIds}
                          onSelect={(selectedItem) => {
                            setActiveItemLineId(line.id)
                            updateRequirementLine(line.id, {
                              itemId: selectedItem.id,
                              requiredClosingStock: selectedItem.safetyStock ?? 0,
                              storageCondition: selectedItem.storageCondition || line.storageCondition,
                            })
                          }}
                          onRefresh={() => void loadDailyItems()}
                          onToggleShowAll={() => setShowAllItems((current) => !current)}
                          onAddNew={() => openInlineItemCreate(line.id)}
                          onQuickAdd={() => openQuickItemCreate(line.id)}
                          onImport={() => {
                            setActiveItemLineId(line.id)
                            setShowImportDialog(true)
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Requirement</Label>
                        <Input type="number" min={0} step="0.001" value={line.operationalRequirement} onChange={(event) => updateRequirementLine(line.id, { operationalRequirement: Number(event.target.value || 0) })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Closing Stock</Label>
                        <Input type="number" min={0} step="0.001" value={line.requiredClosingStock} onChange={(event) => updateRequirementLine(line.id, { requiredClosingStock: Number(event.target.value || 0) })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div className="rounded-md bg-muted/20 p-2"><span className="block text-muted-foreground">Usable</span><b>{formatQty(usable)}</b></div>
                      <div className="rounded-md bg-muted/20 p-2"><span className="block text-muted-foreground">Pending</span><b>{formatQty(pending)}</b></div>
                      <div className="rounded-md bg-muted/20 p-2"><span className="block text-muted-foreground">Net Preview</span><b>{formatQty(netPreview)}</b></div>
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">Final Qty Override</Label>
                        <Input type="number" min={0} step="0.001" value={line.finalPurchaseQty ?? ''} onChange={(event) => updateRequirementLine(line.id, { finalPurchaseQty: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="Use calculated net" />
                      </div>
                    </div>
                    {line.finalPurchaseQty !== undefined && Math.abs(line.finalPurchaseQty - netPreview) > 0.001 && (
                      <div className="space-y-2">
                        <Label>Override Reason</Label>
                        <Input value={line.overrideReason} onChange={(event) => updateRequirementLine(line.id, { overrideReason: event.target.value })} placeholder="Required when final quantity differs from net calculation" />
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <Input value={line.qualityGrade} onChange={(event) => updateRequirementLine(line.id, { qualityGrade: event.target.value })} placeholder="Grade" />
                      <Input value={line.itemSpec} onChange={(event) => updateRequirementLine(line.id, { itemSpec: event.target.value })} placeholder="Specification" />
                      <Input value={line.storageCondition} onChange={(event) => updateRequirementLine(line.id, { storageCondition: event.target.value })} placeholder="Storage condition" />
                      <Input value={line.deliveryLocation} onChange={(event) => updateRequirementLine(line.id, { deliveryLocation: event.target.value })} placeholder="Line location" />
                    </div>
                  </div>
                )
              })}
            </div>
            <Button variant="outline" className="rounded-lg gap-2" onClick={() => setRequirementLines((prev) => [...prev, emptyRequirementLine()])}>
              <Plus className="size-4" /> Add Requirement Line
            </Button>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border bg-background/95">
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateBatch} disabled={busyAction === 'create-batch'}>
              {busyAction === 'create-batch' ? <Loader2 className="size-4 animate-spin" /> : null}
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInlineItemDialog} onOpenChange={(open) => {
        setShowInlineItemDialog(open)
        if (!open) setDuplicatePrompt(null)
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border bg-background/95">
            <DialogTitle className="flex items-center gap-2"><PackagePlus className="size-5 text-primary" /> Add Daily Procurement Item</DialogTitle>
            <DialogDescription>Create a shared Item Master record and select it in the active requirement line.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Item Name</Label>
                <Input value={dailyItemForm.name} onChange={(event) => setDailyItemForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Item Code</Label>
                <Input value={dailyItemForm.itemCode} onChange={(event) => setDailyItemForm((prev) => ({ ...prev, itemCode: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={dailyItemForm.category} onValueChange={(value) => setDailyItemForm((prev) => ({ ...prev, category: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent className="z-[100] max-h-72">
                    {itemCategories.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pricing Mode</Label>
                <Select value={dailyItemForm.pricingMode} onValueChange={(value) => setDailyItemForm((prev) => ({ ...prev, pricingMode: value as DailyItemFormState['pricingMode'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="DAILY_MARKET_RATE">Daily market rate</SelectItem>
                    <SelectItem value="MANUAL_QUOTATION">Manual quotation</SelectItem>
                    <SelectItem value="LAST_APPROVED_RATE">Last approved rate</SelectItem>
                    <SelectItem value="CONTRACT_RATE">Contract rate</SelectItem>
                    <SelectItem value="VENDOR_PRICE_LIST">Vendor price list</SelectItem>
                    <SelectItem value="EMERGENCY_PROVISIONAL_RATE">Emergency provisional rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Base Unit</Label>
                <Input value={dailyItemForm.baseUnit} onChange={(event) => setDailyItemForm((prev) => ({ ...prev, baseUnit: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Purchase Unit</Label>
                <Input value={dailyItemForm.purchaseUnit} onChange={(event) => setDailyItemForm((prev) => ({ ...prev, purchaseUnit: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Consumption Unit</Label>
                <Input value={dailyItemForm.consumptionUnit} onChange={(event) => setDailyItemForm((prev) => ({ ...prev, consumptionUnit: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Item Nature</Label>
                <Select
                  value={dailyItemForm.itemNature}
                  onValueChange={(value) => setDailyItemForm((prev) => ({
                    ...prev,
                    itemNature: value as DailyItemFormState['itemNature'],
                    perishable: value === 'PERISHABLE',
                    dailyProcurementEligible: value === 'SERVICE' ? false : prev.dailyProcurementEligible,
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="PERISHABLE">Perishable</SelectItem>
                    <SelectItem value="NON_PERISHABLE">Non-perishable</SelectItem>
                    <SelectItem value="SERVICE">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <span>Daily Eligible</span>
                <Switch
                  checked={dailyItemForm.dailyProcurementEligible}
                  onCheckedChange={(checked) => setDailyItemForm((prev) => ({ ...prev, dailyProcurementEligible: checked }))}
                  disabled={dailyItemForm.itemNature === 'SERVICE'}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <span>Quality Grade</span>
                <Switch checked={dailyItemForm.qualityGradeEnabled} onCheckedChange={(checked) => setDailyItemForm((prev) => ({ ...prev, qualityGradeEnabled: checked }))} />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Preferred Vendor</Label>
                <Select value={dailyItemForm.preferredSupplierId || '__none__'} onValueChange={(value) => setDailyItemForm((prev) => ({ ...prev, preferredSupplierId: value === '__none__' ? '' : value }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent className="z-[100] max-h-72">
                    <SelectItem value="__none__">No preferred vendor</SelectItem>
                    {activeSuppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Storage Condition</Label>
                <Input value={dailyItemForm.storageCondition} onChange={(event) => setDailyItemForm((prev) => ({ ...prev, storageCondition: event.target.value }))} placeholder="Cold room, dry storage" />
              </div>
            </div>
            <DuplicateMatchPanel
              duplicatePrompt={duplicatePrompt?.mode === 'inline' ? duplicatePrompt : null}
              onUseExisting={handleUseDuplicateMatch}
              onConfirm={handleConfirmDuplicateCreate}
              busy={busyAction === 'confirm-daily-item'}
            />
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border bg-background/95">
            <Button variant="outline" onClick={() => setShowInlineItemDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleInlineItemCreate()} disabled={busyAction === 'create-daily-item'}>
              {busyAction === 'create-daily-item' ? <Loader2 className="size-4 animate-spin" /> : null}
              Save and Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuickAddDialog} onOpenChange={(open) => {
        setShowQuickAddDialog(open)
        if (!open) setDuplicatePrompt(null)
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="size-5 text-primary" /> Quick Add Daily Item</DialogTitle>
            <DialogDescription>Create a DAILY active item that requires Item Master review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input value={quickItemName} onChange={(event) => setQuickItemName(event.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={quickItemCategory} onValueChange={setQuickItemCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent className="z-[100] max-h-72">
                    {itemCategories.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={quickItemUnit} onChange={(event) => setQuickItemUnit(event.target.value)} />
              </div>
            </div>
            <DuplicateMatchPanel
              duplicatePrompt={duplicatePrompt?.mode === 'quick' ? duplicatePrompt : null}
              onUseExisting={handleUseDuplicateMatch}
              onConfirm={handleConfirmDuplicateCreate}
              busy={busyAction === 'confirm-daily-item'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickAddDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleQuickItemCreate()} disabled={busyAction === 'quick-add-daily-item'}>
              {busyAction === 'quick-add-daily-item' ? <Loader2 className="size-4 animate-spin" /> : null}
              Quick Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={(open) => {
        setShowImportDialog(open)
        if (!open) {
          setImportFile(null)
          setImportResult(null)
        }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border bg-background/95">
            <DialogTitle className="flex items-center gap-2"><FileUp className="size-5 text-primary" /> Import Daily Procurement Items</DialogTitle>
            <DialogDescription>Upload CSV or Excel rows. Invalid, duplicate, and possible-match rows block the commit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1">
            <div className="rounded-lg border border-dashed border-border p-4">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null
                  setImportFile(file)
                  setImportResult(null)
                }}
              />
              <div className="mt-2 text-xs text-muted-foreground">
                Supported columns: Item name, Item code, Category, Base unit, Purchase unit, Consumption unit, Unit conversion, Pricing mode, Perishable, Preferred vendor, Storage condition, Minimum stock.
              </div>
            </div>
            {importResult ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2 text-sm">
                  <span className="font-semibold">{importResult.rows.length} row(s) validated</span>
                  <Badge variant="outline">{importResult.rows.filter((row) => row.status === 'VALID' || row.status === 'IMPORTED').length} valid/imported</Badge>
                </div>
                <ScrollArea className="h-72">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.rows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>{row.input.name || '-'}</TableCell>
                          <TableCell>{row.input.category || '-'}</TableCell>
                          <TableCell>{row.input.baseUnit || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(
                              row.status === 'VALID' || row.status === 'IMPORTED'
                                ? 'border-emerald-500/30 text-emerald-700'
                                : 'border-amber-500/30 text-amber-700',
                            )}>
                              {row.status.replaceAll('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.message || row.matches?.[0]?.name || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            ) : null}
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border bg-background/95">
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Close</Button>
            <Button variant="outline" onClick={handlePreviewImport} disabled={!importFile || importingItems}>
              {importingItems ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Validate
            </Button>
            <Button
              onClick={handleCommitImport}
              disabled={!importFile || importingItems || !importResult || importResult.rows.some((row) => row.status !== 'VALID')}
            >
              {importingItems ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              Import Valid Rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showQuoteDialog} onOpenChange={(open) => {
        setShowQuoteDialog(open)
        if (!open) setQuoteForm(emptyQuoteForm())
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Scale className="size-5 text-primary" /> Manual Vendor Quote Verification</DialogTitle>
            <DialogDescription>Record the supplier response and normalized rate fields after manual verification.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Enquiry Line</Label>
              <Select value={quoteForm.enquiryLineId} onValueChange={(value) => {
                const option = enquiryLineOptions.find((entry) => entry.id === value)
                setQuoteForm((prev) => ({
                  ...prev,
                  enquiryLineId: value,
                  quotedUnit: option?.unit || prev.quotedUnit,
                  qualityGrade: option?.line.qualityGrade || prev.qualityGrade,
                }))
              }}>
                <SelectTrigger><SelectValue placeholder="Select supplier and item" /></SelectTrigger>
                <SelectContent>
                  {enquiryLineOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.supplierName} - {option.line.itemName} ({option.enquiryNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedQuoteLine && (
                <p className="text-xs text-muted-foreground">
                  Requested {formatQty(selectedQuoteLine.line.finalPurchaseQty)} {selectedQuoteLine.line.unit}; stock unit {selectedQuoteLine.line.unit}.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Available Qty</Label>
                <Input type="number" min={0} step="0.001" value={quoteForm.availableQuantity} onChange={(event) => setQuoteForm((prev) => ({ ...prev, availableQuantity: Number(event.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Quoted Rate</Label>
                <Input type="number" min={0} step="0.01" value={quoteForm.quotedRate} onChange={(event) => setQuoteForm((prev) => ({ ...prev, quotedRate: Number(event.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Quoted Unit</Label>
                <Input value={quoteForm.quotedUnit} onChange={(event) => setQuoteForm((prev) => ({ ...prev, quotedUnit: event.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Conversion Factor</Label>
                <Input type="number" min={0} step="0.001" value={quoteForm.conversionFactor ?? ''} onChange={(event) => setQuoteForm((prev) => ({ ...prev, conversionFactor: event.target.value === '' ? undefined : Number(event.target.value) }))} placeholder="1 if same unit" />
              </div>
              <div className="space-y-2">
                <Label>Transport</Label>
                <Input type="number" min={0} step="0.01" value={quoteForm.transportCharge} onChange={(event) => setQuoteForm((prev) => ({ ...prev, transportCharge: Number(event.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Tax %</Label>
                <Input type="number" min={0} max={100} step="0.01" value={quoteForm.taxRate} onChange={(event) => setQuoteForm((prev) => ({ ...prev, taxRate: Number(event.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={quoteForm.verificationStatus} onValueChange={(value) => setQuoteForm((prev) => ({ ...prev, verificationStatus: value as QuoteFormState['verificationStatus'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VERIFIED">Verified</SelectItem>
                    <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={quoteForm.conversionApproximate} onCheckedChange={(checked) => setQuoteForm((prev) => ({ ...prev, conversionApproximate: !!checked }))} />
              Conversion is approximate
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input value={quoteForm.qualityGrade} onChange={(event) => setQuoteForm((prev) => ({ ...prev, qualityGrade: event.target.value }))} placeholder="Quoted grade" />
              <Input type="datetime-local" value={quoteForm.deliveryTime} onChange={(event) => setQuoteForm((prev) => ({ ...prev, deliveryTime: event.target.value }))} />
              <Input type="datetime-local" value={quoteForm.validityDateTime} onChange={(event) => setQuoteForm((prev) => ({ ...prev, validityDateTime: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Original Vendor Message</Label>
              <Textarea value={quoteForm.originalMessageText} onChange={(event) => setQuoteForm((prev) => ({ ...prev, originalMessageText: event.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Vendor Remarks</Label>
              <Textarea value={quoteForm.vendorRemarks} onChange={(event) => setQuoteForm((prev) => ({ ...prev, vendorRemarks: event.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuoteDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateQuote} disabled={busyAction === 'create-quote'}>
              {busyAction === 'create-quote' ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
