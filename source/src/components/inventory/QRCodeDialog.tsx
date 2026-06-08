'use client'

import { useRef } from 'react'
import { QrCode, Printer, Download, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ItemResponse } from '@/lib/api'

interface QRCodeDialogProps {
  item: ItemResponse | null
  onClose: () => void
}

export function QRCodeDialog({ item, onClose }: QRCodeDialogProps) {
  const printRef = useRef<HTMLDivElement>(null)

  if (!item) return null

  // Create a payload that could be parsed by a mobile app or scanner
  // Format: storehub:item_id
  const qrData = `storehub:${item.id}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`

  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return

    const windowPrint = window.open('', '', 'width=600,height=600')
    if (windowPrint) {
      windowPrint.document.write(`
        <html>
          <head>
            <title>Print Label - ${item.name}</title>
            <style>
              body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .label { border: 2px solid #000; padding: 20px; border-radius: 10px; text-align: center; width: 300px; }
              .qr { width: 250px; height: 250px; }
              .name { font-size: 20px; font-weight: bold; margin-top: 10px; }
              .id { font-size: 12px; color: #666; font-family: monospace; }
              .category { font-size: 14px; margin-top: 5px; color: #333; }
            </style>
          </head>
          <body>
            <div class="label">
              <img src="${qrUrl}" class="qr" />
              <div class="name">${item.name}</div>
              <div class="category">${item.category}</div>
              <div class="id">${item.id}</div>
            </div>
            <script>
              setTimeout(() => {
                window.print();
                window.close();
              }, 500);
            </script>
          </body>
        </html>
      `)
      windowPrint.document.close()
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-4 text-primary" /> Item Label
          </DialogTitle>
          <DialogDescription>
            Scan or print this QR code for physical inventory tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 gap-4">
          <div 
            ref={printRef}
            className="p-4 bg-white rounded-xl shadow-inner border border-border/50"
          >
            <img 
              src={qrUrl} 
              alt={`QR Code for ${item.name}`} 
              className="size-48"
            />
          </div>
          
          <div className="text-center space-y-1">
            <h3 className="font-bold text-lg">{item.name}</h3>
            <p className="text-xs text-muted-foreground font-mono bg-muted/20 px-2 py-1 rounded">
              ID: {item.id}
            </p>
          </div>
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="size-3.5" /> Print Label
          </Button>
          <Button 
            className="gap-2"
            onClick={() => {
              const link = document.createElement('a')
              link.href = qrUrl
              link.download = `qr-${item.name}.png`
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
            }}
          >
            <Download className="size-3.5" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
