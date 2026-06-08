'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowLeft, 
  Target, 
  TrendingUp, 
  Zap, 
  Users, 
  BarChart, 
  ShieldCheck,
  PackageCheck,
  Sparkles,
  DollarSign,
  Rocket,
  Gauge,
  Percent,
  History,
  MoveRight
} from 'lucide-react'

export default function StrategicPitchView({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 animate-pulse">
              Strategic Executive Brief
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">CONFIDENTIAL // v2.1</span>
          </div>
          <h2 className="text-5xl font-extrabold tracking-tighter bg-gradient-to-r from-primary via-sky-400 to-indigo-500 bg-clip-text text-transparent py-1">
            Inventra: The Intelligence Edge
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl">
            A comprehensive strategic roadmap for high-precision logistics and financial oversight.
          </p>
        </div>
        <Button variant="outline" onClick={onBack} className="gap-2 rounded-full px-6 hover:bg-muted/20">
          <ArrowLeft className="size-4" /> Return to Operations
        </Button>
      </div>

      {/* Goal & Overview Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-gradient-to-br from-primary/5 via-background to-background border-primary/20 backdrop-blur-xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Target className="size-32 -rotate-12" />
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Target className="size-6 text-primary" />
              The Mission: Zero-Leakage Paradigm
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 relative z-10">
            <p className="text-xl leading-relaxed text-muted-foreground/90">
              Transforming traditional, fragmented inventory into a <span className="text-foreground font-bold italic text-primary">unified financial engine</span>. Inventra bridges the gap between physical operations and corporate strategy.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Visibility</p>
                <p className="text-2xl font-black text-primary">100%</p>
              </div>
              <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">ROI Index</p>
                <p className="text-2xl font-black text-emerald-500">3.2x</p>
              </div>
              <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Op. Margin</p>
                <p className="text-2xl font-black text-sky-400">+18%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security / Speed Box */}
        <Card className="bg-muted/10 border-border/50 flex flex-col justify-center">
          <CardContent className="space-y-6 p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Rocket className="size-5 text-purple-500" />
                <h4 className="font-bold text-lg">System Velocity</h4>
              </div>
              <p className="text-sm text-muted-foreground">Fulfillment latency reduced by <span className="text-foreground font-bold">65%</span> through automated approval chains.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-amber-500" />
                <h4 className="font-bold text-lg">Hardened RBAC</h4>
              </div>
              <p className="text-sm text-muted-foreground">Sensitive valuation and audit logs isolated to root administrators.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Before vs After Section */}
      <div className="space-y-4">
        <h3 className="text-2xl font-bold flex items-center gap-2 px-1">
          <History className="size-6 text-muted-foreground" />
          The Strategic Shift: Before vs. After
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-rose-500/5 border-rose-500/20 opacity-80 grayscale-[0.5]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-widest text-rose-500">Legacy Status Quo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="size-1.5 rounded-full bg-rose-500 mt-1.5" />
                <p className="text-sm text-muted-foreground italic">"Fragmented manual ledgers and blind spending."</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="size-1.5 rounded-full bg-rose-500 mt-1.5" />
                <p className="text-sm text-muted-foreground">High leakage and unaccounted for "ghost" inventory.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="size-1.5 rounded-full bg-rose-500 mt-1.5" />
                <p className="text-sm text-muted-foreground">Days-long manual audits and stockouts.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-emerald-500/5 border-emerald-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <Sparkles className="size-8 text-emerald-500/20 animate-pulse" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-widest text-emerald-500">Inventra Vision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <MoveRight className="size-4 text-emerald-500 mt-0.5" />
                <p className="text-sm font-medium">Real-time digital twin of all physical assets.</p>
              </div>
              <div className="flex items-start gap-3">
                <MoveRight className="size-4 text-emerald-500 mt-0.5" />
                <p className="text-sm font-medium">Granular departmental spending accountability.</p>
              </div>
              <div className="flex items-start gap-3">
                <MoveRight className="size-4 text-emerald-500 mt-0.5" />
                <p className="text-sm font-medium">Predictive stockout risk and JIT procurement.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ROI & Key Metrics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          icon={<DollarSign className="text-emerald-500" />}
          title="Revenue Recovery"
          value="+12.5%"
          subtitle="Capital Reclaim"
          description="Monetizing consumption data"
          trend="High Potential"
        />
        <MetricCard 
          icon={<Gauge className="text-purple-500" />}
          title="Admin Savings"
          value="45%"
          subtitle="Time Overhead"
          description="Automated digital reporting"
          trend="-20h / week"
        />
        <MetricCard 
          icon={<Percent className="text-sky-500" />}
          title="Op. Margin"
          value="+18%"
          subtitle="Net Profitability"
          description="Waste & Leakage elimination"
          trend="Quarterly Lift"
        />
        <MetricCard 
          icon={<Zap className="text-amber-500" />}
          title="Response Time"
          value="-65%"
          subtitle="Wait Latency"
          description="Rapid issuance cycle"
          trend="Instant Sync"
        />
      </div>

      {/* Pillars of Intelligence */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PillarCard 
          icon={<PackageCheck className="text-sky-500" />}
          title="Integrated PO/GRN"
          description="Seamless transition from procurement to inventory with automated valuation."
        />
        <PillarCard 
          icon={<Users className="text-primary" />}
          title="Dept Spending Hub"
          description="Dynamic budgeting and financial oversight for departmental resource usage."
        />
        <PillarCard 
          icon={<TrendingUp className="text-purple-500" />}
          title="Predictive Supply"
          description="AI-driven stockout risk modeling based on real-time consumption velocity."
        />
        <PillarCard 
          icon={<BarChart className="text-emerald-500" />}
          title="Intelligence Reports"
          description="Deep-dive analytics for sponsorship ROI and high-impact logistics audit."
        />
      </div>

      {/* Final Statement */}
      <div className="p-10 rounded-3xl bg-slate-950 border border-primary/20 text-center space-y-6 relative overflow-hidden shadow-2xl shadow-primary/10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-indigo-500/10" />
        <div className="relative z-10 space-y-4">
          <Sparkles className="size-16 mx-auto text-primary animate-pulse mb-2" />
          <h3 className="text-3xl font-black tracking-tight text-white uppercase italic">Strategic Readiness Statement</h3>
          <p className="text-slate-400 max-w-3xl mx-auto text-lg leading-relaxed">
            Inventra is not just a tool; it is the <span className="text-primary font-bold">decision backbone</span> of a scalable enterprise. By bridging the gap between operations and strategy, we ensure every asset is a high-impact contributor to the bottom line.
          </p>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon, title, value, subtitle, description, trend }: { 
  icon: React.ReactNode, 
  title: string, 
  value: string, 
  subtitle: string,
  description: string,
  trend: string
}) {
  return (
    <Card className="border-border/50 bg-card/40 hover:bg-card transition-colors">
      <CardContent className="p-6 space-y-2">
        <div className="flex items-center justify-between">
          <div className="size-10 rounded-lg bg-background border border-border flex items-center justify-center shadow-sm">
            {icon}
          </div>
          <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter bg-background/50">
            {trend}
          </Badge>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-black tracking-tighter">{value}</p>
        </div>
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-bold text-foreground/80">{subtitle}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function PillarCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm group hover:border-primary/50 transition-all cursor-default">
      <CardContent className="p-6 space-y-3">
        <div className="size-10 rounded-lg bg-background flex items-center justify-center border border-border group-hover:scale-110 group-hover:border-primary transition-all">
          {icon}
        </div>
        <h4 className="font-bold">{title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}
