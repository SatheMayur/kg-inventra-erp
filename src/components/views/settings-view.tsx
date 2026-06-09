'use client'

import { useEffect, useState, useCallback } from 'react'
import { Settings, Sliders, Activity, Info, Database, ShieldCheck, Server, CheckCircle2, XCircle, RefreshCw, AlertCircle } from 'lucide-react'
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

  useEffect(() => {
    fetchFlags()
    // Fetch real health data
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => setHealth({ status: 'error' }))
      .finally(() => setHealthLoading(false))
  }, [fetchFlags])

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="size-5 text-primary" />
        <h3 className="text-lg font-semibold">Settings</h3>
      </div>

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
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-48" />
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
    </div>
  )
}
