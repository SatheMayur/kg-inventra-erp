'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Link2,
  MessageSquare,
  Users,
  BookOpen,
  Globe,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  FlaskConical,
  X,
  Send,
  Smartphone,
  Sparkles,
  Check,
  CheckCheck,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ---- Types ----

interface Webhook {
  id: string
  name: string
  url: string
  events: string
  active: boolean
  secret: string | null
  createdAt: string
  updatedAt: string
}

type TestStatus = 'idle' | 'loading' | 'ok' | 'error'

const WEBHOOK_EVENTS = [
  'LOW_STOCK',
  'CHECKOUT',
  'NEW_REQUEST',
  'STOCK_IN',
  'STOCK_OUT',
  'MAINTENANCE_DUE',
  '*',
] as const

// ---- Helpers ----

function parseEvents(events: string): string[] {
  try {
    return JSON.parse(events)
  } catch {
    return []
  }
}

function StatusDot({ status }: { status: TestStatus }) {
  if (status === 'idle') return <span className="size-2 rounded-full bg-muted-foreground/30 inline-block" />
  if (status === 'loading') return <Loader2 className="size-3 animate-spin text-primary inline-block" />
  if (status === 'ok') return <CheckCircle2 className="size-3.5 text-emerald-500 inline-block" />
  return <XCircle className="size-3.5 text-destructive inline-block" />
}

// ---- Slack Card ----

function SlackCard() {
  const [url, setUrl] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('inventra_slack_url') || ''
    return ''
  })
  const [status, setStatus] = useState<TestStatus>('idle')

  function saveUrl(v: string) {
    setUrl(v)
    if (typeof window !== 'undefined') localStorage.setItem('inventra_slack_url', v)
  }

  async function testConnection() {
    if (!url.trim()) { toast.error('Enter a Slack webhook URL first'); return }
    setStatus('loading')
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'slack', webhookUrl: url.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setStatus('ok')
      toast.success('Slack test message sent successfully')
    } catch (err: unknown) {
      setStatus('error')
      toast.error(err instanceof Error ? err.message : 'Slack test failed')
    }
  }

  return (
    <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[#4A154B]/15 flex items-center justify-center">
            <MessageSquare className="size-5 text-[#4A154B] dark:text-purple-400" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">Slack</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Incoming Webhook</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <StatusDot status={status} />
            {status === 'ok' && <span className="text-[10px] text-emerald-600 font-medium">Connected</span>}
            {status === 'error' && <span className="text-[10px] text-destructive font-medium">Failed</span>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-[11px] text-muted-foreground">
          Send low-stock alerts and notifications to a Slack channel via an Incoming Webhook URL.
        </p>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
            Incoming Webhook URL
          </Label>
          <Input
            placeholder="https://hooks.slack.com/services/…"
            value={url}
            onChange={(e) => saveUrl(e.target.value)}
            className="bg-background border-border h-9 text-xs font-mono"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[11px] gap-1.5 rounded-lg w-full"
          onClick={testConnection}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? <Loader2 className="size-3 animate-spin" /> : <FlaskConical className="size-3" />}
          Test Connection
        </Button>
      </CardContent>
    </Card>
  )
}

// ---- Teams Card ----

function TeamsCard() {
  const [url, setUrl] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('inventra_teams_url') || ''
    return ''
  })
  const [status, setStatus] = useState<TestStatus>('idle')

  function saveUrl(v: string) {
    setUrl(v)
    if (typeof window !== 'undefined') localStorage.setItem('inventra_teams_url', v)
  }

  async function testConnection() {
    if (!url.trim()) { toast.error('Enter a Teams webhook URL first'); return }
    setStatus('loading')
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'teams', webhookUrl: url.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setStatus('ok')
      toast.success('Teams test message sent successfully')
    } catch (err: unknown) {
      setStatus('error')
      toast.error(err instanceof Error ? err.message : 'Teams test failed')
    }
  }

  return (
    <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[#464EB8]/15 flex items-center justify-center">
            <Users className="size-5 text-[#464EB8] dark:text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">Microsoft Teams</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Incoming Webhook</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <StatusDot status={status} />
            {status === 'ok' && <span className="text-[10px] text-emerald-600 font-medium">Connected</span>}
            {status === 'error' && <span className="text-[10px] text-destructive font-medium">Failed</span>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-[11px] text-muted-foreground">
          Post inventory notifications to a Microsoft Teams channel via a connector webhook.
        </p>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
            Incoming Webhook URL
          </Label>
          <Input
            placeholder="https://outlook.office.com/webhook/…"
            value={url}
            onChange={(e) => saveUrl(e.target.value)}
            className="bg-background border-border h-9 text-xs font-mono"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[11px] gap-1.5 rounded-lg w-full"
          onClick={testConnection}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? <Loader2 className="size-3 animate-spin" /> : <FlaskConical className="size-3" />}
          Test Connection
        </Button>
      </CardContent>
    </Card>
  )
}

// ---- QuickBooks Card ----

function QuickBooksCard() {
  return (
    <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[#2CA01C]/15 flex items-center justify-center">
            <BookOpen className="size-5 text-[#2CA01C] dark:text-green-400" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">QuickBooks Online</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Accounting Sync</p>
          </div>
          <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/20 text-amber-600 bg-amber-500/10">
            Coming Soon
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-[11px] text-muted-foreground">
          Sync invoices and POs with QuickBooks Online. Configure API keys to enable.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[11px] gap-1.5 rounded-lg w-full"
          onClick={() => toast.info('QuickBooks OAuth integration coming soon')}
        >
          <BookOpen className="size-3" />
          Connect QuickBooks
        </Button>
      </CardContent>
    </Card>
  )
}

// ---- Webhooks Card ----

const emptyForm = { name: '', url: '', events: [] as string[], secret: '' }

function WebhooksCard() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const fetchWebhooks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/webhooks')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setWebhooks(data.webhooks)
    } catch {
      toast.error('Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchWebhooks() }, [fetchWebhooks])

  function toggleEvent(event: string) {
    setForm((f) => {
      if (event === '*') return { ...f, events: f.events.includes('*') ? [] : ['*'] }
      const without = f.events.filter((e) => e !== '*')
      return {
        ...f,
        events: without.includes(event) ? without.filter((e) => e !== event) : [...without, event],
      }
    })
  }

  async function handleAdd() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!form.url.trim()) { toast.error('URL is required'); return }
    if (form.events.length === 0) { toast.error('Select at least one event'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          url: form.url.trim(),
          events: form.events,
          secret: form.secret.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toast.success('Webhook added')
      setShowAdd(false)
      setForm({ ...emptyForm })
      fetchWebhooks()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add webhook')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(hook: Webhook) {
    setTogglingId(hook.id)
    try {
      const res = await fetch(`/api/webhooks/${hook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !hook.active }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setWebhooks((prev) => prev.map((h) => h.id === hook.id ? { ...h, active: !h.active } : h))
    } catch {
      toast.error('Failed to toggle webhook')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Webhook deleted')
      setWebhooks((prev) => prev.filter((h) => h.id !== id))
    } catch {
      toast.error('Failed to delete webhook')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleTest(id: string) {
    setTestingId(id)
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toast.success('Test payload delivered')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Test delivery failed')
    } finally {
      setTestingId(null)
    }
  }

  return (
    <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Globe className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">Outbound Webhooks</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Push events to external endpoints</p>
          </div>
          <Button
            size="sm"
            className="ml-auto h-8 text-[11px] gap-1.5 rounded-lg shadow-sm shadow-primary/20"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-3" /> Add Webhook
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" />
            <span className="text-sm">Loading webhooks…</span>
          </div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-muted-foreground gap-2">
            <Globe className="size-8 opacity-20" />
            <p className="text-sm">No webhooks configured.</p>
            <Button variant="link" className="text-xs h-auto p-0" onClick={() => setShowAdd(true)}>
              Add your first webhook
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-[10px] uppercase font-bold tracking-wider">Name</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-wider">URL</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-wider">Events</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-wider">Added</TableHead>
                  <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((hook) => (
                  <TableRow key={hook.id} className="border-border/20 hover:bg-primary/5 transition-colors">
                    <TableCell className="text-xs font-semibold">{hook.name}</TableCell>
                    <TableCell className="max-w-[180px]">
                      <span className="font-mono text-[11px] text-muted-foreground truncate block">
                        {hook.url}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {parseEvents(hook.events).map((e) => (
                          <Badge
                            key={e}
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-primary/20 text-primary bg-primary/5"
                          >
                            {e}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          hook.active
                            ? 'text-[10px] border-emerald-500/20 text-emerald-700 bg-emerald-500/10'
                            : 'text-[10px] border-muted text-muted-foreground bg-muted/20'
                        }
                      >
                        {hook.active ? 'Active' : 'Paused'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {format(new Date(hook.createdAt), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] px-2 rounded-lg"
                          onClick={() => handleTest(hook.id)}
                          disabled={testingId === hook.id}
                          title="Send test payload"
                        >
                          {testingId === hook.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <FlaskConical className="size-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] px-2 rounded-lg"
                          onClick={() => handleToggle(hook)}
                          disabled={togglingId === hook.id}
                          title={hook.active ? 'Pause webhook' : 'Activate webhook'}
                        >
                          {togglingId === hook.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : hook.active ? (
                            <XCircle className="size-3 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="size-3 text-emerald-500" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] px-2 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(hook.id)}
                          disabled={deletingId === hook.id}
                          title="Delete webhook"
                        >
                          {deletingId === hook.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add Webhook Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="size-5 text-primary" /> Add Webhook
            </DialogTitle>
            <DialogDescription>
              Configure an endpoint to receive Inventra events as HTTP POST requests.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Name *</Label>
              <Input
                placeholder="e.g. ERP Low Stock Alert"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-background border-border h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Endpoint URL *</Label>
              <Input
                placeholder="https://example.com/webhook"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                className="bg-background border-border h-9 text-sm font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Events *</Label>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map((evt) => {
                  const selected = form.events.includes(evt)
                  return (
                    <button
                      key={evt}
                      type="button"
                      onClick={() => toggleEvent(evt)}
                      className={`h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors ${
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      {evt === '*' ? 'All Events (*)' : evt}
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator className="opacity-30" />

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Secret (optional)
              </Label>
              <Input
                placeholder="Signing secret for HMAC verification"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                className="bg-background border-border h-9 text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                If set, each request includes an <code className="font-mono">X-Inventra-Signature</code> header for verification.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/10">
            <Button
              variant="ghost"
              onClick={() => { setShowAdd(false); setForm({ ...emptyForm }) }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl px-6 shadow-lg shadow-primary/20 gap-2"
              onClick={handleAdd}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}


// ---- Chat Types ----
interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: Date
  parseData?: any
}

// ---- WhatsApp AI Simulator Card ----

// ---- WhatsApp AI Simulator Card ----

function WhatsAppSimulatorCard() {
  const { user } = useAppStore()
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hari Om! 🙏 I am the KG Inventra AI Assistant. You can text me in English, Hindi, Gujarati, Hinglish (e.g. 'A4 paper ka stock check karo'), or Gujlish.\n\nTry asking:\n• 'Need 5 blue pens for Accounts'\n• 'A4 paper ka stock kitna hai'\n• 'REQ-cmqm... approve karo'",
      timestamp: new Date()
    }
  ])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedParse, setSelectedParse] = useState<any>(null)
  const [creatingReq, setCreatingReq] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('inventra_gemini_key') || ''
      setApiKey(savedKey)
    }
  }, [])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!inputText.trim() || sending) return

    const userText = inputText.trim()
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: userText,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setSending(true)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey.trim()) {
        headers['x-gemini-key'] = apiKey.trim()
      }

      const res = await fetch('/api/integrations/whatsapp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userText })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse message')
      }

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: data.suggestedReply,
        timestamp: new Date(),
        parseData: data
      }

      setMessages(prev => [...prev, assistantMsg])
      setSelectedParse(data)
    } catch (err: any) {
      toast.error(err.message || 'Error parsing message')
      setMessages(prev => [...prev, {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: `⚠️ Error parsing message: ${err.message || 'Parsing error'}.`,
        timestamp: new Date()
      }])
    } finally {
      setSending(false)
    }
  }

  async function confirmRequisition(details: any) {
    if (creatingReq) return
    setCreatingReq(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          lines: [{ itemId: details.itemId, qty: details.quantity }]
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create request')

      toast.success('Requisition created successfully!')
      setMessages(prev => [...prev, {
        id: String(Date.now()),
        sender: 'assistant',
        text: `✅ Requisition created successfully! Reference ID: REQ-${data.request.id.slice(-6).toUpperCase()} (${data.request.status})`,
        timestamp: new Date()
      }])
      setSelectedParse(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create requisition')
    } finally {
      setCreatingReq(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in slide-in-from-bottom-3 duration-500">
      {/* API Key Configuration Banner */}
      <div className="lg:col-span-12">
        <Card className="border-border bg-card/60 backdrop-blur-sm shadow-[0_1px_4px_rgba(0,0,0,0.04)] rounded-2xl p-4 border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full ${apiKey ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`} />
              <h3 className="font-bold text-sm">Gemini AI Configuration</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Optional custom Gemini API key. When omitted, the built-in local Keyword AI Engine handles queries seamlessly.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto md:max-w-md">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder="Optional Gemini API Key (AIzaSy...)"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  localStorage.setItem('inventra_gemini_key', e.target.value)
                }}
                className="bg-background border-border h-9 text-xs pr-10 font-mono w-full min-w-[260px]"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {apiKey ? (
              <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-600 bg-emerald-500/10 gap-1 h-9 px-3 rounded-lg shrink-0">
                <Check className="size-3" /> Gemini AI Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-600 bg-blue-500/10 gap-1 h-9 px-3 rounded-lg shrink-0 font-medium">
                <Sparkles className="size-3" /> Keyword AI Active
              </Badge>
            )}
          </div>
        </Card>
      </div>

      {/* Left Col - WhatsApp Chat interface */}
      <div className="lg:col-span-7 space-y-4">
        <Card className="border-border/60 bg-card shadow-xl rounded-2xl overflow-hidden flex flex-col h-[580px] border">
          {/* Header */}
          <div className="bg-[#075E54] dark:bg-[#128C7E] px-4 py-3 text-white flex items-center gap-3 shrink-0">
            <div className="size-9 rounded-full bg-emerald-100 flex items-center justify-center text-[#075E54] font-bold text-sm shrink-0">
              KG
            </div>
            <div>
              <p className="font-semibold text-xs leading-none">KG Inventra Assistant</p>
              <p className="text-[10px] text-emerald-100/80 mt-1.5 flex items-center gap-1.5 font-medium">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Online (AI powered)
              </p>
            </div>
          </div>

          {/* Messages List */}
          <div className="flex-1 p-4 overflow-y-auto bg-[#efeae2] dark:bg-[#0b141a] space-y-3 font-sans flex flex-col">
            {messages.map((msg) => {
              const isAssistant = msg.sender === 'assistant'
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[80%] ${
                    isAssistant ? 'self-start mr-auto' : 'self-end ml-auto'
                  }`}
                >
                  <div
                    className={`p-3 rounded-2xl shadow-sm text-xs whitespace-pre-wrap leading-relaxed select-text cursor-text ${
                      isAssistant
                        ? 'bg-white dark:bg-zinc-800 text-foreground rounded-tl-none border border-border/10'
                        : 'bg-[#DCF8C6] dark:bg-[#056162] text-zinc-900 dark:text-zinc-100 rounded-tr-none border border-emerald-500/10'
                    }`}
                  >
                    {msg.text}
                    {msg.parseData && (
                      <div className="mt-2.5 pt-2 border-t border-dashed border-muted-foreground/20 flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] bg-background font-mono capitalize px-1 py-0 border-border/40">
                          {msg.parseData.parse.intent.replace(/_/g, ' ')}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => setSelectedParse(msg.parseData)}
                          className="text-[9px] hover:underline text-primary font-semibold"
                        >
                          View Debugger
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1 self-end px-1 select-none">
                    <span className="text-[9px] text-muted-foreground/60">
                      {format(msg.timestamp, 'HH:mm')}
                    </span>
                    {!isAssistant && (
                      <CheckCheck className="size-3 text-sky-500 shrink-0" />
                    )}
                  </div>
                </div>
              )
            })}
            {sending && (
              <div className="self-start mr-auto max-w-[80%] bg-white dark:bg-zinc-800 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2 border border-border/10">
                <Loader2 className="size-3.5 animate-spin text-emerald-500" />
                <span className="text-[11px] text-muted-foreground">Parsing message...</span>
              </div>
            )}
          </div>

          {/* Input Footer */}
          <form onSubmit={handleSend} className="p-3 border-t border-border bg-card shrink-0 flex gap-2 items-center">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type message in Hinglish, Gujarati, or English..."
              disabled={sending}
              className="bg-muted/10 border-border h-10 rounded-full px-4 text-xs flex-1"
            />
            <Button
              type="submit"
              disabled={!inputText.trim() || sending}
              size="icon"
              className="rounded-full size-10 shrink-0 bg-[#128C7E] hover:bg-[#075E54] text-white flex items-center justify-center"
            >
              <Send className="size-4" />
            </Button>
          </form>
        </Card>
      </div>

      {/* Right Col - AI Debugger Panel */}
      <div className="lg:col-span-5 space-y-4">
        <Card className="border border-border bg-card rounded-2xl overflow-hidden shadow-lg h-[580px] flex flex-col">
          <div className="border-b border-border/40 bg-muted/20 px-4 py-3 shrink-0 flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-500" />
            <p className="font-bold text-xs uppercase tracking-wider">AI Debugger Logs</p>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {selectedParse ? (
              <div className="space-y-4 text-xs">
                {/* Intent & Confidence */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Classified Intent</p>
                    <Badge className="font-mono text-[10px] bg-primary/10 border border-primary/20 text-primary capitalize px-1.5 py-0.5">
                      {selectedParse.parse.intent.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Confidence Score</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-bold font-mono text-[11px]">
                        {(selectedParse.parse.confidence * 100).toFixed(0)}%
                      </span>
                      <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${selectedParse.parse.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Languages */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-xl bg-muted/20 border border-border/40 text-[11px]">
                    <span className="text-muted-foreground">Detected Lang:</span>{' '}
                    <span className="font-semibold capitalize">{selectedParse.parse.language}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/20 border border-border/40 text-[11px]">
                    <span className="text-muted-foreground">Reply Dialect:</span>{' '}
                    <span className="font-semibold capitalize">{selectedParse.parse.reply_language}</span>
                  </div>
                </div>

                {/* Extracted Entities */}
                <Card className="border-border/40 bg-muted/10">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border/30 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Extracted Entities
                  </div>
                  <div className="p-3 space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between py-0.5 border-b border-border/20">
                      <span className="text-muted-foreground">Item Name:</span>
                      <span className="font-semibold text-foreground truncate max-w-[180px]">
                        {selectedParse.parse.item_name || <span className="opacity-30 italic">—</span>}
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5 border-b border-border/20">
                      <span className="text-muted-foreground">Raw Alias Used:</span>
                      <span className="font-semibold text-foreground truncate max-w-[180px]">
                        {selectedParse.parse.item_alias_used || <span className="opacity-30 italic">—</span>}
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5 border-b border-border/20">
                      <span className="text-muted-foreground">Quantity/Unit:</span>
                      <span className="font-semibold text-foreground">
                        {selectedParse.parse.quantity !== null && selectedParse.parse.quantity !== undefined ? (
                          `${selectedParse.parse.quantity} ${selectedParse.parse.unit || 'pcs'}`
                        ) : (
                          <span className="opacity-30 italic">—</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5 border-b border-border/20">
                      <span className="text-muted-foreground">Department:</span>
                      <span className="font-semibold text-foreground">
                        {selectedParse.parse.department || <span className="opacity-30 italic">—</span>}
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5 border-b border-border/20">
                      <span className="text-muted-foreground">Transaction Ref:</span>
                      <span className="font-semibold text-foreground">
                        {selectedParse.parse.transaction_reference || <span className="opacity-30 italic">—</span>}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Database Operations */}
                <Card className="border-border/40 bg-muted/10">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border/30 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Database Pipeline Action
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Action Triggered:</span>
                      <Badge variant="outline" className="border-emerald-500/20 text-emerald-700 bg-emerald-500/5 px-2 py-0.5">
                        {selectedParse.actionTaken}
                      </Badge>
                    </div>

                    {selectedParse.dbDetails && (
                      <div className="bg-background border border-border/40 rounded-lg p-2.5 space-y-2 font-mono text-[10px]">
                        {selectedParse.actionTaken.includes('Requisition') && selectedParse.dbDetails.exists !== false ? (
                          <>
                            <p className="font-semibold text-primary">Draft Requisition details:</p>
                            <p>Item: {selectedParse.dbDetails.itemName}</p>
                            <p>Qty: {selectedParse.dbDetails.quantity} {selectedParse.dbDetails.unit}</p>
                            <p>Dept: {selectedParse.dbDetails.department}</p>
                            <Button
                              onClick={() => confirmRequisition(selectedParse.dbDetails)}
                              disabled={creatingReq}
                              className="w-full mt-2 h-8 text-[10px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                            >
                              {creatingReq ? (
                                <Loader2 className="size-3 animate-spin mr-1.5" />
                              ) : (
                                <CheckCircle2 className="size-3.5 mr-1.5" />
                              )}
                              Confirm & Create Requisition
                            </Button>
                          </>
                        ) : (
                          <pre className="whitespace-pre-wrap select-text truncate max-w-full">
                            {JSON.stringify(selectedParse.dbDetails, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Warnings / Missing fields */}
                {selectedParse.parse.missing_fields.length > 0 && (
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 text-amber-700 rounded-xl flex items-start gap-2">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[10px] uppercase">Missing Required Parameters</p>
                      <p className="text-[10px] mt-0.5">
                        The assistant needs: {selectedParse.parse.missing_fields.join(', ')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 pt-20">
                <Smartphone className="size-12 opacity-20 text-muted-foreground" />
                <p className="text-sm font-semibold text-center text-foreground/80">No parsed data loaded</p>
                <p className="text-xs text-center text-muted-foreground/70 max-w-[200px] leading-relaxed">
                  Send a WhatsApp message on the left simulator to view parsing data details.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function WhatsAppConnectionCard() {
  const [sessionStatus, setSessionStatus] = useState<string>('DISCONNECTED')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null)
  const [bridgeAlive, setBridgeAlive] = useState<boolean>(false)
  const [loadingSession, setLoadingSession] = useState(true)
  const [relinking, setRelinking] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function fetchSession() {
    try {
      const res = await fetch('/api/whatsapp/session')
      if (res.ok) {
        const data = await res.json()
        setSessionStatus(data.status || 'DISCONNECTED')
        setQrCodeDataUrl(data.qrDataUrl || null)
        setStatusMessage(data.message || '')
        setConnectedPhone(data.connectedPhone || null)
        setBridgeAlive(Boolean(data.bridgeAlive))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSession(false)
    }
  }

  async function handleRelink() {
    setRelinking(true)
    try {
      const res = await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'RELINK' }),
      })
      if (res.ok) {
        toast.success('Relink command sent to WhatsApp bridge. Generating new QR code...')
        setQrCodeDataUrl(null)
        await fetchSession()
      } else {
        toast.error('Failed to send relink command')
      }
    } catch (err) {
      toast.error('Error sending relink command')
    } finally {
      setRelinking(false)
    }
  }

  async function handleResetSession() {
    if (!confirm('Are you sure you want to reset the WhatsApp session? You will need to re-scan a new QR code.')) return
    setResetting(true)
    try {
      const res = await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'RESET_SESSION' }),
      })
      if (res.ok) {
        toast.success('Session reset successfully. Initializing new QR code...')
        setQrCodeDataUrl(null)
        await fetchSession()
      } else {
        toast.error('Failed to reset session')
      }
    } catch (err) {
      toast.error('Error resetting session')
    } finally {
      setResetting(false)
    }
  }

  useEffect(() => {
    fetchSession()
    const interval = setInterval(fetchSession, 3000)
    return () => clearInterval(interval)
  }, [])

  const isPairing = sessionStatus === 'PAIRING_REQUIRED' || sessionStatus === 'QR_READY' || (sessionStatus === 'CONNECTING' && Boolean(qrCodeDataUrl))
  const isStarting = sessionStatus === 'STARTING' || (sessionStatus === 'CONNECTING' && !qrCodeDataUrl)
  const isConnected = sessionStatus === 'CONNECTED'
  const isOffline = sessionStatus === 'SERVICE_OFFLINE' || sessionStatus === 'ERROR' || (!bridgeAlive && !isConnected && !isPairing)

  return (
    <Card className="border-border/50 bg-card shadow-lg relative overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
              <Smartphone className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                WhatsApp Bridge & QR Pairing
              </CardTitle>
              <p className="text-xs text-muted-foreground">Operational WhatsApp Web bridge session status and device authentication.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchSession}
              disabled={loadingSession}
              className="h-8 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              title="Recheck Bridge Liveness & Health"
            >
              <RefreshCw className={`size-3.5 mr-1 ${loadingSession ? 'animate-spin' : ''}`} />
              Recheck Health
            </Button>
            <Badge
              variant="outline"
              className={`capitalize font-bold text-xs px-3 py-1 ${
                isConnected ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                isPairing || isStarting ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                'bg-rose-500/10 text-rose-600 border-rose-500/30'
              }`}
            >
              <span className={`size-2 rounded-full mr-1.5 inline-block ${
                isConnected ? 'bg-emerald-500 animate-pulse' :
                isPairing || isStarting ? 'bg-amber-500 animate-pulse' :
                'bg-rose-500'
              }`} />
              {sessionStatus === 'PAIRING_REQUIRED' ? 'Pairing Required' :
               sessionStatus === 'SERVICE_OFFLINE' ? 'Service Offline' :
               sessionStatus.replaceAll('_', ' ').toLowerCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {isConnected && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Session Linked & Authenticated {connectedPhone ? `(+${connectedPhone})` : ''}
                </h4>
                <p className="text-xs text-muted-foreground">
                  The production WhatsApp bridge is connected. Inbound messages from vendors are recorded automatically, and outbound Daily Procurement requirements send live.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetSession}
                disabled={resetting || relinking}
                className="text-xs font-semibold text-rose-600 border-rose-500/30 hover:bg-rose-500/10 gap-1.5"
              >
                {resetting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Reset Session & Re-pair
              </Button>
            </div>
          </div>
        )}

        {isPairing && qrCodeDataUrl && (
          <div className="flex flex-col items-center justify-center space-y-4 py-2">
            <div className="space-y-3 text-center">
              <div className="p-3 bg-white rounded-2xl shadow-xl inline-block border border-border">
                <img src={qrCodeDataUrl} alt="WhatsApp QR Code" className="size-52 object-contain" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 animate-pulse">
                  QR Code Ready to Scan
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm">
                  Open WhatsApp on your phone &gt; Settings &gt; Linked Devices &gt; Link a Device, and scan this QR code.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRelink}
              disabled={relinking}
              className="text-xs font-semibold gap-1.5"
            >
              {relinking ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Regenerate QR Code
            </Button>
          </div>
        )}

        {isStarting && (
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <Loader2 className="size-8 animate-spin text-amber-500 mx-auto" />
            <div className="text-center space-y-1">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 animate-pulse">
                Initializing WhatsApp Bridge...
              </p>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                {statusMessage || 'Requesting QR code from WhatsApp servers...'}
              </p>
            </div>
          </div>
        )}

        {sessionStatus === 'QR_EXPIRED' && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-700 dark:text-amber-300">QR Code Expired</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The previous QR code has timed out. Click below to generate a new QR code to pair your device.
                </p>
              </div>
            </div>
            <Button
              onClick={handleRelink}
              disabled={relinking}
              className="bg-primary text-primary-foreground font-semibold text-xs gap-1.5 shadow-md shadow-primary/20"
            >
              {relinking ? <Loader2 className="size-3.5 animate-spin" /> : <Smartphone className="size-3.5" />}
              Regenerate QR Code
            </Button>
          </div>
        )}

        {isOffline && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
              <XCircle className="size-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-rose-700 dark:text-rose-300">
                  {sessionStatus === 'SERVICE_OFFLINE' ? 'WhatsApp Bridge Service Offline' : 'Bridge Disconnected'}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {statusMessage || 'The WhatsApp bridge service is currently not running or unreachable. Please launch start-whatsapp.bat to start the bridge process.'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] text-muted-foreground font-mono">
                Launch command: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">start-whatsapp.bat</code>
              </div>
              <Button
                onClick={handleRelink}
                disabled={relinking}
                className="bg-primary text-primary-foreground font-semibold text-xs gap-1.5 shadow-md shadow-primary/20"
              >
                {relinking ? <Loader2 className="size-3.5 animate-spin" /> : <Smartphone className="size-3.5" />}
                Start Pairing & Generate QR
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---- Main View ----

export default function IntegrationsView() {
  const { user } = useAppStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'STORE_ADMIN'

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 animate-in fade-in duration-300">
        <ShieldAlert className="size-12 text-rose-500/80" />
        <h2 className="text-lg font-bold text-foreground">Permission Denied</h2>
        <p className="text-xs text-muted-foreground max-w-sm">
          You do not have permission to perform this action. Technical configuration, webhooks, and integration settings are restricted to system administrators.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Link2 className="size-5" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Integrations & Technical Settings</span>
        </div>
        <h2 className="text-4xl font-extrabold tracking-tighter">Integrations</h2>
        <p className="text-muted-foreground">Manage WhatsApp bridge session pairing, webhook channels, and AI test simulators.</p>
      </div>

      <Tabs defaultValue="whatsapp" className="w-full space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3 rounded-xl bg-muted/20 p-1 border border-border/40">
          <TabsTrigger value="whatsapp" className="rounded-lg text-xs font-bold uppercase tracking-wider py-2">
            WhatsApp Connection
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="rounded-lg text-xs font-bold uppercase tracking-wider py-2">
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="simulator" className="rounded-lg text-xs font-bold uppercase tracking-wider py-2">
            AI Testing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp" className="space-y-6">
          <WhatsAppConnectionCard />
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6">
          {/* 2×2 grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SlackCard />
            <TeamsCard />
            <QuickBooksCard />
            <WebhooksCard />
          </div>
        </TabsContent>

        <TabsContent value="simulator" className="space-y-6">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 flex items-center justify-between text-xs mb-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span><strong>Developer Simulator (Testing Environment):</strong> Messages typed here are evaluated by Gemini & Keyword AI in test mode and are <em>not</em> delivered to real WhatsApp vendors.</span>
            </div>
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 text-[10px] uppercase font-mono">
              Test Mode
            </Badge>
          </div>
          <WhatsAppSimulatorCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}
