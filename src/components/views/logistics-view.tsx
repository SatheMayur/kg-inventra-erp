'use client'

import { useState, useEffect } from 'react'
import {
  ArrowRightLeft,
  Truck,
  ShieldCheck,
  Plus,
  Search,
  FileText,
  Clock,
  MoreVertical,
  ChevronRight,
  Filter,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

// --- Gate Pass Component ---
function GatePassList() {
  const [passes, setPasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Form State
  const [formData, setFormData] = useState({
    type: 'OUT' as 'IN' | 'OUT',
    receiverName: '',
    vehicleNumber: '',
    purpose: '',
  })

  async function load() {
    setLoading(true)
    try {
      const data = await api.logistics.gatePasses.list()
      setPasses(data)
    } catch (err) {
      toast.error('Failed to load gate passes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!formData.receiverName) {
      toast.error('Receiver name is required')
      return
    }
    setSaving(true)
    try {
      await api.logistics.gatePasses.create(formData)
      toast.success('Gate Pass issued successfully')
      setShowNewDialog(false)
      load()
      setFormData({
        type: 'OUT',
        receiverName: '',
        vehicleNumber: '',
        purpose: '',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await api.logistics.gatePasses.update(id, status)
      toast.success(`Gate pass marked as ${status.toLowerCase()}`)
      load()
    } catch (err) {
      toast.error('Failed to update status')
    }
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" />
          <Input placeholder="Search gate passes..." className="pl-9 h-9 bg-background border-border" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter className="size-3.5" />
            Filter
          </Button>
          <Button size="sm" className="h-9 gap-2" onClick={() => setShowNewDialog(true)}>
            <Plus className="size-3.5" />
            New Gate Pass
          </Button>
        </div>
      </div>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Issue Gate Pass
            </DialogTitle>
            <DialogDescription>Record security movement for personnel or vehicles.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Type</Label>
              <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v})}>
                <SelectTrigger className="bg-background border-border h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Entry (IN)</SelectItem>
                  <SelectItem value="OUT">Exit (OUT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Receiver / Bearer Name</Label>
              <Input 
                placeholder="Name of person carrying goods" 
                value={formData.receiverName}
                onChange={(e) => setFormData({...formData, receiverName: e.target.value})}
                className="bg-background border-border h-10" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Vehicle Number</Label>
                <Input 
                  placeholder="GJ-05-XX-0000" 
                  value={formData.vehicleNumber}
                  onChange={(e) => setFormData({...formData, vehicleNumber: e.target.value})}
                  className="bg-background border-border h-10" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Purpose</Label>
                <Input 
                  placeholder="e.g. Delivery, Courier" 
                  value={formData.purpose}
                  onChange={(e) => setFormData({...formData, purpose: e.target.value})}
                  className="bg-background border-border h-10" 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewDialog(false)} disabled={saving}>Cancel</Button>
            <Button 
              className="rounded-xl px-8 shadow-lg shadow-primary/20"
              onClick={handleCreate}
              disabled={saving || !formData.receiverName}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : 'Issue Pass'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/10">
            <TableRow className="border-border/20">
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Pass #</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Type</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Receiver / Bearer</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Vehicle</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6} className="h-12 animate-pulse bg-muted/5"></TableCell>
                </TableRow>
              ))
            ) : passes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-xs italic">
                  No active gate passes found.
                </TableCell>
              </TableRow>
            ) : (
              passes.map((pass) => (
                <TableRow key={pass.id} className="border-border/10 hover:bg-primary/5 transition-colors">
                  <TableCell className="font-mono text-xs font-bold">{pass.passNumber}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={pass.type === 'OUT' ? 'border-rose-500/20 text-rose-700 bg-rose-500/10' : 'border-emerald-500/20 text-emerald-700 bg-emerald-500/10'}>
                      {pass.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{pass.receiverName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{pass.vehicleNumber || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {pass.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground text-right">
                    <div className="flex items-center justify-end gap-3">
                      <span>{new Date(pass.createdAt).toLocaleDateString()}</span>
                      {pass.status === 'ISSUED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-500/10"
                          onClick={() => handleUpdateStatus(pass.id, 'COMPLETED')}
                        >
                          Complete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// --- Challan Component ---
function ChallanList() {
  const [challans, setChallans] = useState<any[]>([])
  const [pos, setPOs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    challanNumber: '',
    purchaseOrderId: '',
    receivedBy: '',
    notes: '',
  })

  async function load() {
    setLoading(true)
    try {
      const [challanData, poData] = await Promise.all([
        api.logistics.challans.list(),
        api.procurement.pos.list()
      ])
      setChallans(challanData)
      setPOs(poData.filter(p => p.status === 'SENT'))
    } catch (err) {
      toast.error('Failed to load logistics data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!formData.challanNumber || !formData.purchaseOrderId) {
      toast.error('Challan number and PO selection are required')
      return
    }
    setSaving(true)
    try {
      await api.logistics.challans.create(formData)
      toast.success('Challan verified and linked')
      setShowNewDialog(false)
      load()
      setFormData({ challanNumber: '', purchaseOrderId: '', receivedBy: '', notes: '' })
    } catch (err) {
      toast.error('Failed to verify challan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
       <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" />
          <Input placeholder="Search challans..." className="pl-9 h-9 bg-background border-border" />
        </div>
        <Button size="sm" className="h-9 gap-2" onClick={() => setShowNewDialog(true)}>
          <Plus className="size-3.5" />
          Verify Challan
        </Button>
      </div>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" /> Delivery Challan Verification
            </DialogTitle>
            <DialogDescription>Validate physical delivery note against a Purchase Order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Challan Number</Label>
              <Input 
                placeholder="e.g. DC/2024/001" 
                value={formData.challanNumber}
                onChange={(e) => setFormData({...formData, challanNumber: e.target.value})}
                className="bg-background border-border h-10" 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Link to Purchase Order</Label>
              <Select value={formData.purchaseOrderId} onValueChange={(v) => setFormData({...formData, purchaseOrderId: v})}>
                <SelectTrigger className="bg-background border-border h-10">
                  <SelectValue placeholder="Select a pending PO" />
                </SelectTrigger>
                <SelectContent>
                  {pos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.poNumber} ({p.supplier.name})</SelectItem>
                  ))}
                  {pos.length === 0 && <SelectItem value="none" disabled>No pending POs found</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Received By</Label>
              <Input 
                placeholder="Employee name" 
                value={formData.receivedBy}
                onChange={(e) => setFormData({...formData, receivedBy: e.target.value})}
                className="bg-background border-border h-10" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewDialog(false)} disabled={saving}>Cancel</Button>
            <Button 
              className="rounded-xl px-8 shadow-lg shadow-primary/20"
              onClick={handleCreate}
              disabled={saving || !formData.challanNumber || !formData.purchaseOrderId}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : 'Confirm Receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/10">
            <TableRow className="border-border/20">
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Challan #</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Linked PO</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Received By</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="h-12 animate-pulse bg-muted/5"></TableCell>
                </TableRow>
              ))
            ) : challans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-xs italic">
                  No delivery challans recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              challans.map((c) => (
                <TableRow key={c.id} className="border-border/10 hover:bg-primary/5 transition-colors">
                  <TableCell className="font-mono text-xs font-bold">{c.challanNumber}</TableCell>
                  <TableCell className="text-xs">{c.purchaseOrder?.poNumber || '—'}</TableCell>
                  <TableCell className="text-xs">{c.receivedBy}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-700 bg-emerald-500/10">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground text-right">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default function LogisticsView() {
  const [stats, setStats] = useState({ active: 0, cleared: 0, incoming: 0, loaded: false })

  useEffect(() => {
    async function loadStats() {
      try {
        const [passes, challans] = await Promise.all([
          api.logistics.gatePasses.list(),
          api.logistics.challans.list(),
        ])
        setStats({
          active: passes.filter((p: any) => p.status === 'ISSUED').length,
          cleared: passes.filter((p: any) => p.status === 'COMPLETED').length,
          incoming: challans.filter((c: any) => c.status === 'PENDING').length,
          loaded: true,
        })
      } catch {
        setStats((s) => ({ ...s, loaded: true }))
      }
    }
    loadStats()
  }, [])

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Stat Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Truck className="size-5 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Active Movements</p>
                <p className="text-2xl font-bold">{stats.loaded ? stats.active : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
                <ShieldCheck className="size-5 text-sky-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Cleared Passes</p>
                <p className="text-2xl font-bold">{stats.loaded ? stats.cleared : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <ArrowRightLeft className="size-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Incoming Freight</p>
                <p className="text-2xl font-bold">{stats.loaded ? stats.incoming : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="gate-passes" className="space-y-6">
        <TabsList className="bg-muted/20 p-1 border border-border">
          <TabsTrigger value="gate-passes" className="gap-2 px-6 py-2">
            <ShieldCheck className="size-4" />
            Gate Passes
          </TabsTrigger>
          <TabsTrigger value="challans" className="gap-2 px-6 py-2">
            <FileText className="size-4" />
            Delivery Challans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gate-passes" className="mt-0">
          <GatePassList />
        </TabsContent>

        <TabsContent value="challans" className="mt-0">
          <ChallanList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
