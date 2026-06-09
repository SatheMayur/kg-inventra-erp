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
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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

// ---- Main View ----

export default function IntegrationsView() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Link2 className="size-5" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Integrations</span>
        </div>
        <h2 className="text-4xl font-extrabold tracking-tighter">Integrations</h2>
        <p className="text-muted-foreground">Connect Inventra to your tools.</p>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SlackCard />
        <TeamsCard />
        <QuickBooksCard />
        <WebhooksCard />
      </div>
    </div>
  )
}
