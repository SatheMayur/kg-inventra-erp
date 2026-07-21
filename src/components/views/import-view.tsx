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
  Database,
  Building2,
  Tags,
  AlertCircle,
  HelpCircle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

// ---- Standard Importer Types ----
interface PreviewRow {
  [key: string]: string | number | null
}

interface ImportResult {
  imported: number
  skipped: number
  errors: { row: number; message: string }[]
}

// ---- Historical Importer Types ----
interface HistoricalPreview {
  fileName: string
  sheets: string[]
  departmentsCount: number
  itemsCount: number
  transactionsCount: number
  totalQuantity: number
  totalAmount: number
}

interface RowError {
  sheet: string;
  row: number;
  message: string;
  type: 'ERROR' | 'WARNING';
}

interface HistoricalValidationResult {
  batchId: string
  status: string
  totalRows: number
  validRows: number
  errorRows: number
  errors: RowError[]
}

interface HistoricalCommitResult {
  batchId: string
  status: string
  summary: {
    departments: { imported: number; skipped: number }
    items: { imported: number; skipped: number }
    transactions: { imported: number; skipped: number }
  }
}

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
  const mapping: Record<string, string> = {}
  for (const h of headers) {
    const canonical = COLUMN_ALIASES[normaliseKey(h)]
    if (canonical) mapping[h] = canonical
  }
  return mapping
}

export default function ImportView() {
  const [activeTab, setActiveTab] = useState<'standard' | 'historical'>('standard')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const histFileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // ---- Standard Importer States ----
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [missingRequired, setMissingRequired] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorsOpen, setErrorsOpen] = useState(false)

  // ---- Historical Importer States ----
  const [histFile, setHistFile] = useState<File | null>(null)
  const [previewingHist, setPreviewingHist] = useState(false)
  const [histPreview, setHistPreview] = useState<HistoricalPreview | null>(null)
  
  const [validatingHist, setValidatingHist] = useState(false)
  const [histValidation, setHistValidation] = useState<HistoricalValidationResult | null>(null)
  
  const [committingHist, setCommittingHist] = useState(false)
  const [histCommit, setHistCommit] = useState<HistoricalCommitResult | null>(null)
  
  const [histErrorsOpen, setHistErrorsOpen] = useState(true)

  // ---- Template Download ----
  function downloadStandardTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'category', 'unit', 'stock', 'minStock', 'price'],
      ['Basmati Rice', 'Grains', 'kg', 100, 10, 85.5],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Items')
    XLSX.writeFile(wb, 'inventra-items-template.xlsx')
  }

  function downloadHistoricalTemplate() {
    // Generate sample worksheets matching seed columns
    const deptWs = XLSX.utils.aoa_to_sheet([
      ['department_name'],
      ['ACCOUNT 6 NW-80-00'],
      ['ADMIN-81-00'],
    ])
    const itemWs = XLSX.utils.aoa_to_sheet([
      ['item_name', 'source_item_name', 'category', 'unit', 'total_consumed_qty', 'total_consumed_amount', 'transaction_count'],
      ['Paper A4 70 Gsm', 'Paper A4 70 Gsm (PKT)', 'Office Stationary', 'PKT', 32, 6985.6, 13],
      ['Ball Pen ( One Tie Use )(Blue)', 'Ball Pen ( One Tie Use )(Blue) (PCS)', 'Office Stationary', 'PCS', 107, 315.65, 14],
    ])
    const transWs = XLSX.utils.aoa_to_sheet([
      ['department', 'category', 'item_name', 'source_item_name', 'unit', 'quantity', 'amount'],
      ['ACCOUNT 6 NW-80-00', 'Office Stationary', 'Paper A4 70 Gsm', 'Paper A4 70 Gsm (PKT)', 'PKT', 12, 2619.6],
      ['ADMIN-81-00', 'Office Stationary', 'Ball Pen ( One Tie Use )(Blue)', 'Ball Pen ( One Tie Use )(Blue) (PCS)', 'PCS', 4, 11.8],
    ])

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, deptWs, 'Department_Master_Seed')
    XLSX.utils.book_append_sheet(wb, itemWs, 'Item_Master_Seed')
    XLSX.utils.book_append_sheet(wb, transWs, 'Issue_Transactions')
    XLSX.writeFile(wb, 'inventra_historical_store_template.xlsx')
  }

  // ---- Standard File Processing ----
  const processStandardFile = useCallback((file: File) => {
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

  function handleStandardFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processStandardFile(file)
    e.target.value = ''
  }

  function handleStandardDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processStandardFile(file)
  }

  function clearStandard() {
    setSelectedFile(null)
    setPreviewRows([])
    setDetectedHeaders([])
    setColumnMapping({})
    setMissingRequired([])
    setResult(null)
    setErrorsOpen(false)
  }

  async function handleStandardImport() {
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

  // ---- Historical File Processing ----
  const processHistoricalFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Only Excel workbook files (.xlsx, .xls) are supported for historical store data')
      return
    }

    setHistFile(file)
    setHistPreview(null)
    setHistValidation(null)
    setHistCommit(null)
    setPreviewingHist(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/import/store/preview', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to parse historical store sheets')
        setHistFile(null)
        return
      }

      setHistPreview(data as HistoricalPreview)
      toast.success('Excel workbook loaded successfully!')
    } catch {
      toast.error('Network error — failed to load workbook preview')
      setHistFile(null)
    } finally {
      setPreviewingHist(false)
    }
  }, [])

  function handleHistFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processHistoricalFile(file)
    e.target.value = ''
  }

  function handleHistDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processHistoricalFile(file)
  }

  function clearHistorical() {
    setHistFile(null)
    setHistPreview(null)
    setHistValidation(null)
    setHistCommit(null)
  }

  async function handleHistoricalValidate() {
    if (!histFile) return
    setValidatingHist(true)
    try {
      const formData = new FormData()
      formData.append('file', histFile)

      const res = await fetch('/api/import/store/validate', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Validation failed')
        return
      }

      setHistValidation(data as HistoricalValidationResult)

      if (data.errorRows > 0) {
        toast.error(`Validation found ${data.errorRows} critical errors. Fix them to proceed with commit.`);
      } else {
        const warningCount = data.errors?.length || 0;
        if (warningCount > 0) {
          toast.warning(`Validation passed with ${warningCount} warnings. You can now commit the import.`);
        } else {
          toast.success('Validation completed successfully with zero warnings!');
        }
      }
    } catch {
      toast.error('Network error — validation failed')
    } finally {
      setValidatingHist(false)
    }
  }

  async function handleHistoricalCommit() {
    if (!histFile || !histValidation) return
    setCommittingHist(true)
    try {
      const formData = new FormData()
      formData.append('file', histFile)
      formData.append('batchId', histValidation.batchId)

      const res = await fetch('/api/import/store/commit', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Commit failed. Transaction rolled back.')
        return
      }

      setHistCommit(data as HistoricalCommitResult)
      toast.success('Historical store data committed successfully!')
    } catch {
      toast.error('Network error — transaction failed and rolled back.')
    } finally {
      setCommittingHist(false)
    }
  }

  function downloadErrorReport() {
    if (!histValidation || histValidation.errors.length === 0) return

    const headers = ['Sheet', 'Row', 'Message', 'Type']
    const csvContent = [
      headers.join(','),
      ...histValidation.errors.map(e => 
        `"${e.sheet}","${e.row}","${e.message.replace(/"/g, '""')}","${e.type}"`
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `historical_import_errors_${histValidation.batchId}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Upload className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Inventory Import Panel</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">Bulk Import</h2>
          <p className="text-muted-foreground">
            Bulk-import inventory master items or seed historical consumption sheets.
          </p>
        </div>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(v) => { 
          setActiveTab(v as 'standard' | 'historical')
          clearStandard()
          clearHistorical()
        }}
        className="w-full space-y-6"
      >
        <TabsList className="grid w-[460px] grid-cols-2 rounded-xl bg-muted/20 p-1 border border-border/40">
          <TabsTrigger value="standard" className="rounded-lg text-xs font-bold uppercase tracking-wider py-2">
            Standard Item Import
          </TabsTrigger>
          <TabsTrigger value="historical" className="rounded-lg text-xs font-bold uppercase tracking-wider py-2">
            Historical Store Importer
          </TabsTrigger>
        </TabsList>

        {/* --- Standard Tab --- */}
        <TabsContent value="standard" className="space-y-6">
          <div className="flex justify-between items-center bg-muted/10 border border-border/40 rounded-xl p-4">
            <div className="space-y-0.5">
              <h4 className="text-sm font-semibold">Standard Template</h4>
              <p className="text-xs text-muted-foreground">Download standard single-sheet format containing name, category, stock, unit, and prices.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-2 hover:bg-muted"
              onClick={downloadStandardTemplate}
            >
              <Download className="size-4" /> Template
            </Button>
          </div>

          {/* Stats after standard import */}
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

          {/* Standard Drag & Drop File */}
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
                  onDrop={handleStandardDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                >
                  <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Upload className="size-7 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm">Drop standard items Excel/CSV file here, or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleStandardFileChange}
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
                    onClick={clearStandard}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column mapping + preview for standard */}
          {selectedFile && previewRows.length > 0 && (
            <div className="space-y-6">
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
                <div className="px-6 pt-5 pb-3">
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

              <div className="flex justify-end">
                <Button
                  className="rounded-xl px-8 shadow-lg shadow-primary/20 gap-2"
                  onClick={handleStandardImport}
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

          {result && result.errors.length > 0 && (
            <Card className="border-rose-500/20 bg-rose-500/5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-6 py-4 text-left font-semibold text-rose-700 text-sm"
                onClick={() => setErrorsOpen((v) => !v)}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  <span>{result.errors.length} row{result.errors.length !== 1 ? 's' : ''} had errors</span>
                </div>
                {errorsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
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
        </TabsContent>

        {/* --- Historical Tab --- */}
        <TabsContent value="historical" className="space-y-6">
          <div className="flex justify-between items-center bg-muted/10 border border-border/40 rounded-xl p-4">
            <div className="space-y-0.5">
              <h4 className="text-sm font-semibold">Three-Sheet Historical Seed Template</h4>
              <p className="text-xs text-muted-foreground">Required sheets: 1. Department_Master_Seed, 2. Item_Master_Seed, 3. Issue_Transactions</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-2 hover:bg-muted"
              onClick={downloadHistoricalTemplate}
            >
              <Download className="size-4" /> Download Seed Template
            </Button>
          </div>

          {/* Historical Commit Success Summary */}
          {histCommit && (
            <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="size-5" />
                  <CardTitle className="text-base font-bold">Historical Data Imported Successfully</CardTitle>
                </div>
                <CardDescription className="text-emerald-600/80">
                  Batch ID: <span className="font-mono font-bold">{histCommit.batchId}</span> &mdash; Status: {histCommit.status}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-card border border-emerald-500/10">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Departments</p>
                    <p className="text-xl font-bold mt-1 text-emerald-700">+{histCommit.summary.departments.imported}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">({histCommit.summary.departments.skipped} skipped)</p>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-emerald-500/10">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Catalog Items</p>
                    <p className="text-xl font-bold mt-1 text-emerald-700">+{histCommit.summary.items.imported}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">({histCommit.summary.items.skipped} skipped/linked)</p>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-emerald-500/10">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Issue Transactions</p>
                    <p className="text-xl font-bold mt-1 text-emerald-700">+{histCommit.summary.transactions.imported}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">({histCommit.summary.transactions.skipped} duplicates skipped)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Historical File Selection */}
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
            <CardContent className="p-6 space-y-4">
              {!histFile ? (
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
                  onDrop={handleHistDrop}
                  onClick={() => histFileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === 'Enter' && histFileInputRef.current?.click()}
                >
                  <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Upload className="size-7 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm">Drop historical workbook (.xlsx, .xls) here, or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Must contain all 3 historical sheets</p>
                  </div>
                  <input
                    ref={histFileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleHistFileChange}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{histFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(histFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  {!committingHist && !validatingHist && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={clearHistorical}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {previewingHist && (
            <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">Reading sheets and loading workbook preview...</span>
            </div>
          )}

          {/* Historical Preview Statistics */}
          {histPreview && !histCommit && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="p-4 bg-muted/5 border-border/60">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="size-4 text-sky-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Departments</span>
                  </div>
                  <p className="text-2xl font-extrabold mt-1.5">{histPreview.departmentsCount}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Found in Sheet 1</p>
                </Card>
                <Card className="p-4 bg-muted/5 border-border/60">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Database className="size-4 text-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Item Master</span>
                  </div>
                  <p className="text-2xl font-extrabold mt-1.5">{histPreview.itemsCount}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Found in Sheet 2</p>
                </Card>
                <Card className="p-4 bg-muted/5 border-border/60">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileSpreadsheet className="size-4 text-purple-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Issues (Rows)</span>
                  </div>
                  <p className="text-2xl font-extrabold mt-1.5">{histPreview.transactionsCount}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Found in Sheet 3</p>
                </Card>
                <Card className="p-4 bg-muted/5 border-border/60">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Tags className="size-4 text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Total Qty</span>
                  </div>
                  <p className="text-2xl font-extrabold mt-1.5">{histPreview.totalQuantity}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Quantity issued</p>
                </Card>
                <Card className="p-4 bg-muted/5 border-border/60">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Database className="size-4 text-rose-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Total Amount</span>
                  </div>
                  <p className="text-xl font-extrabold mt-2">₹{histPreview.totalAmount.toLocaleString('en-IN')}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Total consumption value</p>
                </Card>
              </div>

              {/* Validation Trigger */}
              {!histValidation && (
                <div className="flex justify-end">
                  <Button
                    onClick={handleHistoricalValidate}
                    disabled={validatingHist}
                    className="rounded-xl px-8 shadow-lg shadow-primary/20 gap-2"
                  >
                    {validatingHist ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    {validatingHist ? 'Running Validation...' : 'Validate Historical Data'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Validation Results UI */}
          {histValidation && !histCommit && (
            <div className="space-y-6">
              <Card className={`border-l-4 ${histValidation.errorRows > 0 ? 'border-l-rose-500 border-rose-500/20 bg-rose-500/5' : 'border-l-emerald-500 border-emerald-500/20 bg-emerald-500/5'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        {histValidation.errorRows > 0 ? (
                          <>
                            <AlertCircle className="size-5 text-rose-500" />
                            <span className="text-rose-700">Validation Failed</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="size-5 text-emerald-500" />
                            <span className="text-emerald-700">Validation Passed</span>
                          </>
                        )}
                      </CardTitle>
                      <CardDescription className={histValidation.errorRows > 0 ? 'text-rose-600/80' : 'text-emerald-600/80'}>
                        Batch ID: <span className="font-mono font-bold">{histValidation.batchId}</span> &mdash; Status: {histValidation.status}
                      </CardDescription>
                    </div>
                    {histValidation.errors.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-2 text-xs border-border/60 hover:bg-muted bg-card"
                        onClick={downloadErrorReport}
                      >
                        <Download className="size-3.5" /> Error Report (CSV)
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-xs">
                  <p className="mb-2">
                    Out of <strong>{histValidation.totalRows}</strong> total rows across sheets:
                  </p>
                  <ul className="list-disc list-inside space-y-1 font-medium pl-2">
                    <li className="text-emerald-700">Valid Rows: {histValidation.validRows}</li>
                    <li className={histValidation.errorRows > 0 ? 'text-rose-700 font-bold' : 'text-muted-foreground'}>
                      Critical Errors: {histValidation.errorRows}
                    </li>
                    <li className="text-amber-700">
                      Warnings/Info: {histValidation.errors.filter(e => e.type === 'WARNING').length}
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Validation errors/warnings logs */}
              {histValidation.errors.length > 0 && (
                <Card className="border-border/60 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-6 py-4 text-left font-semibold text-sm"
                    onClick={() => setHistErrorsOpen(v => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-amber-500" />
                      <span>Validation Log ({histValidation.errors.length} entries)</span>
                    </div>
                    {histErrorsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                  
                  {histErrorsOpen && (
                    <div className="overflow-x-auto border-t border-border/45">
                      <Table>
                        <TableHeader className="bg-muted/15">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-[10px] uppercase font-bold tracking-wider w-40">Sheet</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold tracking-wider w-16 text-center">Row</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold tracking-wider w-20 text-center">Severity</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold tracking-wider">Validation Message</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {histValidation.errors.map((err, i) => (
                            <TableRow key={i} className="hover:bg-muted/10 transition-colors">
                              <TableCell className="text-xs font-semibold whitespace-nowrap">{err.sheet}</TableCell>
                              <TableCell className="text-xs text-center font-mono font-bold">{err.row}</TableCell>
                              <TableCell className="text-center">
                                <Badge 
                                  variant="outline"
                                  className={`text-[9px] uppercase font-bold px-1.5 py-0 ${
                                    err.type === 'ERROR' 
                                      ? 'border-rose-500/20 bg-rose-500/5 text-rose-700' 
                                      : 'border-amber-500/20 bg-amber-500/5 text-amber-700'
                                  }`}
                                >
                                  {err.type}
                                </Badge>
                              </TableCell>
                              <TableCell className={`text-xs ${err.type === 'ERROR' ? 'text-rose-700/90 font-medium' : 'text-muted-foreground'}`}>
                                {err.message}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              )}

              {/* Commit action if valid */}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  className="rounded-xl px-6"
                  onClick={clearHistorical}
                  disabled={committingHist}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-xl px-8 shadow-lg shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  onClick={handleHistoricalCommit}
                  disabled={committingHist || histValidation.errorRows > 0}
                >
                  {committingHist ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {committingHist ? 'Importing...' : 'Confirm & Commit Import'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
