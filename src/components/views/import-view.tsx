'use client'

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ---- Types ----

interface PreviewRow {
  [key: string]: string | number | null
}

interface ImportResult {
  imported: number
  skipped: number
  errors: { row: number; message: string }[]
}

// ---- Expected columns ----

const EXPECTED_COLUMNS = ['name', 'category', 'unit', 'stock', 'minStock', 'price']
const REQUIRED_COLUMNS = ['name']

function normaliseKey(k: string): string {
  return String(k).toLowerCase().replace(/[\s_-]+/g, '')
}

const COLUMN_ALIASES: Record<string, string> = {
  name: 'name',
  itemname: 'name',
  category: 'category',
  unit: 'unit',
  stock: 'stock',
  qty: 'stock',
  quantity: 'stock',
  minstock: 'minStock',
  minimumstock: 'minStock',
  reorderpoint: 'minStock',
  price: 'price',
  rate: 'price',
  unitprice: 'price',
}

function detectColumns(headers: string[]): Record<string, string> {
  // Returns { detectedHeader: canonicalName }
  const mapping: Record<string, string> = {}
  for (const h of headers) {
    const canonical = COLUMN_ALIASES[normaliseKey(h)]
    if (canonical) mapping[h] = canonical
  }
  return mapping
}

// ---- Template download ----

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'category', 'unit', 'stock', 'minStock', 'price'],
    ['Basmati Rice', 'Grains', 'kg', 100, 10, 85.5],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Items')
  XLSX.writeFile(wb, 'inventra-items-template.xlsx')
}

// ---- Component ----

export default function ImportView() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [missingRequired, setMissingRequired] = useState<string[]>([])

  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorsOpen, setErrorsOpen] = useState(false)

  // ---- File parsing (client-side preview) ----

  const processFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Only .xlsx, .xls, or .csv files are supported')
      return
    }

    setSelectedFile(file)
    setResult(null)
    setErrorsOpen(false)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const wb = XLSX.read(data, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as PreviewRow[]

        if (rows.length === 0) {
          toast.error('The file appears to be empty')
          setSelectedFile(null)
          return
        }

        const headers = Object.keys(rows[0])
        const mapping = detectColumns(headers)
        const detectedCanonicals = Object.values(mapping)
        const missing = REQUIRED_COLUMNS.filter((r) => !detectedCanonicals.includes(r))

        setDetectedHeaders(headers)
        setColumnMapping(mapping)
        setMissingRequired(missing)
        setPreviewRows(rows.slice(0, 10))
      } catch {
        toast.error('Failed to parse file — ensure it is a valid Excel or CSV file')
        setSelectedFile(null)
      }
    }
    reader.readAsBinaryString(file)
  }, [])

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function clearFile() {
    setSelectedFile(null)
    setPreviewRows([])
    setDetectedHeaders([])
    setColumnMapping({})
    setMissingRequired([])
    setResult(null)
    setErrorsOpen(false)
  }

  // ---- Import ----

  async function handleImport() {
    if (!selectedFile) return
    if (missingRequired.length > 0) {
      toast.error(`Missing required column(s): ${missingRequired.join(', ')}`)
      return
    }

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/items/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Import failed')
        return
      }

      setResult(data as ImportResult)

      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} item${data.imported !== 1 ? 's' : ''}`)
      } else if (data.skipped > 0 && data.imported === 0) {
        toast.warning('All rows were skipped — items may already exist')
      }

      if (data.errors?.length > 0) {
        toast.error(`${data.errors.length} row${data.errors.length !== 1 ? 's' : ''} had errors`)
        setErrorsOpen(true)
      }
    } catch {
      toast.error('Network error — import failed')
    } finally {
      setImporting(false)
    }
  }

  // ---- Render ----

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Upload className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Inventory Import</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">Import Items</h2>
          <p className="text-muted-foreground">
            Bulk-import inventory items from an Excel or CSV file.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-xl gap-2"
          onClick={downloadTemplate}
        >
          <Download className="size-4" /> Download Template
        </Button>
      </div>

      {/* Stats (only after import) */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Imported</p>
                <p className="text-2xl font-bold">{result.imported}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <FileSpreadsheet className="size-5 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Skipped</p>
                <p className="text-2xl font-bold">{result.skipped}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="size-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
                <AlertTriangle className="size-5 text-rose-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Errors</p>
                <p className="text-2xl font-bold">{result.errors.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload area */}
      <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <CardContent className="p-6 space-y-4">
          {!selectedFile ? (
            <div
              role="button"
              tabIndex={0}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors select-none
                ${dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/20'
                }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload className="size-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Drop your file here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{selectedFile.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB &mdash; {previewRows.length} rows previewed
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                onClick={clearFile}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column mapping + preview */}
      {selectedFile && previewRows.length > 0 && (
        <div className="space-y-6">
          {/* Column mapping */}
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Column Mapping</p>
                <div className="flex flex-wrap gap-2">
                  {EXPECTED_COLUMNS.map((col) => {
                    const detectedAs = Object.entries(columnMapping).find(([, v]) => v === col)?.[0]
                    const isRequired = REQUIRED_COLUMNS.includes(col)
                    const found = !!detectedAs
                    return (
                      <div
                        key={col}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs
                          ${found
                            ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700'
                            : isRequired
                              ? 'border-rose-500/20 bg-rose-500/5 text-rose-700'
                              : 'border-border bg-muted/10 text-muted-foreground'
                          }`}
                      >
                        {found ? (
                          <CheckCircle2 className="size-3 shrink-0" />
                        ) : (
                          <AlertTriangle className="size-3 shrink-0" />
                        )}
                        <span className="font-mono font-semibold">{col}</span>
                        {found && detectedAs !== col && (
                          <span className="opacity-60">(from &quot;{detectedAs}&quot;)</span>
                        )}
                        {!found && isRequired && (
                          <span className="opacity-80 font-bold">— missing!</span>
                        )}
                        {!found && !isRequired && (
                          <span className="opacity-60">— optional</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {missingRequired.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-rose-700 text-xs">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    Required column{missingRequired.length > 1 ? 's' : ''}{' '}
                    <strong>{missingRequired.join(', ')}</strong> not found.
                    Please check your file headers or use the template.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview table */}
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Preview — first {previewRows.length} rows
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    {detectedHeaders.map((h) => (
                      <TableHead key={h} className="text-[10px] uppercase font-bold tracking-wider whitespace-nowrap">
                        <span>{h}</span>
                        {columnMapping[h] && columnMapping[h] !== h && (
                          <Badge
                            variant="outline"
                            className="ml-1.5 text-[9px] px-1 py-0 border-primary/20 text-primary/70"
                          >
                            {columnMapping[h]}
                          </Badge>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i} className="border-border/20 hover:bg-primary/5 transition-colors">
                      {detectedHeaders.map((h) => (
                        <TableCell key={h} className="text-xs max-w-[160px] truncate">
                          {row[h] === '' || row[h] === null ? (
                            <span className="text-muted-foreground/40 italic">—</span>
                          ) : (
                            String(row[h])
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Import button */}
          <div className="flex justify-end">
            <Button
              className="rounded-xl px-8 shadow-lg shadow-primary/20 gap-2"
              onClick={handleImport}
              disabled={importing || missingRequired.length > 0}
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {importing ? 'Importing…' : 'Import Items'}
            </Button>
          </div>
        </div>
      )}

      {/* Error details (collapsible) */}
      {result && result.errors.length > 0 && (
        <Card className="border-rose-500/20 bg-rose-500/5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-6 py-4 text-left"
            onClick={() => setErrorsOpen((v) => !v)}
          >
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="size-4" />
              <span className="text-sm font-semibold">
                {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} had errors
              </span>
            </div>
            {errorsOpen ? (
              <ChevronUp className="size-4 text-rose-600" />
            ) : (
              <ChevronDown className="size-4 text-rose-600" />
            )}
          </button>

          {errorsOpen && (
            <div className="overflow-x-auto border-t border-rose-500/20">
              <Table>
                <TableHeader className="bg-rose-500/10">
                  <TableRow className="hover:bg-transparent border-rose-500/10">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider w-20 text-rose-700">Row</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider text-rose-700">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.errors.map((err, i) => (
                    <TableRow key={i} className="border-rose-500/10 hover:bg-rose-500/5 transition-colors">
                      <TableCell className="font-mono text-xs font-bold text-rose-700">{err.row}</TableCell>
                      <TableCell className="text-xs text-rose-700">{err.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
