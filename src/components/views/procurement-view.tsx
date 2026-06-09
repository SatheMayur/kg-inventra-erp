'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  ShoppingCart, 
  Truck, 
  Plus, 
  Search, 
  ChevronRight, 
  Package, 
  Store, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  Building2,
  Calendar,
  IndianRupee,
  MoreVertical,
  ArrowDownToLine,
  Loader2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, POResponse, SupplierResponse, ItemResponse, InvoiceResponse } from '@/lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function ProcurementView() {
  const [pos, setPos] = useState<POResponse[]>([])
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pos')
  const [invoices, setInvoices] = useState<any[]>([])

  // New PO Dialog state
  const [showNewPODialog, setShowNewPODialog] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [poItems, setPOItems] = useState<Array<{ itemId: string, qty: number, unitPrice: number }>>([])
  const [poNotes, setPONotes] = useState('')
  const [savingPO, setSavingPO] = useState(false)
  
  // New Invoice Dialog state
  const [showNewInvoiceDialog, setShowNewInvoiceDialog] = useState(false)
  const [invoiceData, setInvoiceData] = useState({
    invoiceNumber: '',
    purchaseOrderId: '',
    amount: 0,
    notes: ''
  })
  const [savingInvoice, setSavingInvoice] = useState(false)

  // New Supplier Dialog state
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', contact: '', email: '', category: '' })
  const [savingSupplier, setSavingSupplier] = useState(false)

  // Payment Dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [updatingPayment, setUpdatingPayment] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [posData, suppliersData, itemsData, invoicesData] = await Promise.all([
        api.procurement.pos.list(),
        api.procurement.suppliers.list(),
        api.items.list({ pageSize: 1000 }).then(res => res.items),
        api.procurement.invoices.list()
      ])
      setPos(posData)
      setSuppliers(suppliersData)
      setItems(itemsData)
      setInvoices(invoicesData)
    } catch (err) {
      toast.error('Failed to load procurement data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreatePO = async () => {
    if (!selectedSupplier) {
      toast.error('Please select a supplier')
      return
    }

    const validItems = poItems.filter(i => i.itemId && i.qty > 0)
    if (validItems.length === 0) {
      toast.error('Please add at least one valid item with quantity > 0')
      return
    }

    setSavingPO(true)
    try {
      const totalAmount = validItems.reduce((acc, curr) => acc + (curr.qty * curr.unitPrice), 0)
      
      await api.procurement.pos.create({
        supplierId: selectedSupplier,
        items: validItems,
        totalAmount,
        notes: poNotes,
      })
      toast.success('Purchase order sent successfully')
      setShowNewPODialog(false)
      fetchData()
      setPOItems([{ itemId: '', qty: 1, unitPrice: 0 }])
      setPONotes('')
    } catch (err) {
      toast.error('Failed to send purchase order')
    } finally {
      setSavingPO(false)
    }
  }

  const handleCreateSupplier = async () => {
    if (!newSupplier.name) {
      toast.error('Supplier name is required')
      return
    }
    setSavingSupplier(true)
    try {
      await api.procurement.suppliers.create(newSupplier)
      toast.success('Supplier added')
      setShowNewSupplierDialog(false)
      fetchData()
      setNewSupplier({ name: '', contact: '', email: '', category: '' })
    } catch (err) {
      toast.error('Failed to add supplier')
    } finally {
      setSavingSupplier(false)
    }
  }

  const handleReceivePO = async (id: string) => {
    try {
      await api.procurement.pos.receive(id)
      toast.success('Goods received and stock updated')
      fetchData()
    } catch (err) {
      toast.error('Failed to process GRN')
    }
  }

  const handleCreateInvoice = async () => {
    if (!invoiceData.invoiceNumber || !invoiceData.purchaseOrderId || invoiceData.amount <= 0) {
      toast.error('Please fill in all required invoice details')
      return
    }
    setSavingInvoice(true)
    try {
      await api.procurement.invoices.create(invoiceData)
      toast.success('Invoice recorded successfully')
      setShowNewInvoiceDialog(false)
      fetchData()
      setInvoiceData({ invoiceNumber: '', purchaseOrderId: '', amount: 0, notes: '' })
    } catch (err) {
      toast.error('Failed to record invoice')
    } finally {
      setSavingInvoice(false)
    }
  }

  const handleUpdatePayment = async () => {
    if (!selectedInvoice) return
    setUpdatingPayment(true)
    try {
      const newStatus: InvoiceResponse['status'] = paymentAmount >= selectedInvoice.amount ? 'PAID' : 'UNPAID'

      await api.procurement.invoices.update(selectedInvoice.id, {
        status: newStatus
      })
      toast.success('Payment recorded')
      setShowPaymentDialog(false)
      fetchData()
    } catch (err) {
      toast.error('Failed to record payment')
    } finally {
      setUpdatingPayment(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 gap-1.5"><CheckCircle2 className="size-3" /> Received</Badge>
      case 'SENT':
        return <Badge variant="outline" className="bg-sky-500/10 text-sky-700 border-sky-500/20 gap-1.5"><Truck className="size-3" /> Sent</Badge>
      case 'DRAFT':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20 gap-1.5"><Clock className="size-3" /> Draft</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header section with Stats */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <ShoppingCart className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Procurement Ops</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">Purchase & Supply</h2>
          <p className="text-muted-foreground">Manage vendor relations and formal inventory procurement.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="rounded-xl border-border bg-transparent hover:bg-muted/20 gap-2"
            onClick={() => setShowNewSupplierDialog(true)}
          >
            <Building2 className="size-4" /> Add Supplier
          </Button>
          <Button 
            className="rounded-xl shadow-lg shadow-primary/20 gap-2"
            onClick={() => setShowNewPODialog(true)}
          >
            <Plus className="size-4" /> Raise Purchase Order
          </Button>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="pos" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/20 p-1 rounded-xl border border-border mb-6">
          <TabsTrigger value="pos" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Purchase Orders
          </TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Invoices
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Suppliers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="space-y-4">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Order Details</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Supplier</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Items</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Total Value</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={6} className="h-16 animate-pulse bg-muted/10" /></TableRow>
                    ))
                  ) : pos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <FileText className="size-10 opacity-20" />
                          <p className="text-sm">No purchase orders found.</p>
                          <Button variant="link" onClick={() => setShowNewPODialog(true)}>Create your first PO</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pos.map((po) => (
                      <TableRow key={po.id} className="group border-border/20 hover:bg-primary/5 transition-colors">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm">{po.poNumber}</span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="size-3" /> {format(new Date(po.createdAt), 'dd MMM yyyy')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Building2 className="size-3.5 text-primary/60" />
                            </div>
                            <span className="text-sm font-medium">{po.supplier.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex -space-x-2">
                            {po.items.slice(0, 3).map((pi, idx) => (
                              <div key={idx} className="size-7 rounded-full bg-background border-2 border-card flex items-center justify-center text-[10px] font-bold" title={pi.item.name}>
                                {pi.item.name[0]}
                              </div>
                            ))}
                            {po.items.length > 3 && (
                              <div className="size-7 rounded-full bg-muted/30 border-2 border-card flex items-center justify-center text-[8px] font-bold">
                                +{po.items.length - 3}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 font-bold text-sm">
                            <IndianRupee className="size-3 text-muted-foreground" />
                            {po.totalAmount.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                        <TableCell className="text-right">
                          {po.status === 'SENT' ? (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 rounded-lg border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10 gap-1.5"
                              onClick={() => handleReceivePO(po.id)}
                            >
                              <ArrowDownToLine className="size-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Receive Goods</span>
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="size-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="size-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              size="sm" 
              className="rounded-xl gap-2 shadow-lg shadow-primary/10"
              onClick={() => setShowNewInvoiceDialog(true)}
            >
              <Plus className="size-3.5" /> Record New Invoice
            </Button>
          </div>
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Invoice #</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Linked PO</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Amount</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={5} className="h-12 animate-pulse bg-muted/5" /></TableRow>
                    ))
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-xs italic">
                        No invoices recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow key={inv.id} className="border-border/10 hover:bg-primary/5 transition-colors">
                        <TableCell className="font-mono text-xs font-bold">{inv.invoiceNumber}</TableCell>
                        <TableCell className="text-xs">{inv.purchaseOrder?.poNumber || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold">₹ {inv.amount.toLocaleString()}</span>
                            <span className="text-[10px] text-muted-foreground">Paid: ₹ {(inv.status === 'PAID' ? inv.amount : 0).toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            inv.status === 'PAID'
                              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                              : inv.status === 'CANCELLED'
                              ? 'border-rose-500/40 text-rose-400 bg-rose-500/10'
                              : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                          }>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(inv.createdAt), 'dd MMM yyyy')}
                            </span>
                            {inv.status !== 'PAID' && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 px-2 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10"
                                onClick={() => {
                                  setSelectedInvoice(inv);
                                  setPaymentAmount(inv.amount);
                                  setShowPaymentDialog(true);
                                }}
                              >
                                Pay
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-32 animate-pulse bg-muted/10 border-border/50" />
            ))
          ) : (
            suppliers.map((s) => (
              <Card key={s.id} className="border-border bg-card group hover:border-primary/50 transition-all cursor-default shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Building2 className="size-5" />
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-bold bg-muted/30">{s.category || 'General'}</Badge>
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-lg leading-tight">{s.name}</h4>
                    <p className="text-xs text-muted-foreground">{s.email || 'No email registered'}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/10">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Contact</span>
                      <span className="text-xs font-medium">{s.contact || 'N/A'}</span>
                    </div>
                     <Button variant="ghost" size="icon" className="size-8 group-hover:bg-primary/10 transition-all">
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* --- Dialogs --- */}

      {/* Raise PO Dialog */}
      <Dialog open={showNewPODialog} onOpenChange={setShowNewPODialog}>
        <DialogContent className="sm:max-w-2xl border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="size-5 text-primary" /> New Purchase Order
            </DialogTitle>
            <DialogDescription>Create a formal request for stock replenishment.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Select Supplier</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="bg-background border-border rounded-xl h-11">
                  <SelectValue placeholder="Choose a registered vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider">Order Items</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-[10px] rounded-lg gap-1.5"
                  onClick={() => setPOItems([...poItems, { itemId: '', qty: 1, unitPrice: 0 }])}
                >
                  <Plus className="size-3" /> Add Row
                </Button>
              </div>
              
              <div className="space-y-2">
                {poItems.map((pi, idx) => (
                  <div key={idx} className="flex items-end gap-3 animate-in slide-in-from-left-2 duration-300">
                    <div className="flex-1 space-y-1.5">
                      <Select value={pi.itemId} onValueChange={(v) => {
                        const next = [...poItems];
                        next[idx].itemId = v;
                        setPOItems(next);
                      }}>
                        <SelectTrigger className="bg-background border-border h-10">
                          <SelectValue placeholder="Item..." />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map(i => (
                            <SelectItem key={i.id} value={i.id}>{i.name} ({i.stock} in stock)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20 space-y-1.5">
                      <Input 
                        type="number" 
                        placeholder="Qty" 
                        value={pi.qty} 
                        onChange={(e) => {
                          const next = [...poItems];
                          next[idx].qty = parseInt(e.target.value) || 0;
                          setPOItems(next);
                        }}
                        className="bg-background border-border h-10" 
                      />
                    </div>
                    <div className="w-28 space-y-1.5">
                      <Input 
                        type="number" 
                        placeholder="Price" 
                        value={pi.unitPrice} 
                        onChange={(e) => {
                          const next = [...poItems];
                          next[idx].unitPrice = parseFloat(e.target.value) || 0;
                          setPOItems(next);
                        }}
                        className="bg-background border-border h-10" 
                      />
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="size-10 text-muted-foreground hover:text-destructive"
                      onClick={() => setPOItems(poItems.filter((_, i) => i !== idx))}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {poItems.length > 0 && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex justify-between items-center animate-in fade-in zoom-in duration-300">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Estimated Total</span>
                  <span className="text-lg font-bold text-primary">₹ {poItems.reduce((acc, curr) => acc + (curr.qty * (curr.unitPrice || 0)), 0).toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Internal Notes</Label>
              <Input 
                value={poNotes} 
                onChange={(e) => setPONotes(e.target.value)} 
                placeholder="Shipping instructions, urgent delivery, etc." 
                className="bg-muted/10 border-border/50 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/10">
            <Button variant="ghost" onClick={() => setShowNewPODialog(false)} disabled={savingPO}>Cancel</Button>
            <Button 
              className="rounded-xl px-8 shadow-lg shadow-primary/20 gap-2"
              onClick={handleCreatePO}
              disabled={savingPO || poItems.length === 0}
            >
              {savingPO ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
              Send Purchase Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Dialog */}
      <Dialog open={showNewSupplierDialog} onOpenChange={setShowNewSupplierDialog}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" /> Register New Supplier
            </DialogTitle>
            <DialogDescription>Expand your supply network with a new partner.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Company Name</Label>
              <Input 
                value={newSupplier.name} 
                onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})} 
                className="bg-background border-border rounded-xl h-11"
                placeholder="e.g. Acme Logistics Corp"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Contact Person</Label>
                <Input 
                  value={newSupplier.contact} 
                  onChange={(e) => setNewSupplier({...newSupplier, contact: e.target.value})} 
                  className="bg-background border-border rounded-xl h-11"
                  placeholder="Name/Phone"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Category</Label>
                <Input 
                  value={newSupplier.category} 
                  onChange={(e) => setNewSupplier({...newSupplier, category: e.target.value})} 
                  className="bg-background border-border rounded-xl h-11"
                  placeholder="e.g. Hardware"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Email Address</Label>
              <Input 
                type="email" 
                value={newSupplier.email} 
                onChange={(e) => setNewSupplier({...newSupplier, email: e.target.value})} 
                className="bg-background border-border rounded-xl h-11"
                placeholder="orders@supplier.com"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setShowNewSupplierDialog(false)} disabled={savingSupplier}>Cancel</Button>
            <Button 
              className="rounded-xl px-8 shadow-lg shadow-primary/20"
              onClick={handleCreateSupplier}
              disabled={savingSupplier || !newSupplier.name}
            >
              {savingSupplier ? <Loader2 className="size-4 animate-spin" /> : 'Register Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Invoice Dialog */}
      <Dialog open={showNewInvoiceDialog} onOpenChange={setShowNewInvoiceDialog}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" /> Record Vendor Invoice
            </DialogTitle>
            <DialogDescription>Link a financial invoice to an existing Purchase Order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Invoice Number</Label>
              <Input 
                placeholder="e.g. INV/2024/789" 
                value={invoiceData.invoiceNumber}
                onChange={(e) => setInvoiceData({...invoiceData, invoiceNumber: e.target.value})}
                className="bg-background border-border rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Link to Purchase Order</Label>
              <Select value={invoiceData.purchaseOrderId} onValueChange={(v) => {
                const po = pos.find(p => p.id === v);
                setInvoiceData({
                  ...invoiceData, 
                  purchaseOrderId: v,
                  amount: po ? po.totalAmount : 0
                });
              }}>
                <SelectTrigger className="bg-background border-border rounded-xl h-11">
                  <SelectValue placeholder="Select a PO to bill against" />
                </SelectTrigger>
                <SelectContent>
                  {pos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.poNumber} ({p.supplier.name})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Invoice Amount (₹)</Label>
              <Input 
                type="number"
                value={invoiceData.amount}
                onChange={(e) => setInvoiceData({...invoiceData, amount: parseFloat(e.target.value) || 0})}
                className="bg-background border-border rounded-xl h-11 font-bold"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setShowNewInvoiceDialog(false)} disabled={savingInvoice}>Cancel</Button>
            <Button 
              className="rounded-xl px-8 shadow-lg shadow-primary/20"
              onClick={handleCreateInvoice}
              disabled={savingInvoice || !invoiceData.invoiceNumber || !invoiceData.purchaseOrderId}
            >
              {savingInvoice ? <Loader2 className="size-4 animate-spin" /> : 'Record Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="size-5 text-emerald-500" /> Record Payment
            </DialogTitle>
            <DialogDescription>Add a payment entry for invoice {selectedInvoice?.invoiceNumber}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-xl bg-muted/15 border border-border/30 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-bold">₹ {selectedInvoice?.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Already Paid</span>
                <span className="font-bold text-emerald-500">₹ {(selectedInvoice?.status === 'PAID' ? selectedInvoice?.amount : 0).toLocaleString()}</span>
              </div>
              <Separator className="opacity-20" />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground font-bold">Balance Due</span>
                <span className="font-bold text-rose-500">₹ {(selectedInvoice?.status === 'PAID' ? 0 : selectedInvoice?.amount ?? 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Payment Amount (₹)</Label>
              <Input 
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="bg-background border-border rounded-xl h-11 font-bold text-lg"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setShowPaymentDialog(false)} disabled={updatingPayment}>Cancel</Button>
            <Button 
              className="rounded-xl px-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
              onClick={handleUpdatePayment}
              disabled={updatingPayment || paymentAmount <= 0}
            >
              {updatingPayment ? <Loader2 className="size-4 animate-spin" /> : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
