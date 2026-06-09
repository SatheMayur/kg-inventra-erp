'use client'

import { useState, useRef, useCallback } from 'react'
import { FileUp, RefreshCw, Upload, X, CheckCircle2, AlertTriangle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface BulkImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportSuccess: () => void
}

interface ParsedRow {
  name: string
  category: string
  unit: string
  stock: number
  minStock: number
  valid: boolean
  error?: string
}

const REQUIRED_HEADERS = ['name', 'category', 'unit', 'stock', 'minstock']
const TEMPLATE_CSV = `name,category,unit,stock,minStock
Standard Laptop,Hardware,pcs,50,5
HDMI Cable 2m,Cables,pcs,100,10
Office Chair,Furniture,pcs,20,3
A4 Paper Ream,Stationery,ream,200,20`

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())

  // Validate required headers exist
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
  if (missingHeaders.length > 0) {
    throw new Error(`Missing columns: ${missingHeaders.join(', ')}`)
  }

  const idx = {
    name: headers.indexOf('name'),
    category: headers.indexOf('category'),
    unit: headers.indexOf('unit'),
    stock: headers.indexOf('stock'),
    minStock: headers.indexOf('minstock'),
  }

  return lines.slice(1).map((line, i) => {
    // Handle quoted fields
    const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) ?? line.split(',')
    const get = (index: number) => (cols[index] ?? '').replace(/^"|"$/g, '').trim()

    const name = get(idx.name)
    const category = get(idx.category)
    const unit = get(idx.unit)
    const stock = parseInt(get(idx.stock), 10)
    const minStock = parseInt(get(idx.minStock), 10)

    const errors: string[] = []
    if (!name) errors.push('name required')
    if (!category) errors.push('category required')
    if (!unit) errors.push('unit required')
    if (isNaN(stock) || stock < 0) errors.push('stock must be ≥ 0')
    if (isNaN(minStock) || minStock < 0) errors.push('minStock must be ≥ 0')

    return {
      name,
      category,
      unit,
      stock: isNaN(stock) ? 0 : stock,
      minStock: isNaN(minStock) ? 0 : minStock,
      valid: errors.length === 0,
      error: errors.join(', ') || undefined,
    }
  })
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'inventra-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function BulkImportDialog({ open, onOpenChange, onImportSuccess }: BulkImportDialogProps) {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validRows = rows.filter((r) => r.valid)
  const invalidRows = rows.filter((r) => !r.valid)

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a .csv file')
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          toast.error('No data rows found in the CSV')
          return
        }
        setRows(parsed)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to parse CSV')
        setRows([])
        setFileName('')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleImport = async () => {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const result = await api.items.bulkImport(
        validRows.map(({ name, category, unit, stock, minStock }) => ({
          name, category, unit, stock, minStock,
        }))
      )
      toast.success(`${result.count} item${result.count !== 1 ? 's' : ''} imported successfully`)
      handleClose()
      onImportSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setRows([])
    setFileName('')
    onOpenChange(false)
  }


  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl bg-card/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="size-5 text-primary" />
            Bulk Import Items
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to import multiple items at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Drop zone — shown when no file loaded */}
          {rows.length === 0 && (
            <div
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer
                ${dragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border/50 bg-muted/10 hover:border-primary/50 hover:bg-muted/20'
                }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                <Upload className="size-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">Drop your CSV here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Required columns: <span className="font-mono text-primary/80">name, category, unit, stock, minStock</span>
                </p>
              </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-border/50"
                    onClick={(e) => { e.stopPropagation(); downloadTemplate() }}
                  >
                    <Download className="size-3.5" />
                    Download Template
                  </Button>
                </div>
            </div>
          )}

          {/* Preview table — shown after file is parsed */}
          {rows.length > 0 && (
            <div className="space-y-3">
              {/* File info + stats */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileUp className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{fileName}</span>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]">
                    <CheckCircle2 className="size-3 mr-1" />
                    {validRows.length} valid
                  </Badge>
                  {invalidRows.length > 0 && (
                    <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/10 text-[10px]">
                      <AlertTriangle className="size-3 mr-1" />
                      {invalidRows.length} invalid
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => { setRows([]); setFileName('') }}
                >
                  <X className="size-3.5" />
                  Clear
                </Button>
              </div>

              {/* Preview table */}
              <ScrollArea className="h-64 rounded-lg border border-border/50">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur-sm z-10">
                    <TableRow className="hover:bg-transparent border-border/30">
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground/70 h-8">Name</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground/70 h-8">Category</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground/70 h-8">Unit</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground/70 h-8 text-right">Stock</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground/70 h-8 text-right">Min</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-muted-foreground/70 h-8">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow
                        key={i}
                        className={`border-border/20 text-xs ${!row.valid ? 'bg-rose-500/5' : ''}`}
                      >
                        <TableCell className="py-1.5 font-medium">{row.name || <span className="text-muted-foreground/40 italic">empty</span>}</TableCell>
                        <TableCell className="py-1.5 text-muted-foreground">{row.category || '—'}</TableCell>
                        <TableCell className="py-1.5 text-muted-foreground">{row.unit || '—'}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono">{row.stock}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono">{row.minStock}</TableCell>
                        <TableCell className="py-1.5">
                          {row.valid ? (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] px-1.5">
                              OK
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-rose-400">{row.error}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {invalidRows.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Invalid rows will be skipped. Only the {validRows.length} valid row{validRows.length !== 1 ? 's' : ''} will be imported.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          {rows.length === 0 ? (
            <Button onClick={() => inputRef.current?.click()} className="gap-2 shadow-lg shadow-primary/20">
              <Upload className="size-4" />
              Choose File
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="gap-2 shadow-lg shadow-primary/20"
            >
              {importing
                ? <RefreshCw className="size-4 animate-spin" />
                : <FileUp className="size-4" />
              }
              Import {validRows.length} Item{validRows.length !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
