'use client'

import { useState, type FormEvent } from 'react'
import Image from 'next/image'
import { Loader2, ArrowRight, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'

interface LoginResponse {
  user: {
    id: string;
    empId: string;
    name: string;
    department: string;
    floor: string;
    role: string;
    active: boolean;
  };
  token: string;
}

export default function LoginScreen() {
  const [empId, setEmpId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const setUser = useAppStore((s) => s.setUser)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const cleanEmpId = empId.trim()
    if (!cleanEmpId || !password.trim()) {
      setError('Please enter both Employee ID and Password')
      return
    }

    setLoading(true)
    try {
      const res = await api.auth.login(cleanEmpId, password) as LoginResponse
      setUser({ ...res.user, role: res.user.role as 'admin' | 'employee' })
      toast.success(`Welcome back, ${res.user.name}!`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Extra ambient glow behind the card */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(99,102,241,0.12) 0%, transparent 70%)',
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Top label */}
        <div className="mb-4 flex items-center justify-center">
          <div className="flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/60 backdrop-blur-sm">
            <ShieldCheck className="size-3 text-primary/70" />
            Internal Access Only
          </div>
        </div>

        <div
          className="w-full rounded-2xl border-2 border-white/50 p-8"
          style={{
            background: 'rgba(255,255,255,0.58)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.90), 0 8px 40px rgba(30,27,75,0.12), 0 2px 8px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
          }}
        >
          {/* Logo */}
          <div className="mb-7 flex flex-col items-center gap-3">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold tracking-tight shadow-lg shadow-primary/15 select-none">KG</span>
            <div className="text-center">
              <p className="text-lg font-semibold tracking-tight">KG<span className="text-primary">_</span>inventra</p>
              <p className="text-[11px] text-muted-foreground">Inventory ERP</p>
            </div>
          </div>

          <div className="mb-5 border-t border-white/40" />

          {/* Heading */}
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-foreground">Sign in to continue</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Operations Suite · KG_inventra v1.0</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="empId"
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                Employee ID
              </Label>
              <Input
                id="empId"
                type="text"
                placeholder="e.g. jbshah"
                value={empId}
                onChange={(e) => {
                  setEmpId(e.target.value)
                  if (error) setError('')
                }}
                className="h-10 border-white/40 bg-white/30 placeholder:text-muted-foreground/50 focus-visible:ring-primary/20 focus-visible:border-primary/50 backdrop-blur-sm"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
                className="h-10 border-white/40 bg-white/30 placeholder:text-muted-foreground/50 focus-visible:ring-primary/20 focus-visible:border-primary/50 backdrop-blur-sm"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700">
                <span className="shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="mt-1 h-10 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2 transition-all duration-200 hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(30,27,75,0.25)]"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-center gap-3 text-[10px] text-muted-foreground/60">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            All systems operational
          </span>
          <span>·</span>
          <span>KG_inventra · Internal Tool</span>
        </div>
      </div>
    </div>
  )
}
