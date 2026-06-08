'use client'

import { useEffect, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { Loader2, Printer, QrCode } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface LabelData {
  item: {
    id: string
    name: string
    category: string
    unit: string
    stock: number
  }
  qrSvg: string
}

interface Props {
  itemId: string
  itemName: string
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function LabelPrintDialog({ itemId, itemName, open, onOpenChange }: Props) {
  const [data, setData] = useState<LabelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch label data when dialog opens
  useEffect(() => {
    if (!open) return
    setData(null)
    setError('')
    setLoading(true)

    fetch(`/api/items/${itemId}/label`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load label data')
        return res.json()
      })
      .then((json: LabelData) => setData(json))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Error loading label'))
      .finally(() => setLoading(false))
  }, [open, itemId])

  // Render barcode after data loads
  useEffect(() => {
    if (!data) return
    try {
      JsBarcode('#barcode-svg', data.item.id, {
        format: 'CODE128',
        displayValue: false,
        height: 40,
        margin: 4,
      })
    } catch {
      // barcode element not mounted yet — harmless
    }
  }, [data])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" /> Print Label
          </DialogTitle>
        </DialogHeader>

        {/* Print styles — scoped via class */}
        <style>{`
          @media print {
            body > * { display: none !important; }
            .label-print-area { display: block !important; }
            .label-print-area * { display: revert !important; }
          }
        `}</style>

        {loading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive text-center py-6">{error}</p>
        )}

        {data && (
          <>
            {/* Label preview — this div is targeted by @media print */}
            <div
              className="label-print-area border border-border rounded-xl p-4 space-y-3 bg-white text-black"
              style={{ fontFamily: 'sans-serif' }}
            >
              {/* Item name */}
              <p className="text-base font-bold leading-tight">{data.item.name}</p>

              {/* Category + Unit */}
              <p className="text-xs text-gray-500">
                {data.item.category} &middot; {data.item.unit}
              </p>

              {/* QR code */}
              <div
                className="flex justify-center"
                dangerouslySetInnerHTML={{ __html: data.qrSvg }}
              />

              {/* Barcode (CODE128 of itemId) */}
              <div className="flex justify-center">
                <svg id="barcode-svg" />
              </div>

              {/* Item ID */}
              <p className="text-center font-mono text-[10px] text-gray-400 break-all">
                {data.item.id}
              </p>

              {/* Stock */}
              <p className="text-center text-xs font-semibold">
                Stock: {data.item.stock} {data.item.unit}
              </p>
            </div>

            <Button
              className="w-full rounded-xl gap-2 shadow-lg shadow-primary/20"
              onClick={() => window.print()}
            >
              <Printer className="size-4" /> Print Label
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
