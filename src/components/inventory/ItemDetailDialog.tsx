'use client'

import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Loader2, Package } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { api, ItemResponse, TransactionResponse } from '@/lib/api'
import type { ItemImageRecord } from './ItemImagesDialog'

interface Props {
  item: ItemResponse | null
  onOpenChange: (open: boolean) => void
}

/**
 * One-click item overview: big photo + gallery strip, stock facts,
 * and recent stock movements — no hunting through menus.
 */
export function ItemDetailDialog({ item, onOpenChange }: Props) {
  const [images, setImages] = useState<ItemImageRecord[]>([])
  const [bigImage, setBigImage] = useState<string | null>(null)
  const [moves, setMoves] = useState<TransactionResponse[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!item) return
    setLoading(true)
    setBigImage(null)
    Promise.all([
      fetch(`/api/items/${item.id}/images`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { images: [] }))
        .then((d: { images: ItemImageRecord[] }) => {
          setImages(d.images)
          setBigImage(d.images[0]?.imagePath ?? null)
        }),
      api.transactions.list().then((all) => {
        setMoves(all.filter((t) => t.itemId === item.id).slice(0, 8))
      }),
    ])
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [item])

  if (!item) return null
  const available = item.stock - item.reservedQty

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5 text-primary" /> {item.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Photo side */}
            <div className="space-y-2">
              {bigImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bigImage} alt={item.name} className="w-full aspect-square object-cover rounded-xl border border-border" />
              ) : (
                <div className="w-full aspect-square rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground text-xs">
                  No photo — use ⋯ → Photos to add
                </div>
              )}
              {images.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto">
                  {images.map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={img.id}
                      src={img.thumbnailPath}
                      alt=""
                      loading="lazy"
                      className={`size-12 rounded-md object-cover cursor-pointer border ${bigImage === img.imagePath ? 'border-primary' : 'border-border'}`}
                      onClick={() => setBigImage(img.imagePath)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Facts + movements */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-border p-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Category</p>
                  <p className="font-medium">{item.category}</p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Stock</p>
                  <p className="font-medium tabular-nums">{item.stock} {item.unit}</p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Reserved</p>
                  <p className="font-medium tabular-nums">{item.reservedQty}</p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Available</p>
                  <Badge
                    variant="outline"
                    className={
                      available === 0
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                        : available <= item.minStock
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    }
                  >
                    {available} {item.unit}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1.5">Recent movements</p>
                {moves.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No transactions yet</p>
                ) : (
                  <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                    {moves.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-xs">
                        <span className="flex items-center gap-1.5">
                          {t.type === 'IN' ? (
                            <ArrowDownLeft className="size-3.5 text-emerald-500" />
                          ) : (
                            <ArrowUpRight className="size-3.5 text-rose-500" />
                          )}
                          {t.type === 'IN' ? '+' : '−'}{t.qty} {item.unit}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(t.date).toLocaleDateString()} {t.reference ? `· ${t.reference}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
