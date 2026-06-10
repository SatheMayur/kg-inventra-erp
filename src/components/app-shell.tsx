'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import {
  LayoutDashboard,
  Package,
  Cpu,
  ClipboardList,
  HandHeart,
  ArrowRightLeft,
  Users,
  Settings,
  BarChart3,
  LogOut,
  ChevronRight,
  ShieldAlert,
  WifiOff,
  ShoppingCart,
  Truck,
  FileSpreadsheet,
  Tag,
  Sliders,
  PackageCheck,
  ClipboardCheck,
  Bell,
  Plug2,
} from 'lucide-react'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import DashboardView from '@/components/views/dashboard-view'
import InventoryView from '@/components/views/inventory-view'
import RequestsView from '@/components/views/requests-view'
import IssuanceView from '@/components/views/issuance-view'
import TransactionsView from '@/components/views/transactions-view'
import UsersView from '@/components/views/users-view'
import ReportingView from '@/components/views/reporting-view'
import SettingsView from '@/components/views/settings-view'
import AuditView from '@/components/views/audit-view'
import StrategicPitchView from '@/components/views/strategic-pitch-view'
import ProcurementView from '@/components/views/procurement-view'
import LogisticsView from '@/components/views/logistics-view'
import StockTransferView from '@/components/views/stock-transfer-view'
import ImportView from '@/components/views/import-view'
import TagsView from '@/components/views/tags-view'
import CustomFieldsView from '@/components/views/custom-fields-view'
import CheckoutView from '@/components/views/checkout-view'
import PickListView from '@/components/views/pick-list-view'
import AlertsView from '@/components/views/alerts-view'
import IntegrationsView from '@/components/views/integrations-view'
import AssetsView from '@/components/views/assets-view'
import { BarcodeListener } from '@/components/barcode-listener'
import { CommandBar } from '@/components/command-bar'
import { ErrorBoundary } from '@/components/error-boundary'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  badge?: number
}

const NAV_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Workspace', ids: ['dashboard', 'inventory', 'requests', 'import', 'tags', 'custom-fields'] },
  { label: 'Operations', ids: ['procurement', 'logistics', 'transfers', 'issuance', 'checkout', 'pick-lists', 'alerts'] },
  { label: 'Analytics', ids: ['reporting', 'transactions'] },
  { label: 'System', ids: ['audit', 'users', 'settings', 'integrations'] },
]

const VIEW_CONFIG: Record<string, { label: string; roles: string[]; icon: React.ReactNode; subtitle: string; rootOnly?: boolean }> = {
  dashboard: { 
    label: 'Dashboard', 
    roles: ['admin', 'employee'], 
    icon: <LayoutDashboard className="size-4" />,
    subtitle: 'Overview of your inventory'
  },
  inventory: { 
    label: 'Inventory', 
    roles: ['admin'], 
    icon: <Package className="size-4" />,
    subtitle: 'Manage your stock items'
  },
  requests: { 
    label: 'Requests', 
    roles: ['admin', 'employee'], 
    icon: <ClipboardList className="size-4" />,
    subtitle: 'Track and manage requests'
  },
  import: {
    label: 'Import',
    roles: ['admin'],
    icon: <FileSpreadsheet className="size-4" />,
    subtitle: 'Bulk import items from spreadsheet'
  },
  assets: {
    label: 'IT Assets',
    roles: ['admin'],
    icon: <Cpu className="size-4" />,
    subtitle: 'Serialized equipment & assignments'
  },
  tags: {
    label: 'Tags',
    roles: ['admin'],
    icon: <Tag className="size-4" />,
    subtitle: 'Manage item tags and folders'
  },
  'custom-fields': {
    label: 'Custom Fields',
    roles: ['admin'],
    icon: <Sliders className="size-4" />,
    subtitle: 'Define custom item attributes'
  },
  procurement: {
    label: 'Procurement',
    roles: ['admin'],
    icon: <ShoppingCart className="size-4" />,
    subtitle: 'Manage POs, Invoices and Suppliers'
  },
  logistics: {
    label: 'Logistics',
    roles: ['admin'],
    icon: <ArrowRightLeft className="size-4" />,
    subtitle: 'Challans and Gate Passes'
  },
  transfers: {
    label: 'Stock Transfers',
    roles: ['admin'],
    icon: <Truck className="size-4" />,
    subtitle: 'Transfer memos and Petpooja reconciliation',
  },
  issuance: {
    label: 'Issuance',
    roles: ['admin'],
    icon: <HandHeart className="size-4" />,
    subtitle: 'Process pending issuances'
  },
  checkout: {
    label: 'Check-out',
    roles: ['admin', 'employee'],
    icon: <PackageCheck className="size-4" />,
    subtitle: 'Track item custody'
  },
  'pick-lists': {
    label: 'Pick Lists',
    roles: ['admin'],
    icon: <ClipboardCheck className="size-4" />,
    subtitle: 'Gather items for jobs'
  },
  alerts: {
    label: 'Alerts',
    roles: ['admin', 'employee'],
    icon: <Bell className="size-4" />,
    subtitle: 'Low stock and maintenance alerts'
  },
  reporting: { 
    label: 'Reporting', 
    roles: ['admin'], 
    icon: <BarChart3 className="size-4" />,
    subtitle: 'Analytics and reports'
  },
  transactions: { 
    label: 'Transactions', 
    roles: ['admin', 'employee'], 
    icon: <ArrowRightLeft className="size-4" />,
    subtitle: 'Transaction history'
  },
  audit: { 
    label: 'Security Logs', 
    roles: ['admin'], 
    rootOnly: true,
    icon: <ShieldAlert className="size-4" />,
    subtitle: 'System audit and activity'
  },
  users: { 
    label: 'User Management', 
    roles: ['admin'], 
    rootOnly: true,
    icon: <Users className="size-4" />,
    subtitle: 'Manage users and roles'
  },
  settings: {
    label: 'Settings',
    roles: ['admin'],
    rootOnly: true,
    icon: <Settings className="size-4" />,
    subtitle: 'System configuration'
  },
  integrations: {
    label: 'Integrations',
    roles: ['admin'],
    icon: <Plug2 className="size-4" />,
    subtitle: 'Slack, Teams, Webhooks and more'
  },
}

function ViewRenderer({ view, user, onPitchModeChange }: { view: string; user: any; onPitchModeChange: (val: boolean) => void }) {
  const config = VIEW_CONFIG[view] || VIEW_CONFIG.dashboard
  const hasRole = config.roles.includes(user?.role)
  const isRoot = user?.empId === 'software'
  const hasAccess = hasRole && (!config.rootOnly || isRoot)
  
  // Strict guard: if user is not allowed for this view, fallback to dashboard
  if (!hasAccess) return <DashboardView />

  switch (view) {
    case 'dashboard':
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/50 bg-clip-text text-transparent">Dashboard</h2>
              <p className="text-muted-foreground">
                {user?.role === 'admin' 
                  ? 'Live operations — stock health, procurement activity, and stockout risk.'
                  : 'Overview of your active requests and inventory assets.'}
              </p>
            </div>
            {user?.role === 'admin' && (
              <div className="flex items-center gap-2">
                <Tabs defaultValue="ops" className="w-[300px]" onValueChange={(v) => {
                  if (v === 'pitch') onPitchModeChange(true)
                  else onPitchModeChange(false)
                }}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="ops">Operations</TabsTrigger>
                    <TabsTrigger value="pitch">Strategy</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
          </div>
          <DashboardView />
        </div>
      )
    case 'inventory':
      return <InventoryView />
    case 'requests':
      return <RequestsView />
    case 'issuance':
      return <IssuanceView />
    case 'transactions':
      return <TransactionsView />
    case 'users':
      return <UsersView />
    case 'reporting':
      return <ReportingView />
    case 'audit':
      return <AuditView />
    case 'settings':
      return <SettingsView />
    case 'procurement':
      return <ProcurementView />
    case 'logistics':
      return <LogisticsView />
    case 'transfers':
      return <StockTransferView />
    case 'import':
      return <ImportView />
    case 'assets':
      return <AssetsView />
    case 'tags':
      return <TagsView />
    case 'custom-fields':
      return <CustomFieldsView />
    case 'checkout':
      return <CheckoutView />
    case 'pick-lists':
      return <PickListView />
    case 'alerts':
      return <AlertsView />
    case 'integrations':
      return <IntegrationsView />
    default:
      return <DashboardView />
  }
}

export default function AppShell() {
  const user = useAppStore((s) => s.user)
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const pendingCount = useAppStore((s) => s.pendingCount)
  const setPendingCount = useAppStore((s) => s.setPendingCount)
  const reset = useAppStore((s) => s.reset)
  const flags = useAppStore((s) => s.flags)

  // Generate dynamic navigation based on user role
  const navItems = Object.entries(VIEW_CONFIG)
    .filter(([_, config]) => {
      const hasRole = config.roles.includes(user?.role || '')
      const isRoot = user?.empId === 'software'
      return hasRole && (!config.rootOnly || isRoot)
    })
    .map(([id, config]) => {
      let label = config.label
      if (id === 'requests' && user?.role === 'employee') label = 'My Requests'
      if (id === 'requests' && user?.role === 'admin') label = 'All Requests'
      if (id === 'transactions' && user?.role === 'employee') label = 'My History'
      
      const item: NavItem = {
        id,
        label,
        icon: config.icon,
      }

      if (id === 'issuance' && pendingCount > 0) {
        item.badge = pendingCount
      }

      return item
    })

  const isOnline = useOnlineStatus()

  // Load feature flags on mount
  useEffect(() => {
    async function loadFlags() {
      try {
        const flags = await api.settings.getFlags()
        useAppStore.getState().setFlags(flags)
      } catch (err) {
        console.error('[AppShell] Failed to load feature flags:', err)
      }
    }
    loadFlags()
  }, [])

  // Fetch pending count for admin — pauses when tab is hidden to reduce server load
  useEffect(() => {
    if (user?.role !== 'admin') return

    async function fetchPending() {
      if (document.visibilityState === 'hidden') return
      try {
        const data = await api.reporting.dashboard()
        setPendingCount(data.pendingCount + data.approvedCount)
      } catch (err) {
        console.error('[AppShell] Failed to fetch pending count:', err)
      }
    }

    fetchPending()
    const interval = setInterval(fetchPending, 30000)

    // Also re-fetch immediately when tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchPending()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user?.role, setPendingCount])



  function handleLogout() {
    // Clear httpOnly cookie server-side, then reset local state
    api.auth.logout().catch(() => {}).finally(() => {
      reset()
      toast.success('Logged out successfully')
    })
  }

  const viewInfo = VIEW_CONFIG[currentView] || VIEW_CONFIG.dashboard
  const initials = user?.name
    ? user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    : '??'

  const [pitchMode, setPitchMode] = React.useState(false)

  if (pitchMode) {
    return <StrategicPitchView onBack={() => setPitchMode(false)} />
  }

  return (
    <SidebarProvider>
      <BarcodeListener />
      <CommandBar />
      {/* Sidebar */}
      <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
        {/* Header */}
        <SidebarHeader className="px-4 py-4 border-b border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="gap-3 hover:bg-transparent cursor-default select-none">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold shrink-0 select-none">KG</span>
                <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-semibold text-sm tracking-tight">KG<span className="text-primary">_</span>inventra</span>
                  <span className="text-[10px] text-muted-foreground">Inventory ERP</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* Nav items */}
        <SidebarContent>
          {NAV_GROUPS.map((group) => {
            const groupItems = navItems.filter((item) => group.ids.includes(item.id))
            if (groupItems.length === 0) return null
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {groupItems.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={currentView === item.id}
                          onClick={() => setCurrentView(item.id)}
                          tooltip={flags.tooltips ? item.label : undefined}
                          className="gap-3"
                        >
                          {item.icon}
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        {item.badge ? (
                          <SidebarMenuBadge className="bg-primary text-primary-foreground">
                            {item.badge}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          })}
        </SidebarContent>

        {/* Footer with user info */}
        <SidebarFooter className="p-3 border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="gap-3">
                <Avatar className="size-8 ring-1 ring-border">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="text-sm font-medium text-foreground">{user?.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {user?.empId} · {user?.department} · {user?.floor}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleLogout}
                tooltip="Log out"
                className="gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/8"
              >
                <LogOut className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      {/* Main content area */}
      <SidebarInset>
        {/* Header bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
          <SidebarTrigger className="-ml-1" />

          <Separator orientation="vertical" className="h-6" />

          <div className="flex items-center gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{viewInfo.label}</h2>
                {!isOnline && (
                  <Badge variant="outline" className="h-5 px-1.5 border-red-500/50 bg-red-500/10 text-red-400 gap-1 animate-pulse text-[10px]">
                    <WifiOff className="size-2.5" />
                    Offline
                  </Badge>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <ChevronRight className="size-3 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">{viewInfo.subtitle}</span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center rounded-full border border-white/40 bg-white/20 backdrop-blur-sm px-3 py-1 text-[10px] font-medium text-muted-foreground">
              Internal Tool · v1.0
            </div>

            <NotificationCenter />

            <div className="hidden md:flex items-center gap-2.5 pl-3 border-l border-border">
              <Avatar className="size-7 ring-1 ring-border">
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col leading-none">
                <span className="text-xs font-semibold text-foreground">{user?.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{user?.role} · {user?.department}</span>
              </div>
            </div>
          </div>
        </header>





        {/* Content */}
        <div className="flex-1 p-4 md:p-6">
          <ErrorBoundary>
            <ViewRenderer view={currentView} user={user} onPitchModeChange={setPitchMode} />
          </ErrorBoundary>
        </div>
      </SidebarInset>

    </SidebarProvider>
  )
}
