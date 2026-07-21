'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Loader2,
  Send,
  MessageCircle,
  Phone,
  Check,
  CheckCheck,
  Clock,
  ShoppingBag,
  Calendar,
  MapPin,
  Building,
  Search,
  ExternalLink,
  AlertCircle,
  Link2,
  WifiOff,
  ClipboardList,
  ShoppingCart,
  UserCheck,
  Layers,
  Paperclip,
  X,
  Filter,
  CheckCircle2,
  Sparkles,
  Bot,
  FileText,
  ArrowRight,
  Zap,
  TrendingUp,
  Package,
  ListChecks,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isToday, isYesterday } from 'date-fns'
import { useAppStore } from '@/lib/store'

type FilterTab = 'ALL' | 'VENDORS' | 'EMPLOYEES' | 'LINKED'
type RightPanelTab = 'context' | 'assistant'
type AssistantAction = 'summarize' | 'draft_reply' | 'next_action' | 'explain_status' | 'check_price' | 'check_stock' | 'extract_items' | 'general'

interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  action?: AssistantAction
  source?: 'gemini' | 'keyword'
  timestamp: Date
}

function formatPhoneNumber(phone: string | null | undefined) {
  if (!phone) return ''
  const clean = phone.replace(/@.*$/, '').trim()
  if (clean.length === 10) return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`
  if (clean.length === 12 && clean.startsWith('91')) return `+${clean.slice(0, 2)} ${clean.slice(2, 7)} ${clean.slice(7)}`
  return clean.startsWith('+') ? clean : `+${clean}`
}

export default function WhatsAppInboxView() {
  const user = useAppStore((s) => s.user)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const [threads, setThreads] = useState<any[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [activePhone, setActivePhone] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL')

  const [messages, setMessages] = useState<any[]>([])
  const [linkedRequest, setLinkedRequest] = useState<any>(null)
  const [linkedPO, setLinkedPO] = useState<any>(null)
  const [userContact, setUserContact] = useState<any>(null)

  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inputText, setInputText] = useState('')
  const [chatSearch, setChatSearch] = useState('')
  const [showChatSearch, setShowChatSearch] = useState(false)
  const [sending, setSending] = useState(false)

  // AI Assistant state
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('context')
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([])
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantQuery, setAssistantQuery] = useState('')
  const assistantScrollRef = useRef<HTMLDivElement>(null)

  const [sessionStatus, setSessionStatus] = useState<string>('DISCONNECTED')
  const [loadingSession, setLoadingSession] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'STORE_ADMIN'

  async function fetchSession() {
    try {
      const res = await fetch('/api/whatsapp/session')
      if (res.ok) {
        const data = await res.json()
        setSessionStatus(data.status || 'DISCONNECTED')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSession(false)
    }
  }

  async function fetchThreads() {
    try {
      const res = await fetch('/api/whatsapp/messages')
      if (res.ok) {
        const data = await res.json()
        setThreads(data.threads || [])
        // Default select first thread if available and none selected
        if (!activePhone && data.threads?.length > 0) {
          setActivePhone(data.threads[0].phone)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingThreads(false)
    }
  }

  async function fetchMessages(phone: string, isPolling = false) {
    if (!isPolling) setLoadingMessages(true)
    try {
      const res = await fetch(`/api/whatsapp/messages?phone=${phone}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        if (data.linkedRequest !== undefined) setLinkedRequest(data.linkedRequest)
        if (data.linkedPO !== undefined) setLinkedPO(data.linkedPO)
        if (data.userContact !== undefined) setUserContact(data.userContact)
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (!isPolling) setLoadingMessages(false)
    }
  }

  useEffect(() => {
    fetchThreads()
    fetchSession()
    const threadsInterval = setInterval(fetchThreads, 5000)
    const sessionInterval = setInterval(fetchSession, 3000)
    return () => {
      clearInterval(threadsInterval)
      clearInterval(sessionInterval)
    }
  }, [])

  useEffect(() => {
    if (activePhone) {
      fetchMessages(activePhone)
      const interval = setInterval(() => fetchMessages(activePhone, true), 3000)
      return () => clearInterval(interval)
    }
  }, [activePhone])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!inputText.trim() || sending || !activePhone || sessionStatus !== 'CONNECTED') return

    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: activePhone, message: inputText }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send message')
      }

      setInputText('')
      await fetchMessages(activePhone)
      await fetchThreads()
    } catch (err: any) {
      toast.error(err.message || 'Message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  function renderStatus(status: string) {
    if (status === 'PENDING') return <Clock className="size-3 text-muted-foreground" />
    if (status === 'PROCESSING') return <Loader2 className="size-3 text-primary animate-spin" />
    if (status === 'SENT') return <Check className="size-3 text-primary" />
    if (status === 'DELIVERED') return <CheckCheck className="size-3 text-primary" />
    if (status === 'READ') return <CheckCheck className="size-3 text-emerald-500 font-bold" />
    return null
  }

  function resolveContactName(thread: any) {
    if (thread?.supplier?.name) return thread.supplier.name
    if (thread?.userContact?.name) return `${thread.userContact.name} (${thread.userContact.department || 'Employee'})`
    if (thread?.senderName) return thread.senderName
    const rawNum = thread?.phone ? (thread.phone.includes('@') ? thread.phone.split('@')[0] : thread.phone) : ''
    const cleanNum = rawNum.replace(/\D/g, '')
    if (cleanNum.length >= 10) {
      return `Unknown Contact (+${cleanNum})`
    }
    return thread?.phone ? `+${thread.phone}` : 'Unknown Contact'
  }

  function getInitials(name: string) {
    if (!name) return '??'
    const cleanName = name.replace(/\s*\(.*?\)\s*/g, '').replace(/^Unknown Contact/i, 'UC')
    const parts = cleanName.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }

  const filteredThreads = useMemo(() => {
    let result = threads

    // Tab Filter
    if (filterTab === 'VENDORS') {
      result = result.filter((t) => Boolean(t.supplier))
    } else if (filterTab === 'EMPLOYEES') {
      result = result.filter((t) => Boolean(t.userContact))
    } else if (filterTab === 'LINKED') {
      result = result.filter((t) => Boolean(t.dailyBatch || t.supplier || t.userContact))
    }

    // Search Query
    const q = searchQuery.trim().toLowerCase()
    if (!q) return result

    return result.filter((t) => {
      const name = resolveContactName(t).toLowerCase()
      const phone = (t.phone || '').toLowerCase()
      const msg = (t.message || '').toLowerCase()
      const batchNum = (t.dailyBatch?.batchNumber || '').toLowerCase()
      return name.includes(q) || phone.includes(q) || msg.includes(q) || batchNum.includes(q)
    })
  }, [threads, searchQuery, filterTab])

  const activeThread = threads.find((t) => t.phone === activePhone)
  const activeName = activePhone ? resolveContactName(activeThread || { phone: activePhone, userContact }) : ''

  // ERP Context panel items
  const linkedMessage = messages.find((m) => m.dailyBatch || m.dailyConversation || m.supplier)
  const linkedBatch = linkedMessage?.dailyBatch || activeThread?.dailyBatch
  const linkedSupplier = linkedMessage?.supplier || activeThread?.supplier
  const activeUserContact = userContact || activeThread?.userContact

  const hasAnyContext = Boolean(linkedRequest || linkedPO || linkedBatch || linkedSupplier || activeUserContact)

  // AI Assistant API call
  async function callAssistant(action: AssistantAction, userQuery?: string) {
    if (!activePhone || messages.length === 0) {
      toast.error('Select a conversation with messages first.')
      return
    }

    const contactType = linkedSupplier ? 'vendor' : activeUserContact ? 'employee' : 'unknown'

    const actionLabels: Record<AssistantAction, string> = {
      summarize: 'Summarize Conversation',
      draft_reply: 'Draft Reply',
      next_action: 'Suggest Next Action',
      explain_status: 'Explain Status',
      check_price: 'Check Price',
      check_stock: 'Check Stock',
      extract_items: 'Extract Items',
      general: userQuery || 'General Query',
    }

    // Add user message
    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: actionLabels[action],
      action,
      timestamp: new Date(),
    }
    setAssistantMessages((prev) => [...prev, userMsg])
    setAssistantLoading(true)

    try {
      const res = await fetch('/api/whatsapp/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          messages: messages.slice(-30).map((m) => ({
            id: m.id,
            message: m.message,
            direction: m.direction,
            createdAt: m.createdAt,
            status: m.status,
            messageType: m.messageType,
          })),
          context: {
            contactName: activeName,
            contactType,
            phone: activePhone,
            linkedRequest: linkedRequest
              ? {
                  id: linkedRequest.id,
                  status: linkedRequest.status,
                  employee: linkedRequest.employee || linkedRequest.user?.name || '',
                  department: linkedRequest.department || linkedRequest.user?.department || '',
                  note: linkedRequest.note,
                  lines: linkedRequest.lines?.map((l: any) => ({
                    itemName: l.itemName || l.item?.name || '',
                    requestedQty: l.requestedQty,
                    unit: l.unit || l.item?.unit || 'pcs',
                  })),
                }
              : undefined,
            linkedPO: linkedPO
              ? {
                  poNumber: linkedPO.poNumber,
                  status: linkedPO.status,
                  supplierName: linkedPO.supplier?.name,
                  totalAmount: linkedPO.totalAmount,
                }
              : undefined,
            linkedBatch: linkedBatch
              ? {
                  batchNumber: linkedBatch.batchNumber,
                  status: linkedBatch.status,
                  deliveryDate: linkedBatch.deliveryDate,
                  deliveryLocation: linkedBatch.deliveryLocation,
                  departmentName: linkedBatch.departmentName,
                }
              : undefined,
            userQuery,
            replyLanguage: 'english',
          },
        }),
      })

      if (!res.ok) {
        throw new Error('Assistant request failed')
      }

      const data = await res.json()

      const assistantMsg: AssistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        action,
        source: data.source,
        timestamp: new Date(),
      }
      setAssistantMessages((prev) => [...prev, assistantMsg])

      // If draft_reply, auto-insert into composer
      if (action === 'draft_reply' && data.response) {
        setInputText(data.response)
        toast.success('Draft reply inserted into composer. Review before sending.')
      }
    } catch (err: any) {
      const errorMsg: AssistantMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'AI assistance is currently unavailable. Please try again later.',
        action,
        timestamp: new Date(),
      }
      setAssistantMessages((prev) => [...prev, errorMsg])
      toast.error('Assistant request failed.')
    } finally {
      setAssistantLoading(false)
    }
  }

  // Scroll assistant panel to bottom on new messages
  useEffect(() => {
    if (assistantScrollRef.current) {
      assistantScrollRef.current.scrollTop = assistantScrollRef.current.scrollHeight
    }
  }, [assistantMessages])

  const messageGroups = useMemo(() => {
    const groups: { dateLabel: string; items: any[] }[] = []
    let currentDateLabel = ''

    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt)
      let label = ''
      if (isToday(msgDate)) {
        label = 'Today'
      } else if (isYesterday(msgDate)) {
        label = 'Yesterday'
      } else {
        label = format(msgDate, 'dd MMMM yyyy')
      }

      if (label !== currentDateLabel) {
        currentDateLabel = label
        groups.push({ dateLabel: label, items: [msg] })
      } else {
        groups[groups.length - 1].items.push(msg)
      }
    })

    return groups
  }, [messages])

  return (
    <div className="h-[calc(100vh-100px)] min-h-[600px] w-full max-w-full min-w-0 border border-border/60 rounded-2xl bg-card shadow-xs overflow-hidden flex flex-col animate-in fade-in duration-300 relative">
      
      {/* 1. ConnectionStatusBar (Single Top Status Bar: Height 34px) */}
      <div className="shrink-0 px-4 py-1 h-[36px] border-b border-border/40 bg-muted/40 flex items-center justify-between text-xs min-w-0 w-full gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {sessionStatus === 'CONNECTED' ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-semibold text-[10px] uppercase px-2 py-0 gap-1 h-[20px] leading-[1.2] shrink-0">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold text-[10px] uppercase px-2 py-0 gap-1 h-[20px] leading-[1.2] shrink-0">
              <span className="size-1.5 rounded-full bg-amber-500" /> Offline Mode
            </Badge>
          )}
          <span className="text-xs text-muted-foreground font-normal leading-snug truncate min-w-0">
            {sessionStatus === 'CONNECTED'
              ? 'WhatsApp bridge is connected. Live messages send and receive automatically.'
              : 'Historical messages are available for review, but live messaging is currently disconnected.'}
          </span>
        </div>

        {sessionStatus !== 'CONNECTED' && isAdmin && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 gap-1 px-2 shrink-0"
            onClick={() => setCurrentView('integrations')}
          >
            <ExternalLink className="size-3.5" /> Connection Settings
          </Button>
        )}
      </div>

      {/* 2. InboxShell (Parent Desktop Grid Contract) */}
      <div 
        className="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden relative"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 300px) minmax(0, 1fr) minmax(280px, 300px)',
          height: '100%',
        }}
      >
        
        {/* PANEL 1: ConversationPanel */}
        <div 
          className="w-full min-w-0 border-r border-border/40 bg-muted/10 flex flex-col h-full overflow-hidden relative"
          style={{ width: '300px', minWidth: '280px', maxWidth: '320px' }}
        >
          {/* Header & Search */}
          <div className="p-3 border-b border-border/40 space-y-2 bg-card/60 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
                  <MessageCircle className="size-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60 leading-snug">WhatsApp Console</h3>
                  <p className="text-[10px] text-muted-foreground/50 leading-snug font-normal">{threads.length} conversations</p>
                </div>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search contact, phone, REQ, PO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-7 h-9 bg-background border-border"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Quick Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-0.5 min-w-0 whitespace-nowrap">
              {(['ALL', 'VENDORS', 'EMPLOYEES', 'LINKED'] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab)}
                  className={`px-2.5 py-0.5 rounded-md text-[10px] transition h-7 flex items-center justify-center shrink-0 font-bold uppercase tracking-wider ${
                    filterTab === tab
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted/60 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border/30 min-w-0">
            {loadingThreads ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-6">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span className="text-[11px]">Loading conversations…</span>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground space-y-1.5">
                <MessageCircle className="size-6 text-muted-foreground/30" />
                <p className="text-[11.5px] font-semibold text-foreground">No conversations found.</p>
                <p className="text-[10.5px] text-muted-foreground max-w-[190px]">
                  {searchQuery ? 'Try matching by phone, name, or requisition code.' : 'Incoming and outgoing WhatsApp messages will render here.'}
                </p>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isActive = activePhone === thread.phone
                const displayName = resolveContactName(thread)
                const isVendor = Boolean(thread.supplier)
                const isEmployee = Boolean(thread.userContact)
                const batchNum = thread.dailyBatch?.batchNumber

                return (
                  <button
                    key={thread.phone}
                    type="button"
                    onClick={() => setActivePhone(thread.phone)}
                    className={`w-full text-left px-3 py-2 h-[52px] flex flex-col justify-center transition-colors relative hover:bg-primary/5 min-w-0 overflow-hidden ${
                      isActive ? 'bg-primary/8 font-medium' : ''
                    }`}
                  >
                    {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}

                    {/* Top Row: Avatar + Contact Name Baseline Aligned with Timestamp */}
                    <div className="flex justify-between items-center gap-1.5 mb-0.5 min-w-0 w-full">
                      <span className="font-semibold text-xs leading-snug truncate flex items-center gap-1.5 text-foreground min-w-0 flex-1">
                        <Avatar className="size-6 border shrink-0">
                          <AvatarFallback
                            className={`text-[8.5px] font-bold ${
                              isVendor
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : isEmployee
                                ? 'bg-blue-500/10 text-blue-600'
                                : 'bg-amber-500/10 text-amber-600'
                            }`}
                          >
                            {getInitials(displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate min-w-0">{displayName}</span>
                      </span>
                      <span className="text-[10px] font-normal text-muted-foreground/50 shrink-0 font-mono tabular-nums">
                        {thread.createdAt ? format(new Date(thread.createdAt), 'HH:mm') : ''}
                      </span>
                    </div>

                    {/* Bottom Row: Preview Text Baseline Aligned with Reference Badge */}
                    <div className="flex items-center justify-between pl-7 gap-1.5 min-w-0 w-full">
                      <p className="text-[10px] font-normal leading-snug text-muted-foreground/60 truncate min-w-0 flex-1">
                        {thread.direction === 'OUTBOUND' && <span className="text-primary font-medium mr-1">You:</span>}
                        {thread.message}
                      </p>
                      {batchNum && (
                        <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-primary/30 text-primary font-mono shrink-0 h-5">
                          {batchNum}
                        </Badge>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* PANEL 2: ChatPanel */}
        <div 
          className="flex-1 min-w-0 w-full flex flex-col h-full overflow-hidden bg-background relative"
          style={{ minWidth: 0 }}
        >
          {activePhone ? (
            <>
              {/* Chat Header */}
              <div className="py-2.5 px-4 border-b border-border/40 bg-card flex items-center justify-between shrink-0 h-[44px] min-w-0 w-full">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Avatar className="size-7 border shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-[10px]">
                      {getInitials(activeName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5 leading-tight min-w-0">
                      <span className="truncate min-w-0">{activeName}</span>
                      {activeThread?.supplier && (
                        <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-emerald-500/30 text-emerald-600 bg-emerald-500/5 h-5 shrink-0">
                          Vendor
                        </Badge>
                      )}
                      {activeThread?.userContact && (
                        <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 border-blue-500/30 text-blue-600 bg-blue-500/5 h-5 shrink-0">
                          Employee
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] font-normal text-muted-foreground font-mono leading-none mt-0.5 truncate min-w-0">{formatPhoneNumber(activePhone)}</p>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {showChatSearch ? (
                    <div className="relative animate-in fade-in slide-in-from-right-2 duration-200">
                      <Search className="absolute left-2.5 top-1.5 size-3 text-muted-foreground" />
                      <Input
                        placeholder="Search in chat..."
                        value={chatSearch}
                        onChange={(e) => setChatSearch(e.target.value)}
                        className="pl-7 pr-6 text-[11px] h-[26px] w-40 bg-background"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { setShowChatSearch(false); setChatSearch('') }}
                        className="absolute right-2 top-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-6.5 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowChatSearch(true)}
                      title="Search in conversation"
                    >
                      <Search className="size-3" />
                    </Button>
                  )}
                  <Badge variant="outline" className="text-[10px] font-bold font-mono border-border/60 uppercase h-5 px-1.5 tracking-tight shrink-0">
                    Live Chat
                  </Badge>
                </div>
              </div>

              {/* Message Timeline Viewport Area (Padding: 16px 20px, with 20px gap on right) */}
              <div
                className="p-4 pr-5 flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 scrollbar-thin bg-slate-50/40 dark:bg-slate-950/20"
                ref={scrollRef}
              >
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    <span className="text-[11px]">Loading messages…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground space-y-1">
                    <MessageCircle className="size-5 text-muted-foreground/30" />
                    <p className="font-semibold text-foreground text-[11.5px]">No messages in this conversation yet.</p>
                  </div>
                ) : (
                  messageGroups.map((group) => {
                    const groupMessages = chatSearch.trim()
                      ? group.items.filter((m) => m.message.toLowerCase().includes(chatSearch.toLowerCase()))
                      : group.items

                    if (groupMessages.length === 0) return null

                    return (
                      <div key={group.dateLabel} className="space-y-2">
                        {/* Date Separator Pill */}
                        <div className="flex justify-center my-1">
                          <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/40 shadow-2xs">
                            {group.dateLabel}
                          </span>
                        </div>

                        {groupMessages.map((msg) => {
                          const isOutbound = msg.direction === 'OUTBOUND'
                          const isSystem = msg.messageType === 'SYSTEM_EVENT' || msg.messageType === 'MANUAL_NOTE'

                          if (isSystem) {
                            return (
                              <div key={msg.id} className="flex justify-center my-0.5">
                                <div className="text-[10px] font-normal leading-[1.3] px-[9px] py-[4px] rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 max-w-[65%] text-center">
                                  {msg.message}
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={msg.id}
                              className={`flex flex-col max-w-[65%] w-fit box-border ${
                                isOutbound ? 'self-end items-end ml-auto mr-0' : 'self-start items-start mr-auto ml-0'
                              }`}
                            >
                              {/* Message Bubble Container with exact 12px 14px padding and rounded-[14px] */}
                              <div
                                className={`px-3 py-2 rounded-xl text-xs font-normal leading-snug shadow-2xs box-border overflow-wrap-break-word word-break-normal white-space-pre-wrap ${
                                  isOutbound
                                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                                    : 'bg-card border border-border/70 rounded-bl-sm text-foreground'
                                }`}
                              >
                                {!isOutbound && (
                                  <div className="text-[10px] font-semibold text-primary/80 mb-0.5">
                                    {activeName}
                                  </div>
                                )}
                                <div className="space-y-2">
                                  {msg.message.split('\n\n').map((paragraph: string, idx: number) => (
                                    <p key={idx} className="whitespace-pre-wrap break-words font-sans m-0">
                                      {paragraph}
                                    </p>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 mt-0.5 px-1 text-[10px] font-normal leading-snug text-muted-foreground/50">
                                {isOutbound && <span className="font-medium text-primary">You</span>}
                                {isOutbound && <span>•</span>}
                                <span className="font-mono">{format(new Date(msg.createdAt), 'HH:mm')}</span>
                                {isOutbound && renderStatus(msg.status)}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Sticky Message Composer (Padding: 10px 12px) */}
              <div className="p-2.5 border-t border-border/40 bg-card shrink-0 min-w-0 w-full">
                {sessionStatus === 'CONNECTED' ? (
                  <form onSubmit={handleSend} className="flex gap-1.5 items-end min-w-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-[34px] shrink-0 text-muted-foreground hover:text-foreground"
                      title="Attach file"
                      onClick={() => toast.info('File attachment feature ready.')}
                    >
                      <Paperclip className="size-3.5" />
                    </Button>

                    <Textarea
                      placeholder="Type operational response or procurement update..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSend(e)
                        }
                      }}
                      className="bg-background border-border text-xs leading-snug min-h-[34px] max-h-24 flex-1 resize-none p-2 min-w-0"
                    />

                    <Button
                      type="submit"
                      disabled={sending || !inputText.trim()}
                      className="h-[34px] bg-primary font-medium text-xs gap-1.5 px-3 shadow-xs shrink-0"
                    >
                      {sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                      Send
                    </Button>
                  </form>
                ) : (
                  /* Compact Disconnected Composer Input State (No large redundant alert card!) */
                  <div className="h-[36px] px-3 py-1.5 rounded-lg bg-muted/50 border border-border/60 flex items-center justify-between text-[11px] text-muted-foreground min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <WifiOff className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="truncate">
                        WhatsApp is disconnected. Live replies are unavailable.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2 p-6 text-center">
              <MessageCircle className="size-8 text-muted-foreground/30" />
              <h3 className="text-xs font-semibold text-foreground">Select a conversation to view messages.</h3>
              <p className="text-[10.5px] max-w-xs text-muted-foreground/80">
                Select a contact thread from the left panel to review message history and business context details.
              </p>
            </div>
          )}
        </div>

        {/* PANEL 3: ContextPanel */}
        <div 
          className="w-full min-w-0 border-l border-border/40 bg-muted/10 flex flex-col h-full overflow-hidden relative"
          style={{ width: '300px', minWidth: '280px', maxWidth: '320px' }}
        >
          {/* Tab Header (Grid 2 columns) */}
          <div className="p-1 border-b border-border/40 bg-card/60 shrink-0 h-9 grid grid-cols-2 gap-1 min-w-0">
            <button
              type="button"
              onClick={() => setRightPanelTab('context')}
              className={`flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-semibold transition min-w-0 whitespace-nowrap ${
                rightPanelTab === 'context'
                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Layers className="size-3.5 shrink-0" /> Context
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab('assistant')}
              className={`flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-semibold transition min-w-0 whitespace-nowrap ${
                rightPanelTab === 'assistant'
                  ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Sparkles className="size-3.5 shrink-0" /> AI Assistant
            </button>
          </div>

          {/* Tab Content */}
          {rightPanelTab === 'context' ? (
            /* ====== RELATED BUSINESS CONTEXT TAB ====== */
            <div className="p-3 flex-1 overflow-y-auto space-y-2.5 text-xs scrollbar-thin min-w-0">
              {hasAnyContext ? (
                <div className="space-y-2 min-w-0">
                  
                  {/* Store Requisition Context */}
                  {linkedRequest && (
                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-mono font-semibold text-xs text-primary flex items-center gap-1 truncate min-w-0">
                          <ClipboardList className="size-3 shrink-0" /> REQ-{linkedRequest.id.slice(-6).toUpperCase()}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold border-primary/30 text-primary h-5 px-1.5 shrink-0">
                          {linkedRequest.status}
                        </Badge>
                      </div>
                      <div className="space-y-1 border-t border-primary/10 pt-1 text-[10px] min-w-0">
                        <div className="grid grid-cols-[minmax(72px,auto)_minmax(0,1fr)] gap-2 items-center min-w-0">
                          <span className="text-[10px] text-muted-foreground">Requester:</span>
                          <strong className="text-xs text-foreground font-medium text-right truncate min-w-0">{linkedRequest.employee} ({linkedRequest.department})</strong>
                        </div>
                        {linkedRequest.note && <div className="line-clamp-2 italic text-[10px] text-muted-foreground/60">"{linkedRequest.note}"</div>}
                      </div>
                      {linkedRequest.lines?.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-primary/10">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Requested Items ({linkedRequest.lines.length})</div>
                          {linkedRequest.lines.map((l: any) => (
                            <div key={l.id} className="flex justify-between items-center p-1.5 bg-background border rounded-md text-xs gap-2 min-w-0">
                              <span className="font-medium truncate min-w-0">{l.itemName || l.item?.name}</span>
                              <span className="font-mono font-semibold shrink-0">{l.requestedQty} {l.unit}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Purchase Order Context */}
                  {linkedPO && (
                    <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-mono font-semibold text-xs text-emerald-600 flex items-center gap-1 truncate min-w-0">
                          <ShoppingCart className="size-3 shrink-0" /> {linkedPO.poNumber}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold border-emerald-500/30 text-emerald-600 h-5 px-1.5 shrink-0">
                          {linkedPO.status}
                        </Badge>
                      </div>
                      <div className="space-y-1 border-t border-emerald-500/10 pt-1 text-[10px] min-w-0">
                        <div className="grid grid-cols-[minmax(72px,auto)_minmax(0,1fr)] gap-2 items-center min-w-0">
                            <span className="text-[10px] text-muted-foreground">Vendor:</span>
                          <strong className="text-xs text-foreground font-medium text-right truncate min-w-0">{linkedPO.supplier?.name}</strong>
                        </div>
                        <div className="grid grid-cols-[minmax(72px,auto)_minmax(0,1fr)] gap-2 items-center min-w-0">
                            <span className="text-[10px] text-muted-foreground">Total:</span>
                          <strong className="text-xs text-foreground font-medium text-right truncate min-w-0">₹{linkedPO.totalAmount?.toLocaleString()}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Daily Procurement Batch Context */}
                  {linkedBatch && (
                    <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-mono font-semibold text-xs text-blue-600 truncate min-w-0">{linkedBatch.batchNumber}</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold border-blue-500/30 text-blue-600 h-5 px-1.5 shrink-0">
                          {linkedBatch.status}
                        </Badge>
                      </div>

                      <div className="space-y-1 border-t border-blue-500/10 pt-1 text-xs min-w-0">
                        <div className="grid grid-cols-[minmax(72px,auto)_minmax(0,1fr)] gap-2 items-center min-w-0">
                          <span className="text-[10px] text-muted-foreground">Delivery:</span>
                          <strong className="text-xs text-foreground font-medium text-right truncate min-w-0">{linkedBatch.deliveryDate ? format(new Date(linkedBatch.deliveryDate), 'dd MMM yyyy') : 'Tomorrow'}</strong>
                        </div>
                        <div className="grid grid-cols-[minmax(72px,auto)_minmax(0,1fr)] gap-2 items-center min-w-0">
                          <span className="text-[10px] text-muted-foreground">Location:</span>
                          <strong className="text-xs text-foreground font-medium text-right truncate min-w-0">{linkedBatch.deliveryLocation || 'Main Store'}</strong>
                        </div>
                        <div className="grid grid-cols-[minmax(72px,auto)_minmax(0,1fr)] gap-2 items-center min-w-0">
                          <span className="text-[10px] text-muted-foreground">Dept:</span>
                          <strong className="text-xs text-foreground font-medium text-right truncate min-w-0">{linkedBatch.departmentName || 'Kitchen'}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Contact Profile Details */}
                  {(linkedSupplier || activeUserContact) && (
                    <div className="p-3 rounded-xl bg-card border border-border/40 space-y-1.5 shadow-2xs min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1">
                        <UserCheck className="size-3 text-primary shrink-0" /> CONTACT DETAILS
                      </div>
                      <div className="font-semibold text-foreground text-xs truncate min-w-0">
                        {linkedSupplier?.name || activeUserContact?.name}
                      </div>
                      <div className="text-[10px] font-normal text-muted-foreground flex items-center gap-1 font-mono truncate min-w-0">
                        <Phone className="size-3 text-primary shrink-0" /> {formatPhoneNumber(linkedSupplier?.phone || activeUserContact?.phone || activePhone)}
                      </div>
                      {activeUserContact && (
                        <div className="text-[10px] font-normal text-muted-foreground/70 truncate min-w-0">
                          {activeUserContact.empId} • {activeUserContact.department} • {activeUserContact.role}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2 py-6">
                  <Layers className="size-6 text-muted-foreground/30" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">No Business Context Linked</p>
                    <p className="text-[10px] text-muted-foreground max-w-[200px]">
                      Linked Store Requisitions, Purchase Orders, or Daily Procurement requirements will display here.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 w-full pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1 font-medium"
                      onClick={() => setCurrentView('requests')}
                    >
                      Go to Store Requisitions
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1 font-medium"
                      onClick={() => setCurrentView('purchase-order-process')}
                    >
                      Go to Daily Procurement
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ====== AI ASSISTANT TAB ====== */
            <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
              {activePhone && messages.length > 0 ? (
                <>
                  {/* Assistant Header Context */}
                  <div className="px-3 py-1.5 border-b border-border/30 bg-violet-500/5 shrink-0 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="size-5 rounded-md bg-violet-500/15 flex items-center justify-center shrink-0">
                        <Sparkles className="size-3 text-violet-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground leading-tight truncate">KG Inventra Assistant</div>
                        <div className="text-[10px] text-muted-foreground truncate leading-none font-mono">
                          {activeName} · {formatPhoneNumber(activePhone)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Action Chips */}
                  <div className="px-2 py-1.5 border-b border-border/30 bg-card/50 shrink-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">Quick Actions</div>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { action: 'summarize' as AssistantAction, label: 'Summarize', icon: FileText },
                        { action: 'draft_reply' as AssistantAction, label: 'Draft Reply', icon: Send },
                        { action: 'next_action' as AssistantAction, label: 'Next Action', icon: ArrowRight },
                        { action: 'explain_status' as AssistantAction, label: 'Status', icon: Zap },
                        ...(linkedRequest || linkedPO || linkedBatch
                          ? [
                              { action: 'check_price' as AssistantAction, label: 'Price', icon: TrendingUp },
                              { action: 'check_stock' as AssistantAction, label: 'Stock', icon: Package },
                              { action: 'extract_items' as AssistantAction, label: 'Items', icon: ListChecks },
                            ]
                          : []),
                      ].map((chip) => (
                        <button
                          key={chip.action}
                          type="button"
                          disabled={assistantLoading}
                          onClick={() => callAssistant(chip.action)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-300 hover:bg-violet-500/15 transition h-6 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <chip.icon className="size-3" />
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Assistant Conversation Thread */}
                  <div
                    className="flex-1 overflow-y-auto p-1.5 space-y-1.5 scrollbar-thin min-w-0"
                    ref={assistantScrollRef}
                  >
                    {assistantMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-1.5 py-4">
                        <div className="size-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                          <Sparkles className="size-4 text-violet-500" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-foreground">AI Assistant Ready</p>
                          <p className="text-[10px] text-muted-foreground max-w-[190px]">
                            Use quick actions or type below to analyze this conversation.
                          </p>
                        </div>
                      </div>
                    ) : (
                      assistantMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[88%] rounded-xl p-2 text-xs leading-snug ${
                              msg.role === 'user'
                                ? 'bg-violet-500/15 text-violet-900 dark:text-violet-200 rounded-br-none border border-violet-500/20 font-medium'
                                : 'bg-card border border-border/60 rounded-bl-none text-foreground shadow-2xs'
                            }`}
                          >
                            {msg.role === 'assistant' && (
                              <div className="flex items-center gap-1 mb-0.5 text-[10px] text-violet-600 dark:text-violet-400 font-semibold">
                                <Sparkles className="size-3" />
                                KG Inventra AI
                                {msg.source && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/20 text-violet-500 font-mono ml-auto h-4">
                                    {msg.source === 'gemini' ? 'AI' : 'Local'}
                                  </Badge>
                                )}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                            {/* Copy and Insert buttons */}
                            {msg.role === 'assistant' && msg.action === 'draft_reply' && (
                              <div className="flex gap-1 mt-1 pt-0.5 border-t border-border/30">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-4.5 text-[9px] gap-1 px-1 font-medium"
                                  onClick={() => {
                                    setInputText(msg.content)
                                    toast.success('Inserted into composer')
                                  }}
                                >
                                  <Send className="size-2" /> Use as Reply
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-4.5 text-[9px] gap-1 px-1 text-muted-foreground"
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.content)
                                    toast.success('Copied to clipboard')
                                  }}
                                >
                                  <Copy className="size-2" /> Copy
                                </Button>
                              </div>
                            )}
                            {msg.role === 'assistant' && msg.action !== 'draft_reply' && (
                              <div className="flex gap-1 mt-1 pt-0.5 border-t border-border/30">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-4.5 text-[9px] gap-1 px-1 text-muted-foreground"
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.content)
                                    toast.success('Copied to clipboard')
                                  }}
                                >
                                  <Copy className="size-2" /> Copy
                                </Button>
                              </div>
                            )}
                            <div className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">
                              {format(msg.timestamp, 'HH:mm')}
                            </div>
                          </div>
                        </div>
                      ))
                    )}

                    {assistantLoading && (
                      <div className="flex justify-start">
                        <div className="bg-card border border-border/60 rounded-lg rounded-bl-none p-1.5 shadow-2xs">
                          <div className="flex items-center gap-1 text-[10.5px] text-violet-600 dark:text-violet-400">
                            <Loader2 className="size-2.5 animate-spin" />
                            <span className="font-medium">Analyzing conversation…</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Assistant Query Input */}
                  <div className="p-1.5 border-t border-border/40 bg-card shrink-0">
                    <div className="flex gap-1.5 items-end">
                      <Input
                        placeholder="Ask about conversation..."
                        value={assistantQuery}
                        onChange={(e) => setAssistantQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && assistantQuery.trim()) {
                            callAssistant('general', assistantQuery.trim())
                            setAssistantQuery('')
                          }
                        }}
                        className="text-xs h-8 bg-background border-border flex-1 min-w-0"
                        disabled={assistantLoading}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-2.5 bg-violet-600 hover:bg-violet-700 text-white shadow-xs shrink-0"
                        disabled={assistantLoading || !assistantQuery.trim()}
                        onClick={() => {
                          if (assistantQuery.trim()) {
                            callAssistant('general', assistantQuery.trim())
                            setAssistantQuery('')
                          }
                        }}
                      >
                        {assistantLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-1.5 p-4">
                  <div className="size-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <Sparkles className="size-4 text-violet-500/50" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">Select a Conversation</p>
                  <p className="text-[10px] text-muted-foreground max-w-[190px]">
                    Select a conversation from the left panel to use the AI assistant.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
