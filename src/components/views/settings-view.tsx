'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Settings,
  Sliders,
  Activity,
  Info,
  Database,
  ShieldCheck,
  Server,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Edit,
  GitBranch,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'

interface FlagDef {
  key: string
  label: string
  description: string
  phase: string
  locked?: boolean
}

const FLAG_DEFS: FlagDef[] = [
  {
    key: 'csvExport',
    label: 'CSV Export',
    description: 'Download transactions as CSV',
    phase: 'Active',
  },
  {
    key: 'tooltips',
    label: 'Contextual Tooltips',
    description: 'Helpful hover tips on key fields',
    phase: 'Active',
  },
  {
    key: 'reporting',
    label: 'Reporting Dashboard',
    description: 'Charts, stockout predictions, month-over-month',
    phase: 'Phase 3 ✓',
  },
  {
    key: 'apply_historical_issues_to_stock',
    label: 'Apply Historical Issues to Stock',
    description: 'Reduce current stock from historical issue transactions (Default: False)',
    phase: 'Active',
  },
  {
    key: 'barcode',
    label: 'Barcode Scanning',
    description: 'Camera-based item lookup and quick issue',
    phase: 'Phase 4',
    locked: true,
  },
]

function getPhaseBadge(phase: string, locked?: boolean) {
  if (locked) {
    return (
      <Badge className="bg-muted text-muted-foreground border-border">
        {phase}
      </Badge>
    )
  }
  if (phase === 'Active') {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
        {phase}
      </Badge>
    )
  }
  if (phase.includes('✓')) {
    return (
      <Badge className="bg-primary/15 text-primary border-primary/30">
        {phase}
      </Badge>
    )
  }
  return (
    <Badge className="bg-sky-500/10 text-sky-700 border-sky-500/20">
      {phase}
    </Badge>
  )
}

export default function SettingsView() {
  const user = useAppStore((s) => s.user)
  const flags = useAppStore((s) => s.flags)
  const setFlags = useAppStore((s) => s.setFlags)
  const updateFlag = useAppStore((s) => s.updateFlag)
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  const [loading, setLoading] = useState(true)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [health, setHealth] = useState<{ status: string; uptime?: number } | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  // Workflows state
  const [workflows, setWorkflows] = useState<any[]>([])
  const [workflowsLoading, setWorkflowsLoading] = useState(true)
  const [selectedModule, setSelectedModule] = useState<'STORE_REQUISITION' | 'PURCHASE_ORDER'>('STORE_REQUISITION')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingRule, setEditingRule] = useState<any | null>(null)

  // Rule form state
  const [formConditionType, setFormConditionType] = useState<'ALWAYS' | 'AMOUNT_LT' | 'AMOUNT_GTE' | 'FLAG_TRUE'>('ALWAYS')
  const [formConditionValue, setFormConditionValue] = useState('')
  const [formApproverRole, setFormApproverRole] = useState('DEPT_HEAD')
  const [formSequence, setFormSequence] = useState(1)
  const [formActive, setFormActive] = useState(true)
  const [savingWorkflow, setSavingWorkflow] = useState(false)

  const fetchFlags = useCallback(async () => {
    try {
      setLoading(true)
      const serverFlags = await api.settings.getFlags()
      setFlags(serverFlags)
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [setFlags])

  const fetchWorkflows = useCallback(async () => {
    try {
      setWorkflowsLoading(true)
      const data = await api.settings.workflows.list()
      setWorkflows(data)
    } catch {
      toast.error('Failed to load approval workflows')
    } finally {
      setWorkflowsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFlags()
    fetchWorkflows()
    // Fetch real health data
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => setHealth({ status: 'error' }))
      .finally(() => setHealthLoading(false))
  }, [fetchFlags, fetchWorkflows])

  async function handleToggle(key: string, value: boolean) {
    const flagDef = FLAG_DEFS.find((f) => f.key === key)
    if (flagDef?.locked) return

    try {
      setTogglingKey(key)
      const updatedFlags = await api.settings.updateFlag(key, value)
      setFlags(updatedFlags)
      toast.success(`${flagDef?.label ?? key} ${value ? 'enabled' : 'disabled'}`)

      // If turning off reporting while on reporting view, navigate away
      if (key === 'reporting' && !value && currentView === 'reporting') {
        setCurrentView('dashboard')
      }
    } catch {
      toast.error('Failed to update flag')
      // Revert local state
      updateFlag(key, !value)
    } finally {
      setTogglingKey(null)
    }
  }

  const [resetLoading, setResetLoading] = useState(false)
  async function handleReset() {
    if (!confirm('Are you sure you want to reset the system to default data? This will overwrite existing users and items.')) return

    setResetLoading(true)
    try {
      await api.auth.seed()
      toast.success('System reset successfully')
      window.location.reload()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset system')
    } finally {
      setResetLoading(false)
    }
  }

  // Workflows actions
  async function handleToggleActive(rule: any) {
    try {
      await api.settings.workflows.update(rule.id, { active: !rule.active })
      toast.success(`Rule active status updated`)
      fetchWorkflows()
    } catch {
      toast.error('Failed to update rule active status')
    }
  }

  async function handleDeleteRule(id: string) {
    if (!confirm('Are you sure you want to delete this approval step?')) return
    try {
      await api.settings.workflows.delete(id)
      toast.success('Approval step deleted')
      fetchWorkflows()
    } catch {
      toast.error('Failed to delete approval step')
    }
  }

  async function handleMoveRule(rule: any, direction: 'up' | 'down') {
    const moduleRules = workflows
      .filter((w) => w.moduleName === rule.moduleName)
      .sort((a, b) => a.sequence - b.sequence)

    const idx = moduleRules.findIndex((w) => w.id === rule.id)
    if (idx === -1) return

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= moduleRules.length) return

    const targetRule = moduleRules[targetIdx]

    // Swap sequences
    const updates = [
      { id: rule.id, sequence: targetRule.sequence },
      { id: targetRule.id, sequence: rule.sequence }
    ]

    try {
      await api.settings.workflows.reorder(updates)
      toast.success('Workflow sequence updated')
      fetchWorkflows()
    } catch {
      toast.error('Failed to reorder workflow steps')
    }
  }

  function openAddDialog(rule: any = null) {
    if (rule) {
      setEditingRule(rule)
      setFormConditionType(rule.conditionType)
      setFormConditionValue(rule.conditionValue || '')
      setFormApproverRole(rule.approverRole)
      setFormSequence(rule.sequence)
      setFormActive(rule.active)
    } else {
      setEditingRule(null)
      setFormConditionType('ALWAYS')
      setFormConditionValue('')
      setFormApproverRole('DEPT_HEAD')
      const moduleRules = workflows.filter((w) => w.moduleName === selectedModule)
      const maxSeq = moduleRules.length > 0 ? Math.max(...moduleRules.map((w) => w.sequence)) : 0
      setFormSequence(maxSeq + 1)
      setFormActive(true)
    }
    setShowAddDialog(true)
  }

  async function handleSaveRule() {
    if (!formApproverRole) {
      toast.error('Approver role is required')
      return
    }

    setSavingWorkflow(true)
    try {
      const payload = {
        moduleName: selectedModule,
        conditionType: formConditionType,
        conditionValue: formConditionType === 'ALWAYS' ? null : formConditionValue,
        approverRole: formApproverRole,
        sequence: Number(formSequence),
        active: formActive,
      }

      if (editingRule) {
        await api.settings.workflows.update(editingRule.id, payload)
        toast.success('Approval step updated successfully')
      } else {
        await api.settings.workflows.create(payload)
        toast.success('Approval step created successfully')
      }
      setShowAddDialog(false)
      fetchWorkflows()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save approval step')
    } finally {
      setSavingWorkflow(false)
    }
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <ShieldCheck className="size-12 text-muted-foreground/50" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
        <Button onClick={() => setCurrentView('dashboard')}>Return to Dashboard</Button>
      </div>
    )
  }

  const filteredRules = workflows
    .filter((w) => w.moduleName === selectedModule)
    .sort((a, b) => a.sequence - b.sequence)

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="size-5 text-primary" />
        <h3 className="text-lg font-semibold">Settings</h3>
      </div>

      <Tabs defaultValue="system" className="w-full">
        <TabsList className="bg-muted/20 p-1 rounded-xl border border-border mb-6">
          <TabsTrigger value="system" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            System Settings
          </TabsTrigger>
          <TabsTrigger value="workflows" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Approval Workflows
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-6">
          {/* Feature Flags Card */}
          <Card className="border-border bg-card shadow-lg shadow-black/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                <CardTitle className="text-base">Feature Flags</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="space-y-1 flex-1 pr-4">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-48 mt-1" />
                      </div>
                      <Skeleton className="h-5 w-10 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                FLAG_DEFS.map((flag, idx) => {
                  const isEnabled = flags[flag.key] === true
                  return (
                    <div key={flag.key}>
                      <div className="flex items-center justify-between py-3">
                        <div className="space-y-1 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{flag.label}</span>
                            {getPhaseBadge(flag.phase, flag.locked)}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {flag.description}
                          </p>
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Switch
                                  checked={isEnabled}
                                  disabled={flag.locked || togglingKey === flag.key}
                                  onCheckedChange={(checked) =>
                                    handleToggle(flag.key, checked)
                                  }
                                />
                              </div>
                            </TooltipTrigger>
                            {flag.locked && (
                              <TooltipContent>
                                This feature is not yet available
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      {idx < FLAG_DEFS.length - 1 && (
                        <Separator className="opacity-30" />
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* System Health */}
            <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-emerald-500" />
                  <CardTitle className="text-base">System Health</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/40 transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Server className="size-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">API Server</p>
                      {healthLoading ? (
                        <Skeleton className="h-4 w-20 mt-0.5" />
                      ) : (
                        <p className="text-sm font-semibold">
                          {health?.status === 'ok' ? 'Operational' : 'Degraded'}
                        </p>
                      )}
                    </div>
                  </div>
                  {healthLoading ? (
                    <Skeleton className="h-5 w-16 rounded-full" />
                  ) : health?.status === 'ok' ? (
                    <div className="flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="size-4" />
                      <span className="text-xs font-bold">Online</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-rose-700">
                      <XCircle className="size-4" />
                      <span className="text-xs font-bold">Error</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/40 transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
                      <Database className="size-4 text-sky-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Database</p>
                      {healthLoading ? (
                        <Skeleton className="h-4 w-20 mt-0.5" />
                      ) : (
                        <p className="text-sm font-semibold">
                          {health?.status === 'ok' ? 'Connected' : 'Unreachable'}
                        </p>
                      )}
                    </div>
                  </div>
                  {healthLoading ? (
                    <Skeleton className="h-5 w-16 rounded-full" />
                  ) : (
                    <Badge className={health?.status === 'ok'
                      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px]'
                      : 'bg-rose-500/10 text-rose-700 border-rose-500/20 text-[10px]'
                    }>
                      {health?.status === 'ok' ? 'OK' : 'Error'}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/40 transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Activity className="size-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Uptime</p>
                      {healthLoading ? (
                        <Skeleton className="h-4 w-20 mt-0.5" />
                      ) : (
                        <p className="text-sm font-semibold">
                          {health?.uptime != null
                            ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`
                            : '—'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* App Info */}
            <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Info className="size-4 text-primary" />
                  <CardTitle className="text-base">Application Info</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Application</span>
                    <span className="font-mono font-bold text-foreground">Inventra</span>
                  </div>
                  <Separator className="opacity-20" />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Environment</span>
                    <Badge variant="outline" className={`text-[10px] uppercase font-bold ${
                      process.env.NODE_ENV === 'production'
                        ? 'border-emerald-500/20 text-emerald-700 bg-emerald-500/10'
                        : 'border-amber-500/20 text-amber-700 bg-amber-500/10'
                    }`}>
                      {process.env.NODE_ENV ?? 'development'}
                    </Badge>
                  </div>
                  <Separator className="opacity-20" />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Password Security</span>
                    <div className="flex items-center gap-1.5 text-emerald-700">
                      <ShieldCheck className="size-3.5" />
                      <span className="font-bold">PBKDF2-SHA512</span>
                    </div>
                  </div>
                  <Separator className="opacity-20" />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Auth</span>
                    <span className="text-foreground font-bold">JWT · 8h expiry</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Maintenance Section — Admin Only Extra Protection */}
          <Card className="border-rose-500/30 bg-rose-500/8 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-rose-500" />
                <CardTitle className="text-base text-rose-500">Maintenance & Recovery</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">System Reset</p>
                  <p className="text-xs text-muted-foreground">
                    Overwrites current data with defaults. This action is irreversible.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleReset}
                  disabled={resetLoading}
                  className="gap-2 shadow-lg shadow-rose-500/20"
                >
                  <RefreshCw className={`size-3.5 ${resetLoading ? 'animate-spin' : ''}`} />
                  {resetLoading ? 'Resetting...' : 'Factory Reset'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-6">
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitBranch className="size-4 text-primary" />
                    Approval Workflow Rules
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Define dynamic, multi-step validation logic for requisitions and procurement documents.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedModule}
                    onValueChange={(val: any) => setSelectedModule(val)}
                  >
                    <SelectTrigger className="w-[200px] rounded-xl bg-background border-border">
                      <SelectValue placeholder="Select Module" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STORE_REQUISITION">Store Requisition</SelectItem>
                      <SelectItem value="PURCHASE_ORDER">Purchase Order</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => openAddDialog()}
                    className="rounded-xl gap-1.5 shadow-sm"
                  >
                    <Plus className="size-4" /> Add Step
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {workflowsLoading ? (
                <div className="space-y-4 py-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : filteredRules.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <GitBranch className="size-8 opacity-20 text-muted-foreground/60" />
                  <p className="text-sm font-medium">No approval steps configured.</p>
                  <p className="text-xs text-muted-foreground max-w-[280px]">
                    Create a new validation step to begin managing workflows for this module.
                  </p>
                  <Button variant="link" className="mt-2 text-primary" onClick={() => openAddDialog()}>
                    Add your first step
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  {filteredRules.map((rule, idx) => (
                    <div key={rule.id} className="space-y-4">
                      {idx > 0 && (
                        <div className="flex justify-center -my-2">
                          <ArrowDown className="size-4 text-muted-foreground/30 animate-bounce" />
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:bg-muted/5 transition-colors gap-4">
                        <div className="flex items-center gap-4">
                          <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm border border-primary/20">
                            {rule.sequence}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm capitalize">
                                {rule.approverRole.replace(/_/g, ' ').toLowerCase()}
                              </span>
                              <Badge
                                variant={rule.active ? 'secondary' : 'outline'}
                                className={rule.active
                                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                                  : 'text-muted-foreground bg-muted/20'
                                }
                              >
                                {rule.active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {rule.conditionType === 'ALWAYS' ? (
                                'Always triggers for all transactions'
                              ) : rule.conditionType === 'AMOUNT_GTE' ? (
                                `Triggers if total value >= ₹ ${Number(rule.conditionValue).toLocaleString()}`
                              ) : rule.conditionType === 'AMOUNT_LT' ? (
                                `Triggers if total value < ₹ ${Number(rule.conditionValue).toLocaleString()}`
                              ) : rule.conditionType === 'FLAG_TRUE' ? (
                                `Triggers if transaction metadata includes flag '${rule.conditionValue}'`
                              ) : (
                                'Custom routing logic'
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                          <Switch
                            checked={rule.active}
                            onCheckedChange={() => handleToggleActive(rule)}
                            className="mr-2 scale-90"
                          />
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 rounded-lg border border-border/10 bg-muted/5"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveRule(rule, 'up')}
                                >
                                  <ArrowUp className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Move Step Up</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 rounded-lg border border-border/10 bg-muted/5"
                                  disabled={idx === filteredRules.length - 1}
                                  onClick={() => handleMoveRule(rule, 'down')}
                                >
                                  <ArrowDown className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Move Step Down</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 rounded-lg text-foreground hover:bg-muted"
                            onClick={() => openAddDialog(rule)}
                          >
                            <Edit className="size-3.5" />
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                            onClick={() => handleDeleteRule(rule.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Workflow Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl border border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <GitBranch className="size-4 text-primary" />
              {editingRule ? 'Edit Approval Step' : 'Add Approval Step'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure rule settings and conditions. Changes apply to newly created requests.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Approver Role</Label>
              <Select
                value={formApproverRole}
                onValueChange={(val) => setFormApproverRole(val)}
              >
                <SelectTrigger className="rounded-xl border-border bg-background">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEPT_HEAD">Department Head (DEPT_HEAD)</SelectItem>
                  <SelectItem value="ACCOUNTS_USER">Accounts User (ACCOUNTS_USER)</SelectItem>
                  <SelectItem value="STORE_ADMIN">Store Admin (STORE_ADMIN)</SelectItem>
                  <SelectItem value="STORE_OPERATOR">Store Operator (STORE_OPERATOR)</SelectItem>
                  <SelectItem value="admin">Admin (admin)</SelectItem>
                  <SelectItem value="MANAGEMENT">Management (MANAGEMENT)</SelectItem>
                  <SelectItem value="PURCHASE_USER">Procurement Manager (PURCHASE_USER)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Condition Type</Label>
              <Select
                value={formConditionType}
                onValueChange={(val: any) => setFormConditionType(val)}
              >
                <SelectTrigger className="rounded-xl border-border bg-background">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALWAYS">Always Apply</SelectItem>
                  <SelectItem value="AMOUNT_GTE">Total Amount &gt;=</SelectItem>
                  <SelectItem value="AMOUNT_LT">Total Amount &lt;</SelectItem>
                  <SelectItem value="FLAG_TRUE">Custom Metadata Flag is True</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formConditionType !== 'ALWAYS' && (
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                  {formConditionType === 'FLAG_TRUE' ? 'Flag Name' : 'Amount Threshold (₹)'}
                </Label>
                <Input
                  value={formConditionValue}
                  onChange={(e) => setFormConditionValue(e.target.value)}
                  className="rounded-xl border-border bg-background"
                  placeholder={formConditionType === 'FLAG_TRUE' ? 'isAsset' : '10000'}
                  type={formConditionType === 'FLAG_TRUE' ? 'text' : 'number'}
                />
              </div>
            )}

            <div className="flex items-center justify-between py-2 border-t border-border/10 mt-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Active Status</Label>
                <p className="text-[11px] text-muted-foreground">Toggle to enable or temporarily bypass this step.</p>
              </div>
              <Switch
                checked={formActive}
                onCheckedChange={setFormActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              className="rounded-xl border-border hover:bg-muted text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRule}
              disabled={savingWorkflow}
              className="rounded-xl text-xs shadow-md"
            >
              {savingWorkflow ? 'Saving...' : 'Save Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
