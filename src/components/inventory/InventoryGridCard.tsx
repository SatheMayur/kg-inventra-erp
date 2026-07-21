'use client'

import React, { useState } from 'react'
import { MoreHorizontal, Edit, RefreshCw, Trash2, QrCode, Layers, Camera, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ItemResponse } from '@/lib/api'
import { ItemThumb } from './item-thumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface InventoryGridCardProps {
  item: ItemResponse
  isSelected?: boolean
  onSelect?: () => void
  onEdit: () => void
  onRestock: () => void
  onDelete: () => void
  onQrCode: () => void
  onVariants: () => void
  onPhotos: () => void
  isAdmin: boolean
  selectable?: boolean
}

export function InventoryGridCard({
  item,
  isSelected = false,
  onSelect,
  onEdit,
  onRestock,
  onDelete,
  onQrCode,
  onVariants,
  onPhotos,
  isAdmin,
  selectable = false,
}: InventoryGridCardProps) {
  const [hovered, setHovered] = useState(false)
  const [imageError, setImageError] = useState(false)

  const stock = item.stock
  const minStock = item.minStock
  const reserved = item.reservedQty
  const available = stock - reserved

  // Stock health progress math
  let fillPct = 0
  let fillColor = 'bg-emerald-500'
  let fillBgColor = 'bg-emerald-500/10'

  if (available <= 0) {
    fillPct = 0
    fillColor = 'bg-rose-500'
    fillBgColor = 'bg-rose-500/10'
  } else if (minStock > 0) {
    fillPct = Math.min(100, (available / minStock) * 100)
    if (available <= minStock) {
      fillColor = 'bg-amber-500'
      fillBgColor = 'bg-amber-500/10'
    } else {
      fillColor = 'bg-emerald-500'
      fillBgColor = 'bg-emerald-500/10'
    }
  } else {
    fillPct = 100
    fillColor = 'bg-emerald-500'
    fillBgColor = 'bg-emerald-500/10'
  }

  // Velocity calculation (from avgDailyConsumption)
  const velocity = item.avgDailyConsumption ?? 0
  let velText = 'Slow'
  let velIcon = '💤'
  let velBadgeClass = 'border-muted-foreground/20 text-muted-foreground bg-muted-foreground/5 hover:bg-muted-foreground/10'

  if (velocity >= 5) {
    velText = 'Fast'
    velIcon = '🔥'
    velBadgeClass = 'border-rose-500/20 text-rose-700 bg-rose-500/10 hover:bg-rose-500/15'
  } else if (velocity > 0) {
    velText = 'Active'
    velIcon = '⚡'
    velBadgeClass = 'border-amber-500/20 text-amber-700 bg-amber-500/10 hover:bg-amber-500/15'
  }

  // Status badge calculation
  let statusText = 'In Stock'
  let statusIcon = <CheckCircle2 className="size-2.5" />
  let statusBadgeClass = 'border-emerald-500/20 text-emerald-700 bg-emerald-500/10'

  if (item.stock === 0) {
    statusText = 'Out of Stock'
    statusIcon = <AlertTriangle className="size-2.5" />
    statusBadgeClass = 'border-rose-500/20 text-rose-700 bg-rose-500/10'
  } else if (item.stock <= item.minStock) {
    statusText = 'Low Stock'
    statusIcon = <AlertTriangle className="size-2.5" />
    statusBadgeClass = 'border-amber-500/20 text-amber-700 bg-amber-500/10'
  }

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 border bg-card ${
        isSelected
          ? 'border-primary ring-1 ring-primary'
          : hovered
          ? 'border-border-strong shadow-md translate-y-[-2px]'
          : 'border-border shadow-sm'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox Overlay */}
      {selectable && onSelect && (
        <div
          className={`absolute top-3 left-3 z-10 rounded-md p-1.5 flex items-center justify-center border cursor-pointer transition-colors ${
            isSelected ? 'bg-primary border-primary text-white' : 'bg-background/90 border-border text-muted-foreground'
          }`}
          onClick={onSelect}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="size-3.5 cursor-pointer accent-primary border-none outline-none m-0"
          />
        </div>
      )}

      <div className="relative w-full h-[140px] bg-muted/30 flex items-center justify-center border-b border-border/40 overflow-hidden">
        {item.photoUrl && !imageError ? (
          <img
            src={item.photoUrl}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground/30 gap-1.5">
            <span className="text-4xl">📦</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider font-mono">No Image</span>
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="p-4 flex flex-col gap-3">
        {/* Code & Category Row */}
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono font-semibold px-2 py-0.5 rounded bg-muted/60 border border-border/55 text-muted-foreground">
            {item.id.slice(0, 8).toUpperCase()}
          </span>
          <Badge variant="outline" className="border-border text-muted-foreground bg-muted/10 font-medium px-2 py-0.5 text-[10px]">
            {item.category}
          </Badge>
        </div>

        {/* Title */}
        <div className="min-h-[40px]">
          <h4 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug hover:underline cursor-pointer" onClick={onEdit}>
            {item.name}
          </h4>
        </div>

        {/* Stock Health Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-foreground">
              {available} <span className="font-normal text-muted-foreground">{item.unit}</span>
            </span>
            <span className="text-muted-foreground text-[10px]">
              Min: {minStock} {item.unit}
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden border border-border/55">
            <div className={`h-full rounded-full transition-all duration-500 ${fillColor}`} style={{ width: `${fillPct}%` }} />
          </div>
        </div>

        {/* Badges Row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status Badge */}
          <Badge variant="outline" className={`gap-1 font-semibold text-[10px] px-2 py-0.5 whitespace-nowrap ${statusBadgeClass}`}>
            {statusIcon}
            <span>{statusText}</span>
          </Badge>

          {/* Velocity Badge */}
          <Badge variant="outline" className={`gap-1 font-semibold text-[10px] px-2 py-0.5 ${velBadgeClass}`}>
            <span>{velIcon}</span>
            <span>{velText}</span>
          </Badge>

          {/* Reserved Indicator if any */}
          {reserved > 0 && (
            <Badge variant="outline" className="border-blue-500/20 text-blue-700 bg-blue-500/10 text-[10px] px-2 py-0.5">
              🔒 {reserved} reserved
            </Badge>
          )}
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-1">
          <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={onQrCode}>
            <QrCode className="size-3" /> QR Label
          </Button>

          <div className="flex items-center gap-1">
            {isAdmin && (
              <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={onRestock}>
                <RefreshCw className="size-3" /> Restock
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 border-border">
                {isAdmin && (
                  <>
                    <DropdownMenuItem className="gap-2 text-xs" onClick={onEdit}>
                      <Edit className="size-3.5" /> Edit item
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 text-xs" onClick={onRestock}>
                      <RefreshCw className="size-3.5" /> Restock
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem className="gap-2 text-xs" onClick={onQrCode}>
                  <QrCode className="size-3.5 text-primary" /> QR label
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs" onClick={onVariants}>
                  <Layers className="size-3.5 text-violet-500" /> Manage variants
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs" onClick={onPhotos}>
                  <Camera className="size-3.5 text-sky-500" /> Photos
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 text-xs text-rose-600 focus:text-rose-600 focus:bg-rose-500/10" onClick={onDelete}>
                      <Trash2 className="size-3.5" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
