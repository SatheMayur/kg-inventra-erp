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

type Status = RequestResponse['status']

function statusBadge(status: Status) {
  const map: Record<Status, string> = {
    Pending: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    Approved: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
    Issued: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    Rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
    Cancelled: 'bg-muted/50 text-muted-foreground border-muted-foreground/20',
  }
  return (
    <Badge variant="outline" className={`text-xs ${map[status]}`}>
      {status}
    </Badge>
  )
}

function RequestTimeline({ status }: { status: Status }) {
  const steps = [
    { label: 'Submitted', done: true },
    { label: 'Approved', done: status === 'Approved' || status === 'Issued' },
    { label: 'Issued', done: status === 'Issued' },
  ]

  const rejected = status === 'Rejected'
  const cancelled = status === 'Cancelled'

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

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="text-base font-bold">
              Request {shortId(request.id)}
            </DialogTitle>
            {statusBadge(request.status)}
          </div>
          <DialogDescription>Detailed view of the asset request</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Employee</p>
            <p className="text-sm font-medium">{request.employee}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Department</p>
            <p className="text-sm font-medium">{request.department}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Item</p>
            <p className="text-sm font-medium">{request.itemName}</p>
          </div>
          {request.note && (
            <div className="col-span-2 space-y-1">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Description / Note</p>
              <p className="text-sm text-foreground/80 bg-muted/15 rounded-lg px-3 py-2 border border-border/30 leading-relaxed">{request.note}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Quantity</p>
            <p className="text-sm font-medium">{request.qty}</p>
          </div>
          {isAdmin && item && (
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

        <div className="py-4">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-4">Request Progress</p>
          <RequestTimeline status={request.status} />
        </div>

        <Separator className="bg-border/30" />

        <DialogFooter className="gap-2 sm:gap-2 pt-2">
          {isAdmin && request.status === 'Pending' && (
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
          
          {isAdmin && request.status === 'Approved' && (
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
                disabled={!!actionLoading || availableStock < request.qty}
                onClick={onIssue}
              >
                <HandHeart className="size-3.5" />
                Proceed to Issue
              </Button>
            </>
          )}

          {!isAdmin && request.status === 'Pending' && (
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
