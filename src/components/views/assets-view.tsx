'use client'

import { useState, useEffect, useCallback } from 'react'
import { Cpu, Plus, Loader2, UserPlus, Undo2, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface Asset {
  id: string
  name: string
  serialNumber: string
  status: 'IN_STOCK' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED'
  assignedToUserId: string | null
  assignedAt: string | null
  warrantyExpiry: string | null
  licenseExpiry: string | null
}
interface UserLite { id: string; name: string; empId: string; department: string }

const STATUS_STYLE: Record<Asset['status'], string> = {
  IN_STOCK: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  ASSIGNED: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  MAINTENANCE: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  RETIRED: 'bg-stone-500/10 text-stone-500 border-stone-500/20',
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export default function AssetsView() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [users, setUsers] = useState<UserLite[]>([])
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [serial, setSerial] = useState('')
  const [warranty, setWarranty] = useState('')
  const [saving, setSaving] = useState(false)

  const [assignTarget, setAssignTarget] = useState<Asset | null>(null)
  const [assignUserId, setAssignUserId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, u] = await Promise.all([
        jsonOrThrow(await fetch('/api/assets')),
        jsonOrThrow(await fetch('/api/users')),
      ])
      setAssets(a.assets ?? [])
      setUsers((u.users ?? u ?? []) as UserLite[])
    } catch {
      toast.error('Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const userName = (id: string | null) => users.find((u) => u.id === id)?.name ?? '—'

  async function handleCreate() {
    if (!name.trim() || !serial.trim()) {
      toast.error('Name and serial number are required')
      return
    }
    setSaving(true)
    try {
      await jsonOrThrow(await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          serialNumber: serial.trim(),
          warrantyExpiry: warranty ? new Date(warranty).toISOString() : null,
        }),
      }))
      toast.success(`Asset "${name.trim()}" added`)
      setName(''); setSerial(''); setWarranty('')
      await load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add asset')
    } finally {
      setSaving(false)
    }
  }

  async function handleAssign() {
    if (!assignTarget || !assignUserId) return
    setBusy(assignTarget.id)
    try {
      await jsonOrThrow(await fetch(`/api/assets/${assignTarget.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: assignUserId }),
      }))
      toast.success('Asset assigned')
      setAssignTarget(null); setAssignUserId('')
      await load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setBusy(null)
    }
  }

  async function handleReturn(a: Asset) {
    setBusy(a.id)
    try {
      await jsonOrThrow(await fetch(`/api/assets/${a.id}/return`, { method: 'POST' }))
      toast.success('Asset returned to stock')
      await load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to return')
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(a: Asset) {
    setBusy(a.id)
    try {
      await jsonOrThrow(await fetch(`/api/assets/${a.id}`, { method: 'DELETE' }))
      toast.success('Asset deleted')
      await load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(null)
    }
  }

  const total = assets.length
  const assigned = assets.filter((a) => a.status === 'ASSIGNED').length
  const inStock = assets.filter((a) => a.status === 'IN_STOCK').length

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Cpu className="size-5" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">IT Assets</span>
        </div>
        <h2 className="text-4xl font-extrabold tracking-tighter">IT Assets</h2>
        <p className="text-muted-foreground">Serialized equipment — assign to staff, track warranty, return to stock.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {([['Total', total], ['Assigned', assigned], ['In stock', inStock]] as const).map(([label, val]) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{label}</p>
              <p className="text-2xl font-bold">{loading ? '—' : val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-4">New Asset</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Name *</Label>
              <Input placeholder="e.g. Dell Latitude 7440" value={name} onChange={(e) => setName(e.target.value)} className="bg-background h-10 rounded-xl" />
            </div>
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Serial No. *</Label>
              <Input placeholder="SN-..." value={serial} onChange={(e) => setSerial(e.target.value)} className="bg-background h-10 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Warranty until</Label>
              <Input type="date" value={warranty} onChange={(e) => setWarranty(e.target.value)} className="bg-background h-10 rounded-xl" />
            </div>
            <Button className="rounded-xl gap-2 h-10" onClick={handleCreate} disabled={saving || !name.trim() || !serial.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add Asset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Asset</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Serial</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Assigned To</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Warranty</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : assets.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Cpu className="size-10 opacity-20" /><p className="text-sm">No assets yet. Add one above.</p>
                  </div>
                </TableCell></TableRow>
              ) : assets.map((a) => (
                <TableRow key={a.id} className="group border-border/20 hover:bg-primary/5">
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="font-mono text-xs">{a.serialNumber}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-xs ${STATUS_STYLE[a.status]}`}>{a.status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-sm">{a.status === 'ASSIGNED' ? userName(a.assignedToUserId) : '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.warrantyExpiry ? new Date(a.warrantyExpiry).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {a.status === 'IN_STOCK' && (
                        <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled={busy === a.id} onClick={() => { setAssignTarget(a); setAssignUserId('') }}>
                          <UserPlus className="size-3.5" /> Assign
                        </Button>
                      )}
                      {a.status === 'ASSIGNED' && (
                        <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled={busy === a.id} onClick={() => handleReturn(a)}>
                          <Undo2 className="size-3.5" /> Return
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:bg-destructive/10" disabled={busy === a.id} onClick={() => handleDelete(a)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!assignTarget} onOpenChange={(o) => { if (!o) setAssignTarget(null) }}>
        <DialogContent className="sm:max-w-sm border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="size-5 text-primary" /> Assign Asset</DialogTitle>
            <DialogDescription>Assign <strong>{assignTarget?.name}</strong> to an employee.</DialogDescription>
          </DialogHeader>
          <Select value={assignUserId} onValueChange={setAssignUserId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.empId}) · {u.department}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button className="gap-2" onClick={handleAssign} disabled={!assignUserId || busy === assignTarget?.id}>
              {busy === assignTarget?.id ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
