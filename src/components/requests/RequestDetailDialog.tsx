'use client'

import { 
  Check, 
  X, 
  Ban, 
  Package, 
  AlertTriangle, 
  Loader2, 
  HandHeart 
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { RequestResponse, ItemResponse } from '@/lib/api'
import { FulfillmentBadge, reservedNow } from './fulfillment-badge'

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

interface RequestDetailDialogProps {
  request: RequestResponse | null
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  availableStock: number
  item: ItemResponse | undefined
  actionLoading: string | null
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onCancel: (id: string) => void
  onIssue: () => void
}

type Status = string

function statusBadge(status: Status) {
  const normalized = status.toUpperCase()
  const map: Record<string, string> = {
    PENDING:         'bg-amber-500/15 text-amber-400 border-amber-500/20',
    APPROVED:        'bg-sky-500/15 text-sky-400 border-sky-500/20',
    PARTIALLYISSUED: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    READYFORPICKUP:  'bg-violet-500/15 text-violet-400 border-violet-500/20',
    ISSUED:          'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    REJECTED:        'bg-rose-500/15 text-rose-400 border-rose-500/20',
    CANCELLED:       'bg-muted/50 text-muted-foreground border-muted-foreground/20',
    DRAFT:           'bg-slate-500/15 text-slate-400 border-slate-500/20',
    SUBMITTED:       'bg-blue-500/15 text-blue-400 border-blue-500/20',
    UNDER_REVIEW:    'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    CONVERTED_TO_PO: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
    CLOSED:          'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  }
  const badgeClass = map[normalized] || 'bg-muted/50 text-muted-foreground border-muted-foreground/20'
  return (
    <Badge variant="outline" className={`text-xs ${badgeClass}`}>
      {status}
    </Badge>
  )
}

function RequestTimeline({ status }: { status: Status }) {
  const norm = status.toUpperCase()
  const steps = [
    { label: 'Submitted', done: norm !== 'DRAFT' },
    { label: 'Approved', done: ['APPROVED', 'CONVERTED_TO_PO', 'CLOSED', 'ISSUED', 'PARTIALLYISSUED', 'READYFORPICKUP'].includes(norm) },
    { label: 'Issued / PO Link', done: ['CONVERTED_TO_PO', 'CLOSED', 'ISSUED', 'PARTIALLYISSUED'].includes(norm) },
    { label: 'Closed', done: ['CLOSED', 'ISSUED'].includes(norm) },
  ]

  const rejected = norm === 'REJECTED'
  const cancelled = norm === 'CANCELLED'

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const isRejectedStep = rejected && i === 1
        const isCancelledStep = cancelled && i === 1
        const isActive = step.done && !isRejectedStep && !isCancelledStep
        return (
          <div key={step.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`size-3 rounded-full shrink-0 ${
                  isRejectedStep
                    ? 'bg-rose-500'
                    : isCancelledStep
                      ? 'bg-muted-foreground/40'
                      : isActive
                        ? 'bg-emerald-500'
                        : 'bg-muted-foreground/25'
                }`}
              />
              {i < steps.length - 1 && (
                <div
                  className={`w-px h-8 ${
                    step.done && !isRejectedStep && !isCancelledStep
                      ? 'bg-emerald-500/50'
                      : 'bg-muted-foreground/15'
                  }`}
                />
              )}
            </div>
            <span
              className={`text-sm -mt-0.5 ${
                isRejectedStep
                  ? 'text-rose-400 font-medium'
                  : isCancelledStep
                    ? 'text-muted-foreground line-through'
                    : isActive
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground'
              }`}
            >
              {step.label}
              {isRejectedStep && ' — Rejected'}
              {isCancelledStep && ' — Cancelled'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase()
}

export function RequestDetailDialog({
  request,
  onOpenChange,
  isAdmin,
  availableStock,
  item,
  actionLoading,
  onApprove,
  onReject,
  onCancel,
  onIssue,
}: RequestDetailDialogProps) {
  if (!request) return null

  // Issuability is driven by reserved-and-ready qty (matches the API gate).
  // Legacy single-item requests (no lines) fall back to free stock vs requested qty.
  const reservedTotal =
    request.lines && request.lines.length > 0
      ? request.lines.reduce((sum: number, l: any) => sum + reservedNow(l), 0)
      : null
  const canIssue = reservedTotal !== null ? reservedTotal > 0 : availableStock >= request.qty

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card/95 backdrop-blur-xl border-border/50 max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-base font-bold">
              Request {shortId(request.id)}
            </DialogTitle>
            {statusBadge(request.status)}
          </div>
          <DialogDescription>Detailed view of the asset request</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-2 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4 py-2 text-xs">
            <div className="space-y-1">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Employee</p>
              <p className="text-sm font-medium">{request.employee}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Department</p>
              <p className="text-sm font-medium">{request.department}</p>
            </div>
            {request.concernPerson && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Concern Person</p>
                <p className="text-sm font-medium">{request.concernPerson}</p>
              </div>
            )}
            {request.requiredDate && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Required Date</p>
                <p className="text-sm font-medium">{formatDate(request.requiredDate)}</p>
              </div>
            )}
            {request.machine && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Machine / Cost Center</p>
                <p className="text-sm font-medium">{request.machine}</p>
              </div>
            )}
            {request.purpose && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Purpose</p>
                <p className="text-sm font-medium">{request.purpose}</p>
              </div>
            )}
            {request.note && (
              <div className="col-span-2 space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Description / Note</p>
                <p className="text-sm text-foreground/80 bg-muted/15 rounded-lg px-3 py-2 border border-border/30 leading-relaxed">{request.note}</p>
              </div>
            )}
            {isAdmin && item && (!request.lines || request.lines.length <= 1) && (
              <div className="col-span-2 p-3 rounded-lg bg-muted/15 border border-border/40">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Available Stock</p>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-bold ${availableStock >= request.qty ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <Package className="inline size-3.5 mr-1.5 -mt-0.5" />
                    {availableStock} in stock
                  </p>
                  {availableStock < request.qty && (
                    <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/10 text-[10px]">
                      <AlertTriangle className="size-3 mr-1" />
                      Shortage
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          <Separator className="bg-border/30" />

          {/* Table of Requisition Lines */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Requested Items</p>
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/50 text-left text-muted-foreground bg-muted/10">
                    <th className="p-2 font-bold uppercase tracking-wider text-[9px]">Item</th>
                    <th className="p-2 text-center font-bold uppercase tracking-wider text-[9px]">Requested</th>
                    <th className="p-2 text-center font-bold uppercase tracking-wider text-[9px]">Reserved</th>
                    <th className="p-2 text-center font-bold uppercase tracking-wider text-[9px]">Issued</th>
                    <th className="p-2 text-center font-bold uppercase tracking-wider text-[9px]">Pending Purchase</th>
                    <th className="p-2 text-right font-bold uppercase tracking-wider text-[9px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {request.lines && request.lines.length > 0 ? (
                    request.lines.map((line: any) => {
                      const reserved = reservedNow(line);
                      const shortage = line.pendingPurchaseQty || 0;
                      return (
                        <tr key={line.id} className="hover:bg-muted/10">
                          <td className="p-2 font-medium">{line.itemName}</td>
                          <td className="p-2 text-center font-mono">{line.requestedQty}</td>
                          <td className="p-2 text-center font-mono">{reserved}</td>
                          <td className="p-2 text-center font-mono">{line.issuedQty}</td>
                          <td className={`p-2 text-center font-mono font-bold ${shortage > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                            {shortage}
                          </td>
                          <td className="p-2 text-right font-medium">
                            <FulfillmentBadge status={line.fulfillmentStatus} />
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr className="hover:bg-muted/10">
                      <td className="p-2 font-medium">{request.itemName}</td>
                      <td className="p-2 text-center font-mono">{request.qty}</td>
                      <td className="p-2 text-center font-mono">—</td>
                      <td className="p-2 text-center font-mono">—</td>
                      <td className="p-2 text-center font-mono">—</td>
                      <td className="p-2 text-right font-medium">{request.status}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Separator className="bg-border/30" />

          <div className="py-2">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-4">Request Progress</p>
            <RequestTimeline status={request.status} />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/20 bg-muted/5 flex items-center justify-end gap-2 sm:gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
          {isAdmin && ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(request.status.toUpperCase()) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                disabled={!!actionLoading}
                onClick={() => onReject(request.id)}
              >
                {actionLoading === request.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                Reject
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20"
                disabled={!!actionLoading}
                onClick={() => onApprove(request.id)}
              >
                {actionLoading === request.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Approve
              </Button>
            </>
          )}
          
          {isAdmin && ['APPROVED', 'APPROVED'].includes(request.status.toUpperCase()) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                disabled={!!actionLoading}
                onClick={() => onReject(request.id)}
              >
                {actionLoading === request.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                Reject
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                disabled={!!actionLoading || !canIssue}
                onClick={onIssue}
              >
                <HandHeart className="size-3.5" />
                Proceed to Issue
              </Button>
            </>
          )}

          {!isAdmin && ['PENDING', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW'].includes(request.status.toUpperCase()) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-muted-foreground/30 text-muted-foreground hover:bg-muted/50"
              disabled={!!actionLoading}
              onClick={() => onCancel(request.id)}
            >
              {actionLoading === request.id ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              Cancel Request
            </Button>
          )}
          
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
