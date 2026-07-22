'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, subDays } from 'date-fns'
import {
  AlertTriangle, Building, Calendar, Check, CheckCircle, CheckCircle2, ChevronRight, Clock, Clock3, Copy, History,
  Inbox, Info, Layers, Loader2, MapPin, MessageCircle, PackageCheck, Plus, RefreshCw, Save, Search, Send,
  ShoppingBasket, Sparkles, Store, Trash2, Truck, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ItemResponse, SupplierResponse } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { AddItemDialog } from '@/components/inventory/AddItemDialog'
import { QuickAddDailyItemModal } from '@/components/procurement/QuickAddDailyItemModal'
import { useAppStore } from '@/lib/store'

type RequirementLine = {
  id: string; itemId: string; itemName: string; unit: string; operationalRequirement: number
  finalPurchaseQty: number; usableStock: number; confirmedPendingSupply: number
  qualityGrade?: string | null; notes?: string | null; item?: ItemResponse
}
type ConversationLine = {
  id: string; batchLineId: string; itemId: string; requestedQty: number; confirmedQty: number
  shortQty: number; cancelledQty: number; status: string; vendorRate?: number | null
  vendorNote?: string | null; confirmedDeliveryTime?: string | null; item: ItemResponse; batchLine: RequirementLine
}
type ProcurementMessage = {
  id: string; direction: string; message: string; messageType?: string | null; status: string
  createdAt: string; providerTimestamp?: string | null; attachmentMetadata?: Record<string, unknown> | null
  parsedSuggestion?: { lines?: Array<{ batchLineId: string; itemName: string; confirmedQty: number | null; vendorRate: number | null; status: string }>; confidence?: number; requiresHumanReview?: boolean } | null
  verificationStatus?: string | null
}
type SupplyOrder = {
  id: string; orderNumber: string; purchaseOrderId?: string | null; status: string
  lines: Array<{ id: string; itemId: string; itemName: string; orderedQty: number; acceptedQty: number; rejectedQty: number; unit: string }>
}
type Conversation = {
  id: string; status: string; unreadCount: number; normalizedPhone: string; supplier: SupplierResponse
  lines: ConversationLine[]; messages: ProcurementMessage[]; supplyOrders: SupplyOrder[]
}
type Requirement = {
  id: string; batchNumber: string; status: string; requirementDate?: string; deliveryDate: string
  deliveryTimeSlot?: string | null; deliveryLocation?: string | null; departmentName?: string | null
  notes?: string | null; createdBy: string; createdAt: string; completedAt?: string | null
  lines: RequirementLine[]; conversations: Conversation[]; supplyOrders: Array<SupplyOrder & { supplier: SupplierResponse }>
}
type DraftLine = { key: string; itemId: string; qty: string; qualityGrade: string; notes: string }
type ReceiptLine = { itemId: string; qty: string; grossWeight: string; containerWeight: string; rejectedQty: string; qualityResult: string; rejectionReason: string }

const OPEN_CONVERSATION = new Set(['DRAFT', 'SENT_TO_VENDOR', 'AWAITING_VENDOR_REPLY', 'REPLY_RECEIVED', 'NEEDS_REVIEW', 'PARTIALLY_CONFIRMED', 'CONFIRMED', 'SHORTAGE', 'ALTERNATE_VENDOR_REQUIRED', 'READY_FOR_RECEIVING'])
const createDraftKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
const newLine = (): DraftLine => ({ key: createDraftKey(), itemId: '', qty: '', qualityGrade: '', notes: '' })
const inputDate = (date: Date) => format(date, 'yyyy-MM-dd')

const TRANSLITERATION_MAP: Record<string, string[]> = {
  bata: ['potato', 'bataka', 'batata', 'aloo'],
  batak: ['potato', 'bataka', 'batata', 'aloo'],
  bataka: ['potato', 'bataka', 'batata', 'aloo'],
  batata: ['potato', 'bataka', 'batata', 'aloo'],
  aloo: ['potato', 'bataka', 'batata'],
  alu: ['potato', 'bataka', 'batata'],
  potat: ['potato', 'bataka', 'batata'],
  potato: ['potato', 'bataka', 'batata', 'aloo'],
  tamet: ['tomato', 'tameta', 'tamatar'],
  tameta: ['tomato', 'tameta', 'tamatar'],
  tamatar: ['tomato', 'tameta'],
  tomto: ['tomato', 'tameta'],
  tomato: ['tomato', 'tameta', 'tamatar'],
  dudh: ['milk', 'doodh'],
  doodh: ['milk', 'dudh'],
  milk: ['milk', 'dudh', 'doodh'],
  paneer: ['paneer'],
  paneeer: ['paneer'],
  chawal: ['rice'],
  rice: ['rice', 'chawal'],
  kanda: ['onion', 'pyaz', 'dungri'],
  pyaz: ['onion', 'kanda', 'dungri'],
  dungri: ['onion', 'kanda', 'pyaz'],
  onion: ['onion', 'kanda', 'pyaz', 'dungri'],
  pen: ['pen', 'gel pen', 'ball pen'],
  paper: ['paper', 'a4'],
}

function visibleStage(requirement: Requirement) {
  if (requirement.status === 'CLOSED') return 4
  if (requirement.supplyOrders?.some((order) => ['PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status))) return 3
  if (requirement.supplyOrders?.length || requirement.conversations?.some((conversation) => ['CONFIRMED', 'READY_FOR_RECEIVING', 'RECEIVED'].includes(conversation.status))) return 2
  if (requirement.conversations?.length) return 1
  return 0
}

function StageRail({ requirement }: { requirement: Requirement }) {
  const current = visibleStage(requirement)
  const stages = ['Requirement', 'Conversation', 'Confirmation', 'Receiving']
  return <div className="flex items-center gap-1 overflow-x-auto py-1">
    {stages.map((stage, index) => <div key={stage} className="flex items-center gap-1 shrink-0">
      <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', index <= current ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
        <span className={cn('grid size-4 place-items-center rounded-full text-[10px]', index < current ? 'bg-primary text-primary-foreground' : 'border border-current')}>{index < current ? <Check className="size-3" /> : index + 1}</span>
        {stage}
      </div>
      {index < stages.length - 1 && <ChevronRight className="size-3 text-muted-foreground" />}
    </div>)}
    {requirement.status === 'CLOSED' && <Badge className="ml-2 bg-emerald-600">Completed</Badge>}
  </div>
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export default function ConversationDrivenDailyProcurement({ items, suppliers, loadingMasterData }: { items: ItemResponse[]; suppliers: SupplierResponse[]; loadingMasterData: boolean }) {
  const [view, setView] = useState('requirements')
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [receiveOrder, setReceiveOrder] = useState<SupplyOrder | null>(null)
  const [requirementDate, setRequirementDate] = useState(inputDate(new Date()))
  const [deliveryDate, setDeliveryDate] = useState(inputDate(new Date()))
  const [deliveryTime, setDeliveryTime] = useState('08:00')
  const [location, setLocation] = useState('Main Store')
  const [department, setDepartment] = useState('Kitchen')
  const [requirementNotes, setRequirementNotes] = useState('')
  const [draftLines, setDraftLines] = useState<DraftLine[]>([newLine()])
  const [category, setCategory] = useState('all')
  const [itemQuery, setItemQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const composerInputRef = useRef<HTMLInputElement>(null)
  const [supplierId, setSupplierId] = useState('')
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  const [greeting, setGreeting] = useState('')
  const [conversationNotes, setConversationNotes] = useState('')
  const [preview, setPreview] = useState('')
  const [reply, setReply] = useState('')
  const [messageSearch, setMessageSearch] = useState('')
  const [confirmation, setConfirmation] = useState<Record<string, { confirmedQty: string; cancelledQty: string; vendorRate: string; vendorNote: string; confirmedDeliveryTime: string }>>({})
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([])
  const [receiptMeta, setReceiptMeta] = useState({ challanNumber: '', invoiceNumber: '', remarks: '', deliveryTime: '' })
  const [showAddItemDialog, setShowAddItemDialog] = useState(false)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false)

  const activeItems = useMemo(() => {
    const baseActive = items.filter((item) => item.active !== false && item.deletedAt === null && item.itemNature !== 'SERVICE')
    const explicitlyEligible = baseActive.filter((item) => item.dailyProcurementEligible === true)
    return explicitlyEligible.length > 0 ? explicitlyEligible : baseActive
  }, [items])

  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.active && !['BLOCKED', 'INACTIVE'].includes((supplier.status || '').toUpperCase())), [suppliers])
  const categories = useMemo(() => [...new Set(activeItems.map((item) => item.category).filter(Boolean))].sort(), [activeItems])
  const categoryChips = useMemo(() => ['all', ...new Set(['Vegetables', 'Fruits', 'Dairy', 'Grocery', 'Bakery', 'Frozen', 'Pantry', ...categories])], [categories])
  
  const filteredItems = useMemo(() => {
    const rawQ = itemQuery.trim().toLowerCase()
    if (!rawQ) {
      return activeItems.filter((item) => category === 'all' || item.category === category).slice(0, 80)
    }

    const searchTerms = [rawQ]
    for (const [key, equivalents] of Object.entries(TRANSLITERATION_MAP)) {
      if (rawQ.includes(key) || key.includes(rawQ)) {
        searchTerms.push(...equivalents)
      }
    }

    const scored = activeItems.map((item) => {
      if (category !== 'all' && item.category !== category) return null

      const itemName = (item.name || '').toLowerCase()
      const itemCode = (item.itemCode || '').toLowerCase()
      const shortName = (item.shortName || '').toLowerCase()
      const catName = (item.category || '').toLowerCase()
      const aliases = (item.aliases ?? []).map((a) => a.aliasText.toLowerCase())

      let score = 0
      if (itemName === rawQ) score = 100
      else if (shortName === rawQ) score = 90
      else if (aliases.some((a) => a === rawQ)) score = 95
      else if (itemCode === rawQ) score = 85
      else if (searchTerms.some((term) => itemName.startsWith(term) || shortName.startsWith(term))) score = 80
      else if (searchTerms.some((term) => aliases.some((a) => a.startsWith(term)))) score = 75
      else if (searchTerms.some((term) => itemName.includes(term) || shortName.includes(term) || catName.includes(term))) score = 60
      else if (searchTerms.some((term) => aliases.some((a) => a.includes(term)))) score = 55

      if (score === 0) return null
      return { item, score }
    }).filter(Boolean) as { item: (typeof activeItems)[0]; score: number }[]

    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.item)
  }, [activeItems, category, itemQuery])

  const selected = requirements.find((requirement) => requirement.id === selectedId) ?? requirements[0] ?? null
  const selectedConversation = selected?.conversations?.find((conversation) => conversation.id === conversationId) ?? selected?.conversations?.[0] ?? null

  const DRAFT_STORAGE_KEY = 'kg_inventra_daily_req_draft'
  const saveDraftToStorage = () => {
    try {
      const payload = {
        requirementDate,
        deliveryDate,
        deliveryTime,
        location,
        department,
        requirementNotes,
        draftLines: draftLines.filter((l) => l.itemId),
      }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
      toast.success('Session draft saved')
    } catch { toast.error('Could not save draft') }
  }
  const loadDraftFromStorage = () => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      if (parsed.requirementDate) setRequirementDate(parsed.requirementDate)
      if (parsed.deliveryDate) setDeliveryDate(parsed.deliveryDate)
      if (parsed.deliveryTime) setDeliveryTime(parsed.deliveryTime)
      if (parsed.location) setLocation(parsed.location)
      if (parsed.department) setDepartment(parsed.department)
      if (parsed.requirementNotes !== undefined) setRequirementNotes(parsed.requirementNotes)
      if (Array.isArray(parsed.draftLines) && parsed.draftLines.length > 0) setDraftLines(parsed.draftLines)
      toast.success('Draft restored')
      return true
    } catch { return false }
  }
  const clearDraftFromStorage = () => {
    try { localStorage.removeItem(DRAFT_STORAGE_KEY) } catch {}
  }

  const focusQuantityInput = (itemId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`qty-input-${itemId}`) as HTMLInputElement | null
      if (el) {
        el.focus()
        el.select()
      }
    }, 60)
  }

  const addItemToDraft = (itemId: string) => {
    const item = activeItems.find((it) => it.id === itemId)
    if (!item) return
    const existingIndex = draftLines.findIndex((line) => line.itemId === itemId)
    if (existingIndex >= 0) {
      toast.info(`${item.name} is already in requirement list. Focusing quantity.`)
      focusQuantityInput(itemId)
    } else {
      setDraftLines((rows) => {
        const cleanRows = rows.filter((r) => r.itemId !== '')
        return [...cleanRows, { key: createDraftKey(), itemId, qty: '1', qualityGrade: '', notes: '' }]
      })
      toast.success(`Added ${item.name} (${item.unit})`)
      focusQuantityInput(itemId)
    }
    setItemQuery('')
    setSelectedIndex(0)
  }

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (itemQuery.trim() === '') return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, Math.min(filteredItems.length - 1, 9)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const candidate = filteredItems[selectedIndex] || filteredItems[0]
      if (candidate) {
        addItemToDraft(candidate.id)
      }
    } else if (e.key === 'Escape') {
      setItemQuery('')
    }
  }

  const unitTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const line of draftLines) {
      if (!line.itemId || !Number(line.qty)) continue
      const item = activeItems.find((it) => it.id === line.itemId)
      const u = item?.unit || 'pcs'
      totals[u] = (totals[u] || 0) + Number(line.qty)
    }
    return Object.entries(totals).map(([u, val]) => `${val} ${u}`)
  }, [draftLines, activeItems])

  const mappedVendorCount = useMemo(() => {
    const suppliersSet = new Set<string>()
    for (const line of draftLines) {
      if (!line.itemId) continue
      const item = activeItems.find((it) => it.id === line.itemId)
      if (item?.preferredSupplierId) suppliersSet.add(item.preferredSupplierId)
    }
    return suppliersSet.size
  }, [draftLines, activeItems])

  const validLinesCount = useMemo(() => draftLines.filter((line) => line.itemId && Number(line.qty) > 0).length, [draftLines])

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const data = await requestJson<{ batches: Requirement[] }>('/api/daily-procurement?limit=200')
      setRequirements(data.batches)
      setSelectedId((current) => current && data.batches.some((batch) => batch.id === current) ? current : data.batches[0]?.id ?? null)
    } catch (error) { if (!quiet) toast.error(error instanceof Error ? error.message : 'Could not load daily procurement') }
    finally { if (!quiet) setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(true), 15000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const resetCreate = () => {
    setRequirementDate(inputDate(new Date())); setDeliveryDate(inputDate(new Date())); setDeliveryTime('08:00')
    setLocation('Main Store'); setDepartment('Kitchen'); setRequirementNotes(''); setDraftLines([newLine()])
  }
  const copyRequirement = (source?: Requirement) => {
    const copy = source ?? requirements.find((requirement) => inputDate(new Date(requirement.requirementDate || requirement.createdAt)) === inputDate(subDays(new Date(), 1))) ?? requirements[0]
    if (!copy) return toast.error('No previous requirement is available')
    setRequirementDate(inputDate(new Date())); setDeliveryDate(inputDate(new Date())); setDeliveryTime(copy.deliveryTimeSlot || '08:00')
    setLocation(copy.deliveryLocation || 'Main Store'); setDepartment(copy.departmentName || 'Kitchen'); setRequirementNotes(copy.notes || '')
    setDraftLines(copy.lines.map((line) => ({ key: createDraftKey(), itemId: line.itemId, qty: String(line.operationalRequirement), qualityGrade: line.qualityGrade || '', notes: line.notes || '' })))
    setCreateOpen(true)
  }
  const createRequirement = async () => {
    const selectedLines = draftLines.filter((line) => line.itemId)
    if (!selectedLines.length) {
      return toast.error('No item has been added to requirement. Type an item name above to start.')
    }
    const invalidQtyLine = selectedLines.find((line) => !Number(line.qty) || Number(line.qty) <= 0)
    if (invalidQtyLine) {
      const item = activeItems.find((it) => it.id === invalidQtyLine.itemId)
      return toast.error(`Please enter a valid quantity for ${item?.name || 'the selected item'}`)
    }
    const missingUnitLine = selectedLines.find((line) => {
      const item = activeItems.find((it) => it.id === line.itemId)
      return !item?.unit
    })
    if (missingUnitLine) {
      const item = activeItems.find((it) => it.id === missingUnitLine.itemId)
      return toast.error(`Unit configuration missing for ${item?.name || 'the selected item'}`)
    }

    const valid = selectedLines
    setBusy(true)
    try {
      const data = await requestJson<{ batch: Requirement }>('/api/daily-procurement', { method: 'POST', body: JSON.stringify({
        requirementDate, deliveryDate, deliveryTimeSlot: deliveryTime, deliveryLocation: location,
        departmentName: department, notes: requirementNotes,
        lines: valid.map((line) => ({ itemId: line.itemId, operationalRequirement: Number(line.qty), qualityGrade: line.qualityGrade || null, notes: line.notes || null })),
      }) })
      toast.success(`${data.batch.batchNumber} created`)
      clearDraftFromStorage()
      setCreateOpen(false)
      resetCreate()
      await refresh(true)
      setSelectedId(data.batch.id)
      
      // Post-creation: Open vendor conversation dialog automatically
      const batch = data.batch
      if (batch) {
        const ids = batch.lines.filter((line) => line.finalPurchaseQty > 0).map((line) => line.id)
        setSelectedLineIds(ids)
        setSupplierId('')
        setGreeting('')
        setConversationNotes('')
        setPreview('')
        setConversationOpen(true)
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create requirement') } finally { setBusy(false) }
  }

  const openConversationDialog = (shortageOnly = false) => {
    if (!selected) return
    const ids = shortageOnly && selectedConversation
      ? selectedConversation.lines.filter((line) => line.shortQty > 0).map((line) => line.batchLineId)
      : selected.lines.filter((line) => line.finalPurchaseQty > 0).map((line) => line.id)
    setSelectedLineIds(ids); setSupplierId(''); setGreeting(''); setConversationNotes(''); setPreview(''); setConversationOpen(true)
  }
  const conversationPayload = () => ({
    supplierId,
    greeting: greeting || null,
    notes: conversationNotes || null,
    lines: selectedLineIds.map((batchLineId) => {
      const shortage = selectedConversation?.lines.find((line) => line.batchLineId === batchLineId)?.shortQty
      const line = selected?.lines.find((entry) => entry.id === batchLineId)
      return { batchLineId, requestedQty: shortage && shortage > 0 ? shortage : line?.finalPurchaseQty || 0 }
    }).filter((line) => line.requestedQty > 0),
  })
  const previewConversation = async () => {
    if (!selected || !supplierId || !selectedLineIds.length) return toast.error('Select a vendor and at least one item')
    setBusy(true)
    try {
      const data = await requestJson<{ preview: string }>(`/api/daily-procurement/${selected.id}/conversations`, { method: 'POST', body: JSON.stringify({ ...conversationPayload(), previewOnly: true }) })
      setPreview(data.preview)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not build preview') } finally { setBusy(false) }
  }
  const sendRequirement = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const data = await requestJson<{ conversation: Conversation; duplicate: boolean }>(`/api/daily-procurement/${selected.id}/conversations`, { method: 'POST', body: JSON.stringify(conversationPayload()) })
      toast.success(data.duplicate ? 'This requirement was already sent to that vendor' : 'Requirement queued for WhatsApp')
      setConversationOpen(false); await refresh(true); setConversationId(data.conversation.id); setView('conversations')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not start conversation') } finally { setBusy(false) }
  }

  const sendReply = async (manualNote = false) => {
    if (!selectedConversation || !reply.trim()) return
    setBusy(true)
    try {
      await requestJson(`/api/daily-procurement/conversations/${selectedConversation.id}/messages`, { method: 'POST', body: JSON.stringify({ message: reply, messageType: manualNote ? 'MANUAL_NOTE' : 'USER_REPLY' }) })
      setReply(''); await refresh(true)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save message') } finally { setBusy(false) }
  }
  const openConfirmation = () => {
    if (!selectedConversation) return
    setConfirmation(Object.fromEntries(selectedConversation.lines.map((line) => [line.id, {
      confirmedQty: String(line.confirmedQty || line.requestedQty), cancelledQty: String(line.cancelledQty || 0), vendorRate: line.vendorRate == null ? '' : String(line.vendorRate),
      vendorNote: line.vendorNote || '', confirmedDeliveryTime: line.confirmedDeliveryTime?.slice(0, 16) || '',
    }]))); setConfirmOpen(true)
  }
  const confirmSupply = async () => {
    if (!selectedConversation) return
    setBusy(true)
    try {
      const result = await requestJson<{ approvalRequired: boolean }>(`/api/daily-procurement/conversations/${selectedConversation.id}/confirm`, { method: 'POST', body: JSON.stringify({
        source: 'WHATSAPP', lines: selectedConversation.lines.map((line) => ({
          conversationLineId: line.id, confirmedQty: Number(confirmation[line.id]?.confirmedQty || 0), cancelledQty: Number(confirmation[line.id]?.cancelledQty || 0),
          vendorRate: confirmation[line.id]?.vendorRate ? Number(confirmation[line.id].vendorRate) : null, vendorNote: confirmation[line.id]?.vendorNote || null,
          confirmedDeliveryTime: confirmation[line.id]?.confirmedDeliveryTime || null,
        })),
      }) })
      toast.success(result.approvalRequired ? 'Confirmation submitted for approval' : 'Supply confirmed and ready for receiving')
      setConfirmOpen(false); await refresh(true)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not confirm supply') } finally { setBusy(false) }
  }
  const reviewParsing = async (message: ProcurementMessage, action: 'ACCEPT' | 'IGNORE' | 'NEEDS_REVIEW') => {
    setBusy(true)
    try { await requestJson(`/api/daily-procurement/messages/${message.id}/review`, { method: 'PATCH', body: JSON.stringify({ action }) }); await refresh(true); toast.success(action === 'ACCEPT' ? 'Parsed quantities loaded for review' : 'Message updated') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not review message') } finally { setBusy(false) }
  }
  const openReceipt = (order: SupplyOrder) => {
    setReceiveOrder(order); setReceiptMeta({ challanNumber: '', invoiceNumber: '', remarks: '', deliveryTime: '' })
    setReceiptLines(order.lines.filter((line) => line.acceptedQty < line.orderedQty).map((line) => ({ itemId: line.itemId, qty: String(Math.max(0, line.orderedQty - line.acceptedQty)), grossWeight: '', containerWeight: '', rejectedQty: '0', qualityResult: 'ACCEPTED', rejectionReason: '' })))
  }
  const receiveItems = async () => {
    if (!receiveOrder?.purchaseOrderId) return toast.error('Internal receiving reference is unavailable')
    setBusy(true)
    try {
      await requestJson(`/api/purchase-orders/${receiveOrder.purchaseOrderId}/receive`, { method: 'POST', body: JSON.stringify({ ...receiptMeta, deliveryTime: receiptMeta.deliveryTime || undefined,
        items: receiptLines.map((line) => ({ itemId: line.itemId, qty: line.grossWeight ? undefined : Number(line.qty), grossWeight: line.grossWeight ? Number(line.grossWeight) : undefined, containerWeight: line.grossWeight ? Number(line.containerWeight || 0) : undefined, rejectedQty: Number(line.rejectedQty || 0), qualityResult: line.qualityResult, rejectionReason: line.rejectionReason || undefined })),
      }) })
      toast.success('Receipt posted; accepted quantity added to stock'); setReceiveOrder(null); await refresh(true)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not receive items') } finally { setBusy(false) }
  }

  const filteredRequirements = requirements.filter((requirement) => [requirement.batchNumber, requirement.deliveryLocation, requirement.departmentName, requirement.createdBy, ...requirement.lines.map((line) => line.itemName)].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()))
  const allConversations = requirements.flatMap((requirement) => requirement.conversations.map((conversation) => ({ requirement, conversation }))).filter(({ conversation }) => OPEN_CONVERSATION.has(conversation.status))
  const receivingOrders = requirements.flatMap((requirement) => requirement.supplyOrders.map((order) => ({ requirement, order }))).filter(({ order }) => !['RECEIVED', 'CANCELLED'].includes(order.status))

  if (loading || loadingMasterData) return <Card><CardContent className="flex h-72 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" /> Loading daily procurement…</CardContent></Card>

  return <div className="space-y-4">
    <div className="rounded-2xl border bg-gradient-to-r from-primary/[.08] via-background to-emerald-500/[.06] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="mb-1 flex items-center gap-2"><MessageCircle className="size-5 text-primary" /><h2 className="text-xl font-semibold">Conversation-driven daily buying</h2></div><p className="text-sm text-muted-foreground">Create, send, confirm and receive — every message and stock movement stays with the requirement.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => copyRequirement()}><Copy className="mr-2 size-4" />Copy yesterday</Button><Button onClick={() => { resetCreate(); setCreateOpen(true) }}><Plus className="mr-2 size-4" />Create requirement</Button></div>
      </div>
    </div>

    <Tabs value={view} onValueChange={setView}>
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="requirements"><ShoppingBasket className="mr-2 size-4" />Requirements</TabsTrigger>
        <TabsTrigger value="conversations"><MessageCircle className="mr-2 size-4" />Vendor Conversations{allConversations.some(({ conversation }) => conversation.unreadCount > 0) && <span className="ml-2 size-2 rounded-full bg-emerald-500" />}</TabsTrigger>
        <TabsTrigger value="receiving"><PackageCheck className="mr-2 size-4" />Receiving{receivingOrders.length > 0 && <Badge variant="secondary" className="ml-2">{receivingOrders.length}</Badge>}</TabsTrigger>
        <TabsTrigger value="history"><History className="mr-2 size-4" />History</TabsTrigger>
      </TabsList>

      <TabsContent value="requirements" className="mt-4 space-y-3">
        <div className="flex gap-2"><div className="relative max-w-md flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search requirement, item, location or user" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Button variant="outline" size="icon" onClick={() => refresh()}><RefreshCw className="size-4" /></Button></div>
        {filteredRequirements.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground"><Inbox className="mx-auto mb-3 size-9" />No daily requirements yet.</CardContent></Card> : filteredRequirements.map((requirement) => <Card key={requirement.id} className={cn('cursor-pointer transition hover:border-primary/40', selected?.id === requirement.id && 'border-primary/50')} onClick={() => setSelectedId(requirement.id)}>
          <CardContent className="p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{requirement.batchNumber}</span><Badge variant="outline">{requirement.departmentName || 'General'}</Badge><span className="text-sm text-muted-foreground">Delivery {format(new Date(requirement.deliveryDate), 'dd MMM')} {requirement.deliveryTimeSlot || ''}</span></div><p className="mt-1 truncate text-sm text-muted-foreground">{requirement.lines.map((line) => `${line.itemName} ${line.finalPurchaseQty} ${line.unit}`).join(' · ')}</p></div><StageRail requirement={requirement} /></div>
          {selected?.id === requirement.id && <div className="mt-4 grid gap-4 border-t pt-4 lg:grid-cols-[1fr_auto]"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{requirement.lines.map((line) => <div key={line.id} className="rounded-xl bg-muted/40 p-3"><div className="font-medium">{line.itemName}</div><div className="mt-1 text-sm"><b>{line.finalPurchaseQty} {line.unit}</b> required</div><div className="text-xs text-muted-foreground">Usable stock {line.usableStock} · Pending {line.confirmedPendingSupply}</div>{line.qualityGrade && <Badge variant="secondary" className="mt-2">{line.qualityGrade}</Badge>}</div>)}</div><div className="flex flex-col justify-center gap-2"><Button onClick={(event) => { event.stopPropagation(); openConversationDialog() }}><Send className="mr-2 size-4" />Start vendor conversation</Button>{requirement.conversations.length > 0 && <Button variant="outline" onClick={(event) => { event.stopPropagation(); setView('conversations') }}>Open workspace</Button>}</div></div>}</CardContent>
        </Card>)}
      </TabsContent>

      <TabsContent value="conversations" className="mt-4">
        <Card className="overflow-hidden shadow-sm border-border/60">
          <div className="grid min-h-[620px] lg:grid-cols-[270px_minmax(0,1fr)_310px]">
            
            {/* LEFT PANEL: Vendor List (270px) */}
            <div className="border-r bg-muted/20 flex flex-col h-full">
              <div className="border-b p-3 bg-card/50 space-y-0.5">
                <div className="font-bold text-xs uppercase tracking-wider text-foreground">Vendor Conversations</div>
                <div className="text-[11px] text-muted-foreground">Requirement vendor threads</div>
              </div>
              <ScrollArea className="flex-1 h-[560px]">
                <div className="p-2 space-y-1">
                  {allConversations.map(({ requirement, conversation }) => {
                    const isSelected = selectedConversation?.id === conversation.id
                    const displayStatus = conversation.status.replaceAll('_', ' ')
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => { setSelectedId(requirement.id); setConversationId(conversation.id) }}
                        className={cn(
                          'w-full text-left p-3 rounded-xl transition border text-xs relative flex flex-col gap-1',
                          isSelected
                            ? 'bg-primary/10 border-primary/30 font-medium'
                            : 'bg-card/40 border-border/30 hover:bg-muted/50'
                        )}
                      >
                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-xl" />}
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-foreground truncate">{conversation.supplier.name}</span>
                          {conversation.unreadCount > 0 && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500">
                              {conversation.unreadCount}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                          <span>{requirement.batchNumber}</span>
                          <span className="text-[10px] font-mono opacity-80">{conversation.normalizedPhone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 border-border/60 uppercase font-mono">
                            {displayStatus}
                          </Badge>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* CENTER PANEL: Main Conversation (Flexible min 520px) */}
            <div className="flex min-w-0 flex-col h-full bg-card">
              {selectedConversation && selected ? (
                <>
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between border-b p-3 bg-muted/20 gap-2 shrink-0">
                    <div>
                      <div className="font-bold text-sm text-foreground flex items-center gap-2">
                        {selectedConversation.supplier.name}
                        <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                          {selected.batchNumber}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {selectedConversation.normalizedPhone}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative w-44 hidden md:block">
                        <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                        <Input
                          className="h-7 text-xs pl-8 bg-background border-border"
                          placeholder="Search chat..."
                          value={messageSearch}
                          onChange={(e) => setMessageSearch(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                        onClick={() => useAppStore.getState().setCurrentView('whatsapp-inbox')}
                      >
                        <MessageCircle className="size-3.5 text-emerald-500" /> Open in Inbox
                      </Button>
                    </div>
                  </div>

                  {/* Message Timeline */}
                  <ScrollArea className="flex-1 h-[440px] bg-slate-50/40 dark:bg-slate-950/20">
                    <div className="space-y-3 p-4">
                      {selectedConversation.messages
                        .filter((message) => message.message.toLowerCase().includes(messageSearch.toLowerCase()))
                        .map((message) => {
                          const isSystem = message.messageType === 'SYSTEM_EVENT' || message.messageType === 'MANUAL_NOTE'
                          const isOutbound = message.direction === 'OUTBOUND'
                          return (
                            <div
                              key={message.id}
                              className={cn(
                                'flex',
                                isSystem ? 'justify-center' : isOutbound ? 'justify-end' : 'justify-start'
                              )}
                            >
                              <div
                                className={cn(
                                  'max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs leading-relaxed',
                                  message.messageType === 'SYSTEM_EVENT'
                                    ? 'bg-muted text-muted-foreground text-[11px] font-medium rounded-full px-4 py-1.5 border'
                                    : message.messageType === 'MANUAL_NOTE'
                                    ? 'border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-200'
                                    : isOutbound
                                    ? 'rounded-br-none bg-primary text-primary-foreground font-sans'
                                    : 'rounded-bl-none border bg-card text-foreground'
                                )}
                              >
                                <div className="whitespace-pre-wrap break-words">{message.message}</div>
                                <div className="mt-1 flex justify-end gap-1 text-[10px] opacity-70">
                                  {format(new Date(message.providerTimestamp || message.createdAt), 'dd MMM, HH:mm')}
                                  {isOutbound && (
                                    <span>
                                      {['READ'].includes(message.status) ? '✓✓' : ['DELIVERED'].includes(message.status) ? '✓✓' : '✓'}
                                    </span>
                                  )}
                                </div>
                                {message.parsedSuggestion && message.verificationStatus !== 'VERIFIED' && (
                                  <div className="mt-2.5 rounded-xl border bg-background/90 p-2.5 text-foreground space-y-1.5">
                                    <div className="text-[11px] font-bold text-primary">
                                      AI Suggestion • {Math.round((message.parsedSuggestion.confidence || 0) * 100)}% match
                                    </div>
                                    {message.parsedSuggestion.lines?.map((line) => (
                                      <div key={line.batchLineId} className="text-[11px]">
                                        {line.itemName}: <b>{line.confirmedQty ?? 'unclear'}</b> {line.vendorRate != null ? `• ₹${line.vendorRate}` : ''}
                                      </div>
                                    ))}
                                    <div className="mt-2 flex flex-wrap gap-1 pt-1">
                                      <Button size="sm" className="h-6.5 text-[11px] px-2.5" onClick={() => reviewParsing(message, 'ACCEPT')}>
                                        Accept
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-6.5 text-[11px] px-2.5" onClick={() => reviewParsing(message, 'NEEDS_REVIEW')}>
                                        Review
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-6.5 text-[11px] px-2 text-muted-foreground" onClick={() => reviewParsing(message, 'IGNORE')}>
                                        Ignore
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </ScrollArea>

                  {/* Sticky Composer */}
                  <div className="border-t p-3 bg-card shrink-0">
                    <div className="flex gap-2 items-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-[38px] shrink-0"
                        title="Add manual internal note"
                        onClick={() => sendReply(true)}
                        disabled={busy}
                      >
                        <Plus className="size-4 text-amber-600" />
                      </Button>
                      <Textarea
                        className="min-h-[38px] max-h-28 flex-1 resize-none text-xs p-2 bg-background border-border"
                        placeholder="Type reply to vendor or internal note..."
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            sendReply(false)
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-[38px] px-4 font-semibold text-xs gap-1.5 shrink-0 bg-primary shadow-xs"
                        onClick={() => sendReply(false)}
                        disabled={busy || !reply.trim()}
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        Send
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted-foreground p-6 text-center">
                  Select a vendor conversation from the left list
                </div>
              )}
            </div>

            {/* RIGHT PANEL: Requirement & Supply Context (310px) */}
            <div className="border-l bg-muted/10 p-4 space-y-4 flex flex-col h-full overflow-y-auto">
              {selectedConversation && selected ? (
                <>
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Requirement Context</div>
                    <div className="mt-1 font-bold text-sm text-foreground">{selected.batchNumber}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="size-3 text-primary" /> {selected.deliveryLocation || 'Main Store'} • {selected.deliveryTimeSlot || 'Morning'}
                    </div>
                  </div>

                  {/* Items list */}
                  <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                    {selectedConversation.lines.map((line) => (
                      <div key={line.id} className="rounded-xl border bg-card p-3 space-y-1.5 shadow-2xs">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-semibold text-xs text-foreground">{line.item.name}</span>
                          <Badge variant={line.shortQty > 0 ? 'destructive' : 'secondary'} className="text-[9.5px]">
                            {line.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/30">
                          <div>
                            <span className="text-[10px] text-muted-foreground">Requested</span>
                            <div className="font-bold">{line.requestedQty} {line.item.unit}</div>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground">Confirmed</span>
                            <div className="font-bold text-emerald-600 dark:text-emerald-400">{line.confirmedQty} {line.item.unit}</div>
                          </div>
                        </div>
                        {line.shortQty > 0 && (
                          <div className="mt-1.5 rounded-lg bg-destructive/10 p-1.5 text-[11px] text-destructive font-medium flex items-center gap-1">
                            <AlertTriangle className="size-3 shrink-0" /> Shortage: {line.shortQty} {line.item.unit}
                          </div>
                        )}
                        {line.vendorRate != null && (
                          <div className="text-[10.5px] text-muted-foreground font-mono pt-1">
                            Vendor Rate: ₹{line.vendorRate}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Confirmation Button Audit */}
                  <div className="space-y-2 pt-2 border-t border-border/40 shrink-0">
                    {selected.status === 'READY_FOR_RECEIVING' || selectedConversation.status === 'READY_FOR_RECEIVING' ? (
                      <Button
                        className="w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                        onClick={openConfirmation}
                      >
                        <CheckCircle2 className="size-3.5" /> View Supply Confirmation
                      </Button>
                    ) : (
                      <Button
                        className="w-full text-xs font-semibold bg-primary gap-1.5 shadow-xs"
                        onClick={openConfirmation}
                      >
                        <CheckCircle2 className="size-3.5" /> Confirm Supply
                      </Button>
                    )}

                    {selectedConversation.lines.some((line) => line.shortQty > 0) && (
                      <Button
                        variant="outline"
                        className="w-full text-xs font-semibold text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                        onClick={() => openConversationDialog(true)}
                      >
                        Send Remaining to Alternate Vendor
                      </Button>
                    )}
                  </div>
                </>
              ) : null}
            </div>

          </div>
        </Card>
      </TabsContent>

      <TabsContent value="receiving" className="mt-4 space-y-3">{receivingOrders.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground"><Truck className="mx-auto mb-3 size-9" />No confirmed deliveries are waiting.</CardContent></Card> : receivingOrders.map(({ requirement, order }) => <Card key={order.id}><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2 font-semibold">{order.supplier.name}<Badge variant="outline">{order.orderNumber}</Badge></div><div className="mt-1 text-sm text-muted-foreground">{requirement.batchNumber} · Due {format(new Date(requirement.deliveryDate), 'dd MMM')} {requirement.deliveryTimeSlot}</div><div className="mt-2 text-sm">{order.lines.map((line) => `${line.itemName} ${line.orderedQty - line.acceptedQty} ${line.unit} pending`).join(' · ')}</div></div><Button onClick={() => openReceipt(order)} disabled={!order.purchaseOrderId}><PackageCheck className="mr-2 size-4" />Receive items</Button></CardContent></Card>)}</TabsContent>

      <TabsContent value="history" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Procurement history</CardTitle></CardHeader><CardContent><div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Requirement, vendor, item, location, GRN or invoice" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="space-y-2">{filteredRequirements.map((requirement) => <div key={requirement.id} className="flex flex-col justify-between gap-2 rounded-xl border p-3 md:flex-row md:items-center"><div><div className="font-medium">{requirement.batchNumber}</div><div className="text-xs text-muted-foreground">{format(new Date(requirement.createdAt), 'dd MMM yyyy')} · {requirement.createdBy} · {requirement.deliveryLocation || 'No location'}</div></div><div className="flex items-center gap-2"><Badge variant="outline">{requirement.status.replaceAll('_', ' ')}</Badge><Button size="sm" variant="ghost" onClick={() => { setSelectedId(requirement.id); setView('requirements') }}>View</Button></div></div>)}</div></CardContent></Card></TabsContent>
    </Tabs>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent className="w-[96vw] max-w-[1800px] sm:max-w-[96vw] h-[90vh] max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col border-none shadow-2xl bg-background">
        {/* Sticky Dialog Header */}
        <DialogHeader className="px-6 py-3.5 border-b bg-background flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
              <ShoppingBasket className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">Prepare Tomorrow's Daily Requirement</DialogTitle>
              <p className="text-xs text-muted-foreground">Operational buying list — items, quantities, units & vendor readiness</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pr-8">
            <Button variant="outline" size="sm" onClick={() => copyRequirement()}>
              <Copy className="mr-1.5 size-3.5 text-primary" />
              Copy Yesterday
            </Button>
            <Button variant="ghost" size="sm" onClick={loadDraftFromStorage} title="Restore saved draft">
              <History className="mr-1.5 size-3.5" />
              Restore Draft
            </Button>
          </div>
        </DialogHeader>

        {/* Scrollable Two-Column Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,2.3fr)_minmax(320px,0.9fr)] gap-6 bg-slate-50/50 dark:bg-slate-950/30">
          {/* Left Column: Main Operational Workspace (70% Width) */}
          <div className="space-y-5 min-w-0">
            
            {/* Section 1: Delivery Information */}
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="py-2.5 px-4 border-b bg-muted/30">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Calendar className="size-4 text-primary" /> Delivery Information
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Req. Date</Label>
                  <Input type="date" className="h-9 text-xs mt-1 bg-background" value={requirementDate} onChange={(e) => setRequirementDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Delivery Date</Label>
                  <Input type="date" className="h-9 text-xs mt-1 bg-background" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Delivery Time</Label>
                  <Input type="time" className="h-9 text-xs mt-1 bg-background" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Location</Label>
                  <Input className="h-9 text-xs mt-1 bg-background" value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Department / Kitchen</Label>
                  <Input className="h-9 text-xs mt-1 bg-background" value={department} onChange={(e) => setDepartment(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Operational Item Builder & Fast Search */}
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="py-3 px-4 border-b bg-muted/30 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ShoppingBasket className="size-4 text-primary" /> Operational Item List
                </CardTitle>
                <Badge variant="secondary" className="text-xs font-medium px-2.5 py-0.5">
                  {validLinesCount} item{validLinesCount === 1 ? '' : 's'} added
                </Badge>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                
                {/* Category Chips Filter */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Filter by Category</div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {categoryChips.map((catName) => (
                      <Button
                        key={catName}
                        type="button"
                        variant={category === catName ? 'default' : 'outline'}
                        size="sm"
                        className={cn('h-7 text-xs rounded-full px-3.5 shrink-0 capitalize transition-all', category === catName && 'shadow-xs font-medium')}
                        onClick={() => {
                          setCategory(catName)
                          setSelectedIndex(0)
                        }}
                      >
                        {catName}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Unified Dynamic Add Item Composer */}
                <div className="space-y-1.5 relative">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" /> Add Item (Dynamic Composer)
                    </Label>
                    <span className="text-[10px] text-muted-foreground">Type name, alias, Gujarati, Hindi or transliteration</span>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-3 size-4 text-primary pointer-events-none" />
                    <Input
                      ref={composerInputRef}
                      className="pl-9 pr-9 text-xs h-10 bg-background w-full font-medium shadow-xs border-primary/40 focus-visible:ring-primary"
                      value={itemQuery}
                      onChange={(e) => {
                        setItemQuery(e.target.value)
                        setSelectedIndex(0)
                      }}
                      onKeyDown={handleComposerKeyDown}
                      placeholder="Type item name, alias, Gujarati, Hindi, vendor term or SKU... (e.g. pota, bataka, tamet, dudh)"
                    />
                    {itemQuery && (
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-8" onClick={() => setItemQuery('')}>
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Interactive Ranked Suggestions Dropdown */}
                  {itemQuery.trim() !== '' && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-primary/20 bg-card/95 backdrop-blur-md p-2 shadow-2xl space-y-1 max-h-64 overflow-y-auto animate-in fade-in duration-150">
                      {filteredItems.length === 0 ? (
                        <div className="py-4 px-2 text-center text-xs text-muted-foreground space-y-2">
                          <p>
                            No items match <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">"{itemQuery}"</code>
                            {category !== 'all' ? ` in ${category}` : ''}
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            {category !== 'all' && (
                              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCategory('all')}>
                                Search All Categories
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="h-7 text-xs bg-primary gap-1 shadow-xs font-semibold"
                              onClick={() => setShowQuickAddModal(true)}
                            >
                              <Sparkles className="size-3.5" /> Quick Add Daily Item
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setShowAddItemDialog(true)}
                            >
                              Open Full Item Master
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground flex justify-between border-b border-border/40">
                            <span>Select item to add directly (↑ ↓ Arrow keys + Enter)</span>
                            <span>{filteredItems.length} suggestions</span>
                          </div>
                          {filteredItems.slice(0, 10).map((item, index) => {
                            const usable = item.stock - item.reservedQty
                            const isSelected = index === selectedIndex
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => addItemToDraft(item.id)}
                                className={cn(
                                  'w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs transition-all border',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground border-primary font-medium shadow-xs'
                                    : 'bg-background hover:bg-muted/50 border-border/40'
                                )}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="font-bold flex items-center gap-2">
                                    <span>{item.name}</span>
                                    {(item.aliases ?? []).length > 0 && (
                                      <span className={cn('text-[10px] font-normal truncate', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                                        (Alias: {item.aliases?.map((a) => a.aliasText).join(', ')})
                                      </span>
                                    )}
                                  </div>
                                  <div className={cn('text-[10px] flex items-center gap-1.5 mt-0.5', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                                    <span className="capitalize">{item.category || 'General'}</span>
                                    <span>·</span>
                                    <span>{usable} {item.unit} usable stock</span>
                                  </div>
                                </div>
                                <Badge variant={isSelected ? 'secondary' : 'outline'} className="text-[10px] shrink-0 font-mono">
                                  {item.unit}
                                </Badge>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Requirement Items Table (Selected Rows Only) */}
                <div className="space-y-2 pt-2">
                  <div className="hidden md:grid grid-cols-[minmax(240px,2.5fr)_minmax(140px,1.2fr)_minmax(130px,1fr)_minmax(180px,1.5fr)_auto] gap-3 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>Selected Requirement Items</span>
                    <span>Quantity & Unit</span>
                    <span>Quality / Grade</span>
                    <span>Operational Note</span>
                    <span className="w-8"></span>
                  </div>

                  <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                    {draftLines.filter((l) => l.itemId).length === 0 ? (
                      <div className="py-10 text-center text-xs text-muted-foreground space-y-2 border border-dashed rounded-xl p-6 bg-muted/10">
                        <ShoppingBasket className="size-8 mx-auto text-muted-foreground/30" />
                        <p className="font-semibold text-foreground">No items added to requirement list yet</p>
                        <p className="text-[11px]">Type an item name, alias, Gujarati, or Hindi term in the composer above to start building your daily requirement.</p>
                      </div>
                    ) : (
                      draftLines.filter((l) => l.itemId).map((line) => {
                        const selectedItem = activeItems.find((item) => item.id === line.itemId)
                        if (!selectedItem) return null
                        const usableStock = selectedItem.stock - selectedItem.reservedQty
                        return (
                          <div key={line.key} className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-[minmax(240px,2.5fr)_minmax(140px,1.2fr)_minmax(130px,1fr)_minmax(180px,1.5fr)_auto] md:items-center shadow-2xs hover:border-primary/30 transition-colors">
                            {/* Established Item Info */}
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-foreground flex items-center gap-2">
                                <span>{selectedItem.name}</span>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 capitalize border-primary/30 text-primary font-normal">
                                  {selectedItem.category || 'General'}
                                </Badge>
                              </div>
                              <div className="mt-1 text-[10px] text-muted-foreground flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">
                                  {usableStock} {selectedItem.unit} stock
                                </span>
                                {selectedItem.preferredSupplierId && (
                                  <span className="truncate text-muted-foreground">
                                    · Vendor: <b className="font-medium text-foreground">{activeSuppliers.find((s) => s.id === selectedItem.preferredSupplierId)?.name || 'Mapped'}</b>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Focused Quantity Input */}
                            <div className="relative flex items-center">
                              <Input
                                id={`qty-input-${selectedItem.id}`}
                                type="number"
                                min="0"
                                step="0.001"
                                className="h-9 text-xs pr-12 font-bold text-primary border-primary/40 focus-visible:ring-primary"
                                placeholder="Qty"
                                value={line.qty}
                                onChange={(e) => setDraftLines((rows) => rows.map((row) => row.key === line.key ? { ...row, qty: e.target.value } : row))}
                              />
                              <span className="absolute right-2.5 text-[10px] font-bold text-muted-foreground uppercase pointer-events-none bg-muted/60 px-1.5 py-0.5 rounded">
                                {selectedItem.unit}
                              </span>
                            </div>

                            {/* Grade / Size */}
                            <div>
                              <Input
                                className="h-9 text-xs"
                                placeholder="Grade (e.g. Grade A)"
                                value={line.qualityGrade}
                                onChange={(e) => setDraftLines((rows) => rows.map((row) => row.key === line.key ? { ...row, qualityGrade: e.target.value } : row))}
                              />
                            </div>

                            {/* Item Note */}
                            <div>
                              <Input
                                className="h-9 text-xs"
                                placeholder="Operational note..."
                                value={line.notes}
                                onChange={(e) => setDraftLines((rows) => rows.map((row) => row.key === line.key ? { ...row, notes: e.target.value } : row))}
                              />
                            </div>

                            {/* Remove Action */}
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                onClick={() => setDraftLines((rows) => rows.filter((row) => row.key !== line.key))}
                                title="Remove item"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-xs border-dashed hover:border-primary/50 hover:bg-primary/5 font-medium transition-colors gap-1.5"
                    onClick={() => composerInputRef.current?.focus()}
                  >
                    <Plus className="size-3.5 text-primary" />
                    Type Next Item in Composer Above
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Contextual Sidebar (30% Width) */}
          <div className="space-y-4 min-w-0">
            
            {/* Requirement Summary Card */}
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="py-3 px-4 border-b bg-muted/30">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Info className="size-4 text-primary" /> Requirement Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5">
                <div className="flex items-center justify-between text-xs pb-2 border-b">
                  <span className="text-muted-foreground font-medium">Total Valid Items</span>
                  <Badge className="font-semibold text-xs px-2.5 py-0.5">{validLinesCount}</Badge>
                </div>

                {/* Unit Breakdown */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Quantity Breakdown</div>
                  {unitTotals.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic py-1">No quantities entered yet</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {unitTotals.map((totalStr) => (
                        <Badge key={totalStr} variant="secondary" className="text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary border border-primary/20">
                          {totalStr}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Delivery Target Recap */}
                <div className="pt-2.5 border-t space-y-2 text-xs">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Delivery Destination</div>
                  <div className="font-medium flex items-center gap-2 text-foreground">
                    <MapPin className="size-4 text-primary shrink-0" />
                    <span className="truncate">{location} ({department})</span>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-2">
                    <Clock className="size-4 text-muted-foreground shrink-0" />
                    <span>{deliveryDate} at {deliveryTime}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Vendor Readiness Card */}
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="py-3 px-4 border-b bg-muted/30">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <MessageCircle className="size-4 text-emerald-600" /> Vendor Readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Mapped Preferred Vendors</span>
                  <Badge variant="outline" className="font-semibold text-xs border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400">
                    {mappedVendorCount} Vendor{mappedVendorCount === 1 ? '' : 's'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed bg-muted/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  Upon creation, you will automatically be guided to select vendors and start WhatsApp conversations for supply.
                </p>
              </CardContent>
            </Card>

            {/* Compact Validation & Warnings Box */}
            {(!location.trim() || validLinesCount === 0 || draftLines.some((l) => l.itemId && !Number(l.qty))) && (
              <Card className="shadow-xs border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
                <CardContent className="p-3.5 space-y-1.5 text-xs text-amber-900 dark:text-amber-300">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    Operational Validation Checklist
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-800 dark:text-amber-400">
                    {validLinesCount === 0 && <li>Add at least one item with a valid quantity</li>}
                    {!location.trim() && <li>Delivery location is required</li>}
                    {draftLines.some((l) => l.itemId && !Number(l.qty)) && <li>Selected items require a quantity &gt; 0</li>}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Requirement Notes */}
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="py-2.5 px-4 border-b bg-muted/30">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Overall Requirement Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <Textarea
                  className="min-h-20 text-xs resize-none bg-background"
                  placeholder="Special instructions for suppliers or internal team..."
                  value={requirementNotes}
                  onChange={(e) => setRequirementNotes(e.target.value)}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sticky Dialog Footer */}
        <DialogFooter className="px-6 py-3.5 border-t bg-background flex flex-row items-center justify-between shrink-0 shadow-xs">
          <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={saveDraftToStorage}>
              <Save className="mr-1.5 size-3.5" />
              Save Draft
            </Button>
            <Button type="button" size="sm" onClick={createRequirement} disabled={busy || validLinesCount === 0} className="shadow-xs font-medium">
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Sparkles className="mr-1.5 size-4" />}
              Create & Start Vendor Conversation
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={conversationOpen} onOpenChange={setConversationOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Start vendor conversation</DialogTitle></DialogHeader><div className="grid gap-4 md:grid-cols-2"><div><Label>Vendor</Label><Select value={supplierId} onValueChange={(value) => { setSupplierId(value); setPreview('') }}><SelectTrigger><SelectValue placeholder="Choose active vendor" /></SelectTrigger><SelectContent>{activeSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.phone || supplier.contact || 'No WhatsApp'}</SelectItem>)}</SelectContent></Select></div><div><Label>Greeting (editable)</Label><Input value={greeting} onChange={(e) => { setGreeting(e.target.value); setPreview('') }} placeholder="Namaste Vendor," /></div></div><div><Label>Items sent to this vendor</Label><div className="mt-2 space-y-2 rounded-xl border p-3">{selected?.lines.map((line) => <label key={line.id} className="flex items-center gap-3"><Checkbox checked={selectedLineIds.includes(line.id)} onCheckedChange={(checked) => { setSelectedLineIds((ids) => checked ? [...ids, line.id] : ids.filter((id) => id !== line.id)); setPreview('') }} /><span className="flex-1">{line.itemName}</span><b>{selectedConversation?.lines.find((entry) => entry.batchLineId === line.id)?.shortQty || line.finalPurchaseQty} {line.unit}</b></label>)}</div></div><div><Label>Additional note (editable)</Label><Textarea value={conversationNotes} onChange={(e) => { setConversationNotes(e.target.value); setPreview('') }} /></div>{preview ? <div><Label>WhatsApp preview</Label><div className="mt-2 whitespace-pre-wrap rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">{preview}</div><p className="mt-1 text-xs text-muted-foreground">Item references and quantities are generated from the requirement and cannot be removed in the message editor.</p></div> : <Button variant="outline" onClick={previewConversation} disabled={busy}>Preview protected message</Button>}<DialogFooter><Button variant="outline" onClick={() => setConversationOpen(false)}>Cancel</Button><Button onClick={sendRequirement} disabled={busy || !preview}><Send className="mr-2 size-4" />Send</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Supply confirmation · {selectedConversation?.supplier.name}</DialogTitle></DialogHeader><div className="space-y-3">{selectedConversation?.lines.map((line) => <div key={line.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1.4fr_repeat(4,1fr)]"><div><div className="font-medium">{line.item.name}</div><div className="text-xs text-muted-foreground">Requested {line.requestedQty} {line.item.unit}</div></div><div><Label>Confirmed</Label><Input type="number" step="0.001" value={confirmation[line.id]?.confirmedQty || ''} onChange={(e) => setConfirmation((state) => ({ ...state, [line.id]: { ...state[line.id], confirmedQty: e.target.value } }))} /></div><div><Label>Cancel balance</Label><Input type="number" step="0.001" value={confirmation[line.id]?.cancelledQty || ''} onChange={(e) => setConfirmation((state) => ({ ...state, [line.id]: { ...state[line.id], cancelledQty: e.target.value } }))} /></div><div><Label>Optional rate</Label><Input type="number" step="0.01" value={confirmation[line.id]?.vendorRate || ''} onChange={(e) => setConfirmation((state) => ({ ...state, [line.id]: { ...state[line.id], vendorRate: e.target.value } }))} /></div><div><Label>Delivery promise</Label><Input type="datetime-local" value={confirmation[line.id]?.confirmedDeliveryTime || ''} onChange={(e) => setConfirmation((state) => ({ ...state, [line.id]: { ...state[line.id], confirmedDeliveryTime: e.target.value } }))} /></div><div className="md:col-span-5"><Input placeholder="Vendor note" value={confirmation[line.id]?.vendorNote || ''} onChange={(e) => setConfirmation((state) => ({ ...state, [line.id]: { ...state[line.id], vendorNote: e.target.value } }))} /></div></div>)}</div><DialogFooter><Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button onClick={confirmSupply} disabled={busy}><CheckCircle2 className="mr-2 size-4" />Confirm supply</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(receiveOrder)} onOpenChange={(open) => !open && setReceiveOrder(null)}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Receive items · {receiveOrder?.orderNumber}</DialogTitle></DialogHeader><div className="grid gap-3 md:grid-cols-4"><div><Label>Delivery time</Label><Input type="datetime-local" value={receiptMeta.deliveryTime} onChange={(e) => setReceiptMeta({ ...receiptMeta, deliveryTime: e.target.value })} /></div><div><Label>Challan number</Label><Input value={receiptMeta.challanNumber} onChange={(e) => setReceiptMeta({ ...receiptMeta, challanNumber: e.target.value })} /></div><div><Label>Invoice number</Label><Input value={receiptMeta.invoiceNumber} onChange={(e) => setReceiptMeta({ ...receiptMeta, invoiceNumber: e.target.value })} /></div><div><Label>Receiving notes</Label><Input value={receiptMeta.remarks} onChange={(e) => setReceiptMeta({ ...receiptMeta, remarks: e.target.value })} /></div></div><div className="space-y-3">{receiptLines.map((receipt) => { const orderLine = receiveOrder?.lines.find((line) => line.itemId === receipt.itemId); const net = receipt.grossWeight ? Number(receipt.grossWeight || 0) - Number(receipt.containerWeight || 0) : Number(receipt.qty || 0); const accepted = net - Number(receipt.rejectedQty || 0); return <div key={receipt.itemId} className="rounded-xl border p-3"><div className="mb-3 flex items-center justify-between"><div className="font-medium">{orderLine?.itemName}</div><Badge variant="outline">Confirmed {orderLine?.orderedQty} {orderLine?.unit}</Badge></div><div className="grid gap-2 md:grid-cols-6"><div><Label>Delivered qty</Label><Input type="number" step="0.001" value={receipt.qty} onChange={(e) => setReceiptLines((rows) => rows.map((row) => row.itemId === receipt.itemId ? { ...row, qty: e.target.value } : row))} /></div><div><Label>Gross weight</Label><Input type="number" step="0.001" value={receipt.grossWeight} onChange={(e) => setReceiptLines((rows) => rows.map((row) => row.itemId === receipt.itemId ? { ...row, grossWeight: e.target.value } : row))} /></div><div><Label>Crate / tare</Label><Input type="number" step="0.001" value={receipt.containerWeight} onChange={(e) => setReceiptLines((rows) => rows.map((row) => row.itemId === receipt.itemId ? { ...row, containerWeight: e.target.value } : row))} /></div><div><Label>Rejected</Label><Input type="number" step="0.001" value={receipt.rejectedQty} onChange={(e) => setReceiptLines((rows) => rows.map((row) => row.itemId === receipt.itemId ? { ...row, rejectedQty: e.target.value } : row))} /></div><div><Label>Quality</Label><Select value={receipt.qualityResult} onValueChange={(value) => setReceiptLines((rows) => rows.map((row) => row.itemId === receipt.itemId ? { ...row, qualityResult: value } : row))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACCEPTED">Accepted</SelectItem><SelectItem value="PARTIAL">Partial</SelectItem><SelectItem value="REJECTED">Rejected</SelectItem></SelectContent></Select></div><div className="rounded-lg bg-muted p-2 text-xs">Net <b>{net}</b><br/>Accepted <b>{accepted}</b></div><div className="md:col-span-6"><Input placeholder="Rejection reason / item receiving note" value={receipt.rejectionReason} onChange={(e) => setReceiptLines((rows) => rows.map((row) => row.itemId === receipt.itemId ? { ...row, rejectionReason: e.target.value } : row))} /></div></div></div>})}</div><p className="text-xs text-muted-foreground">Accepted quantity updates available stock through the existing GRN and stock-ledger engine. Rejected quantity never enters stock.</p><DialogFooter><Button variant="outline" onClick={() => setReceiveOrder(null)}>Cancel</Button><Button onClick={receiveItems} disabled={busy}><PackageCheck className="mr-2 size-4" />Post receipt</Button></DialogFooter></DialogContent></Dialog>

    <QuickAddDailyItemModal
      open={showQuickAddModal}
      onOpenChange={setShowQuickAddModal}
      prefilledName={itemQuery}
      prefilledCategory={category}
      activeItems={activeItems}
      onSuccess={(newItem) => {
        refresh()
        addItemToDraft(newItem.id)
        setItemQuery('')
      }}
      onOpenFullMaster={() => setShowAddItemDialog(true)}
    />

    <AddItemDialog
      open={showAddItemDialog}
      onOpenChange={setShowAddItemDialog}
      onSuccess={() => {
        refresh()
        toast.success('Item Master created and updated.')
      }}
    />
  </div>
}
