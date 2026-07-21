'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Loader2,
  Trash2,
  ImageOff,
  ClipboardList
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { api, ApiClientError, POResponse, SupplierResponse, ItemResponse, InvoiceResponse, InvoiceIntakeResponse, InvoiceValidationResponse } from '@/lib/api'
import { isSupplierUsableForPo } from '@/lib/supplier-dedupe'
import { PO_STATUS, normalizePoStatus } from '@/lib/po-status'
import ConversationDrivenDailyProcurement from '@/components/procurement/ConversationDrivenDailyProcurement'
import {
  analyzeOcrExtraction,
  formatOcrDocumentTypeLabel,
  loadFileAsCanvas,
  preprocessCanvasForOcr,
  type OcrExtractionAnalysis,
} from '@/lib/ocr-reliability'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { createWorker } from 'tesseract.js'

type PdfJsModule = typeof import('pdfjs-dist/webpack.mjs')
let pdfJsModulePromise: Promise<PdfJsModule> | null = null

const loadPdfJs = () => {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import('pdfjs-dist/webpack.mjs')
  }
  return pdfJsModulePromise
}

type PoCostLine = {
  qty: number
  unitPrice: number
  discount?: number
  taxRate?: number
}

type PoCostOptions = {
  transportationCost?: number
  cgstRate?: number
  sgstRate?: number
  igstRate?: number
  legacyTaxRate?: number
}

function calculatePoCost(lines: PoCostLine[], options: PoCostOptions = {}) {
  const lineSubtotal = lines.reduce((sum, line) => {
    const discount = line.discount ?? 0
    return sum + (line.qty * line.unitPrice * (1 - discount / 100))
  }, 0)
  const lineTaxAmount = lines.reduce((sum, line) => {
    const discount = line.discount ?? 0
    const taxable = line.qty * line.unitPrice * (1 - discount / 100)
    return sum + (taxable * ((line.taxRate ?? 0) / 100))
  }, 0)
  const transportationCost = options.transportationCost ?? 0
  const splitGstRate = (options.cgstRate ?? 0) + (options.sgstRate ?? 0) + (options.igstRate ?? 0)
  const headerGstRate = splitGstRate > 0 ? splitGstRate : (options.legacyTaxRate ?? 0)
  const headerGstAmount = (lineSubtotal + transportationCost) * (headerGstRate / 100)

  return {
    lineSubtotal,
    lineTaxAmount,
    transportationCost,
    headerGstRate,
    headerGstAmount,
    grandTotal: lineSubtotal + lineTaxAmount + transportationCost + headerGstAmount,
  }
}

function formatMoney(amount: number) {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function canonicalPoStatus(status: string) {
  return normalizePoStatus(status) ?? status.trim().toUpperCase()
}

function isPoApprovalActionVisible(status: string) {
  const s = normalizePoStatus(status)
  return s === PO_STATUS.DRAFT || s === PO_STATUS.PENDING_APPROVAL
}

function isPoReceiveActionVisible(status: string) {
  const s = normalizePoStatus(status)
  return s === PO_STATUS.APPROVED || s === PO_STATUS.SENT_TO_SUPPLIER || s === PO_STATUS.PARTIALLY_RECEIVED
}

type ProcurementTab = 'daily' | 'pos' | 'invoices' | 'intakes' | 'suppliers'

type SupplierFormState = {
  name: string
  gstNumber: string
  contactPerson: string
  phone: string
  contact: string
  email: string
  category: string
  paymentTerms: string
  address: string
}

const emptySupplierForm = (): SupplierFormState => ({
  name: '',
  gstNumber: '',
  contactPerson: '',
  phone: '',
  contact: '',
  email: '',
  category: '',
  paymentTerms: '',
  address: '',
})

export default function ProcurementView({
  initialTab = 'pos',
  title = 'Purchase & Supply',
  description = 'Manage vendor relations and formal inventory procurement.',
}: {
  initialTab?: ProcurementTab
  title?: string
  description?: string
}) {
  const [pos, setPos] = useState<POResponse[]>([])
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([])
  const [items, setItems] = useState<ItemResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ProcurementTab>(initialTab)
  const [invoices, setInvoices] = useState<any[]>([])
  const [invoiceIntakes, setInvoiceIntakes] = useState<InvoiceIntakeResponse[]>([])

  // New PO Dialog state
  const [showNewPODialog, setShowNewPODialog] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [poNotes, setPONotes] = useState('')
  const [savingPO, setSavingPO] = useState(false)

  // Requisition conversion states
  const [approvedReqs, setApprovedReqs] = useState<any[]>([])
  const [selectedSrId, setSelectedSrId] = useState('')
  const [poDeliveryDate, setPoDeliveryDate] = useState('')
  const [poPaymentTerms, setPoPaymentTerms] = useState('')
  const [poTransportationCost, setPoTransportationCost] = useState(0)
  const [poCgstRate, setPoCgstRate] = useState(0)
  const [poSgstRate, setPoSgstRate] = useState(0)
  const [poIgstRate, setPoIgstRate] = useState(0)
  const [poItems, setPoItems] = useState<any[]>([])

  // PO Detail Dialog state
  const [showPODetailDialog, setShowPODetailDialog] = useState(false)
  const [selectedPo, setSelectedPo] = useState<POResponse | null>(null)
  const [approvingPoId, setApprovingPoId] = useState<string | null>(null)
  
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
  const [supplierDialogSource, setSupplierDialogSource] = useState<'header' | 'po'>('header')
  const [newSupplier, setNewSupplier] = useState<SupplierFormState>(emptySupplierForm())
  const [savingSupplier, setSavingSupplier] = useState(false)

  // Payment Dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [updatingPayment, setUpdatingPayment] = useState(false)

  // OCR validation state (extracted text is kept in a ref only; not shown in UI)
  const ocrLastExtractedRef = useRef<string | null>(null)
  const [ocrInvoiceNumber, setOcrInvoiceNumber] = useState('')
  const [ocrPurchaseOrderId, setOcrPurchaseOrderId] = useState('')
  const [claimedGrandTotal, setClaimedGrandTotal] = useState('')
  const [ocrValidationResult, setOcrValidationResult] = useState<InvoiceValidationResponse | null>(null)
  const [ocrDocumentAnalysis, setOcrDocumentAnalysis] = useState<OcrExtractionAnalysis | null>(null)
  const [validatingOcr, setValidatingOcr] = useState(false)
  const [processingIntake, setProcessingIntake] = useState(false)
  const [updatingIntakeId, setUpdatingIntakeId] = useState<string | null>(null)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrAutoPost, setOcrAutoPost] = useState(true)
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)
  const [ocrSourceName, setOcrSourceName] = useState('')
  const ocrFileInputRef = useRef<HTMLInputElement>(null)
  const ocrWorkerRef = useRef<ReturnType<typeof createWorker> | null>(null)

  const extractPdfText = async (file: File) => {
    const { getDocument } = await loadPdfJs()
    const pdfData = await file.arrayBuffer()
    const loadingTask = getDocument({
      data: pdfData,
      useWorkerFetch: true,
      isEvalSupported: false,
      disableFontFace: true,
    })

    const pdf = await loadingTask.promise
    const pageTexts: string[] = []
    const pageCount = Math.min(pdf.numPages, 25)

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const textFromPage = textContent.items
        .map((item) => (typeof item === 'object' && item !== null && 'str' in item ? String((item as { str?: unknown }).str ?? '') : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (textFromPage.length >= 30) {
        pageTexts.push(textFromPage)
        continue
      }

      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')

      if (!context) {
        continue
      }

      await page.render({ canvasContext: context, viewport }).promise
      const preprocessedCanvas = preprocessCanvasForOcr(canvas)

      if (!ocrWorkerRef.current) {
        ocrWorkerRef.current = createWorker('eng', 1, {
          logger: (message) => {
            if (message.status === 'recognizing text' && typeof message.progress === 'number') {
              setOcrProgress(Math.max(0, Math.min(100, Math.round(message.progress * 100))))
            }
          },
        }).catch((error) => {
          ocrWorkerRef.current = null
          throw error
        })
      }

      const worker = await ocrWorkerRef.current
      const { data } = await worker.recognize(preprocessedCanvas)
      const ocrPageText = (data.text || '').trim()
      if (ocrPageText) {
        pageTexts.push(ocrPageText)
      }
    }

    await pdf.destroy()
    return pageTexts.join('\n')
  }

  const analyzeOcrDocument = (text: string) => {
    const analysis = analyzeOcrExtraction(text)
    setOcrDocumentAnalysis(analysis)

    if (analysis.warnings.length > 0) {
      toast.warning(analysis.warnings[0])
    }

    return analysis
  }

  const parseStoredOcrAnalysis = (validationJson: string) => {
    try {
      const parsed = JSON.parse(validationJson) as {
        ocrAnalysis?: OcrExtractionAnalysis
      }

      return parsed.ocrAnalysis ?? null
    } catch {
      return null
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [posData, suppliersData, itemsData, invoicesData, intakeData, requestsData] = await Promise.all([
        api.procurement.pos.list(),
        api.procurement.suppliers.list(),
        api.items.list({ pageSize: 1000 }).then(res => res.items),
        api.procurement.invoices.list(),
        api.procurement.invoiceIntakes.list(),
        api.requests.list(),
      ])
      setPos(posData)
      setSuppliers(suppliersData)
      setItems(itemsData)
      setInvoices(invoicesData)
      setInvoiceIntakes(intakeData)
      setApprovedReqs((requestsData || []).filter((r: any) => r.status === 'APPROVED' || r.status === 'Approved'))
    } catch (err) {
      toast.error('Failed to load procurement data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [fetchData])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    const sr = approvedReqs.find(r => r.id === selectedSrId)
    if (sr) {
      const itemsList = sr.lines
        .filter((line: any) => 
          !line.fulfillmentStatus || 
          line.fulfillmentStatus === 'PURCHASE_REQUIRED' || 
          line.fulfillmentStatus === 'PARTIALLY_AVAILABLE'
        )
        .map((line: any) => {
          const shortage = line.pendingPurchaseQty !== undefined 
            ? line.pendingPurchaseQty 
            : Math.max(0, line.requestedQty - (line.availableQtySnapshot || 0));
          const itemObj = items.find((i: any) => i.id === line.itemId);
          const unitPrice = itemObj?.price || 0;
          return {
            itemId: line.itemId,
            itemName: line.itemName,
            requestedQty: line.requestedQty,
            availableQtySnapshot: line.availableQty !== undefined ? line.availableQty : (line.availableQtySnapshot || 0),
            qty: shortage,
            unitPrice,
            unit: line.unit || 'pcs',
            discount: 0,
            taxRate: 0
          }
        }).filter((i: any) => i.qty > 0)
      setPoItems(itemsList)
    } else {
      setPoItems([])
    }
  }, [selectedSrId, approvedReqs, items])

  const updatePoItem = (index: number, field: string, value: any) => {
    setPoItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: value
      };
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (ocrWorkerRef.current) {
        void ocrWorkerRef.current.then((worker) => worker.terminate())
        ocrWorkerRef.current = null
      }
    }
  }, [])

  const resetPOForm = () => {
    setSelectedSupplier('')
    setSupplierSearch('')
    setSelectedSrId('')
    setPoDeliveryDate('')
    setPoPaymentTerms('')
    setPoTransportationCost(0)
    setPoCgstRate(0)
    setPoSgstRate(0)
    setPoIgstRate(0)
    setPONotes('')
    setPoItems([])
  }

  const handleCreatePO = async () => {
    if (!selectedSrId) {
      toast.error('Please select an approved Store Requisition')
      return
    }
    if (!selectedSupplier) {
      toast.error('Please select a supplier')
      return
    }

    setSavingPO(true)
    try {
      await api.procurement.pos.create({
        linkedSrId: selectedSrId,
        supplierId: selectedSupplier,
        notes: poNotes || undefined,
        deliveryDate: poDeliveryDate || undefined,
        paymentTerms: poPaymentTerms || undefined,
        transportationCost: poTransportationCost || 0,
        cgstRate: poCgstRate || 0,
        sgstRate: poSgstRate || 0,
        igstRate: poIgstRate || 0,
        items: poItems,
      })
      toast.success('Purchase order created successfully')
      setShowNewPODialog(false)
      fetchData()
      resetPOForm()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create purchase order')
    } finally {
      setSavingPO(false)
    }
  }

  const handleCreateSupplier = async () => {
    const supplierName = newSupplier.name.trim()
    if (!supplierName) {
      toast.error('Supplier name is required')
      return
    }
    setSavingSupplier(true)
    try {
      const created = await api.procurement.suppliers.create({
        name: supplierName,
        gstNumber: newSupplier.gstNumber || undefined,
        contactPerson: newSupplier.contactPerson || undefined,
        phone: newSupplier.phone || undefined,
        contact: newSupplier.contact || newSupplier.phone || newSupplier.contactPerson || undefined,
        email: newSupplier.email || undefined,
        category: newSupplier.category || undefined,
        paymentTerms: newSupplier.paymentTerms || undefined,
        address: newSupplier.address || undefined,
      })
      setSuppliers((prev) => {
        const next = prev.filter((supplier) => supplier.id !== created.id)
        next.push(created)
        return next.sort((a, b) => a.name.localeCompare(b.name))
      })
      if (supplierDialogSource === 'po') {
        setSelectedSupplier(created.id)
        setSupplierSearch('')
        if (created.paymentTerms) setPoPaymentTerms(created.paymentTerms)
        toast.success('Supplier registered and selected')
      } else {
        toast.success('Supplier added')
      }
      setShowNewSupplierDialog(false)
      setNewSupplier(emptySupplierForm())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add supplier')
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

  const handleApprovePO = async (id: string) => {
    if (approvingPoId) return
    setApprovingPoId(id)
    try {
      const updatedPo = await api.procurement.pos.approve(id)
      setPos((prev) => prev.map((po) => (po.id === updatedPo.id ? updatedPo : po)))
      setSelectedPo((prev) => (prev?.id === updatedPo.id ? updatedPo : prev))
      toast.success(
        canonicalPoStatus(updatedPo.status) === PO_STATUS.APPROVED
          ? 'Purchase order approved'
          : 'Approval recorded. Waiting for the next approver.',
      )
      await fetchData()
      setSelectedPo((prev) => (prev?.id === updatedPo.id ? updatedPo : prev))
    } catch (err) {
      if (err instanceof ApiClientError) {
        console.warn('[PO_APPROVAL_UI_ERROR]', {
          poId: id,
          status: err.status,
          code: err.data?.code,
          message: err.message,
        })
      }
      toast.error(err instanceof Error ? err.message : 'Failed to approve PO')
    } finally {
      setApprovingPoId(null)
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

  const runOcrValidation = async (text: string, totalValue: number, options?: { skipAnalysis?: boolean }) => {
    if (!text.trim()) {
      toast.error('Paste OCR invoice text first')
      return false
    }

    if (!options?.skipAnalysis) {
      analyzeOcrDocument(text)
    }

    setValidatingOcr(true)
    try {
      const result = await api.procurement.invoices.validateOcr({
        rawOcrText: text,
        claimedGrandTotal: totalValue,
      })
      setOcrValidationResult(result)

      if (result.globalInvoiceStatus === 'REJECTED_MATH_ERROR') {
        toast.error('OCR invoice rejected due to math mismatch')
      } else if (result.globalInvoiceStatus === 'WARNING_RETAINED') {
        toast.warning('OCR invoice retained with warnings')
      } else {
        toast.success('OCR invoice validated successfully')
      }
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to validate OCR invoice')
      return false
    } finally {
      setValidatingOcr(false)
    }
  }

  const handleValidateOcrInvoice = async () => {
    const parsedGrandTotal = Number.parseFloat(claimedGrandTotal.replace(/,/g, ''))
    if (!Number.isFinite(parsedGrandTotal)) {
      toast.error('Enter a valid claimed grand total')
      return
    }
    const extracted = ocrLastExtractedRef.current
    if (!extracted) {
      toast.error('Upload an invoice file first')
      return
    }
    await runOcrValidation(extracted, parsedGrandTotal)
  }

  const handleProcessOcrIntake = async () => {
    const parsedGrandTotal = Number.parseFloat(claimedGrandTotal.replace(/,/g, ''))
    const extracted = ocrLastExtractedRef.current
    if (!extracted || !extracted.trim()) {
      toast.error('Upload an invoice file first')
      return
    }
    if (!Number.isFinite(parsedGrandTotal)) {
      toast.error('Enter a valid claimed grand total')
      return
    }

    analyzeOcrDocument(extracted)

    setProcessingIntake(true)
    try {
      const result = await api.procurement.invoiceIntakes.process({
        sourceName: ocrSourceName || undefined,
        invoiceNumber: ocrInvoiceNumber.trim() || undefined,
        purchaseOrderId: ocrPurchaseOrderId || undefined,
        rawOcrText: extracted,
        claimedGrandTotal: parsedGrandTotal,
        autoPost: ocrAutoPost,
      })

      setOcrValidationResult(result.intake.validationResult)

      if (result.invoice) {
        toast.success(`Invoice auto-posted as ${result.invoice.invoiceNumber}`)
        setOcrInvoiceNumber('')
        setOcrPurchaseOrderId('')
      } else if (result.intake.reviewStatus === 'REJECTED') {
        toast.error('Bad math blocked and sent to rejected intake queue')
      } else if (result.intake.reviewStatus === 'NEEDS_REVIEW') {
        toast.warning('Saved to review queue for manual check')
      } else {
        toast.success('Invoice intake saved')
      }

      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process OCR invoice')
    } finally {
      setProcessingIntake(false)
    }
  }

  const handleUpdateIntakeStatus = async (id: string, reviewStatus: 'RESOLVED' | 'REJECTED') => {
    setUpdatingIntakeId(id)
    try {
      await api.procurement.invoiceIntakes.update(id, { reviewStatus })
      toast.success(reviewStatus === 'RESOLVED' ? 'Invoice intake marked resolved' : 'Invoice intake marked rejected')
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update intake status')
    } finally {
      setUpdatingIntakeId(null)
    }
  }

  const handleOcrTextFileUpload = async (file: File | null) => {
    if (!file) return
    const lowerName = file.name.toLowerCase()
    const isTextExport = lowerName.endsWith('.txt') || lowerName.endsWith('.csv')
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
    const isImage = file.type.startsWith('image/')
    let extractedText = ''
    let geminiAnalysis: OcrExtractionAnalysis | null = null

    try {
      setOcrSourceName(file.name)
      setOcrValidationResult(null)

      if (isTextExport) {
        extractedText = await file.text()
        ocrLastExtractedRef.current = extractedText
      } else if (isPdf) {
        setOcrProcessing(true)
        setOcrProgress(0)
        try {
          const geminiResult = await api.procurement.invoices.extractGemini(file)
          extractedText = geminiResult.canonicalText.trim()
          geminiAnalysis = geminiResult.analysis
          if (geminiResult.sourceName) {
            setOcrSourceName(geminiResult.sourceName)
          }
          if (extractedText) {
            ocrLastExtractedRef.current = extractedText
          }
        } catch {
          extractedText = await extractPdfText(file)
          extractedText = extractedText.trim()
          if (!extractedText) {
            toast.warning(`OCR ran on ${file.name}, but no text was detected`)
          } else {
            ocrLastExtractedRef.current = extractedText
          }
        }
      } else if (isImage) {
        setOcrProcessing(true)
        setOcrProgress(0)
        try {
          const geminiResult = await api.procurement.invoices.extractGemini(file)
          extractedText = geminiResult.canonicalText.trim()
          geminiAnalysis = geminiResult.analysis
          if (geminiResult.sourceName) {
            setOcrSourceName(geminiResult.sourceName)
          }
          if (extractedText) {
            ocrLastExtractedRef.current = extractedText
          }
        } catch {
          if (!ocrWorkerRef.current) {
            ocrWorkerRef.current = createWorker('eng', 1, {
              logger: (message) => {
                if (message.status === 'recognizing text' && typeof message.progress === 'number') {
                  setOcrProgress(Math.round(message.progress * 100))
                }
              },
            }).catch((error) => {
              ocrWorkerRef.current = null
              throw error
            })
          }

          const worker = await ocrWorkerRef.current
          const imageCanvas = await loadFileAsCanvas(file, 2)
          const { data } = await worker.recognize(imageCanvas)
          extractedText = (data.text || '').trim()

          if (!extractedText) {
            toast.warning(`OCR ran on ${file.name}, but no text was detected`)
          } else {
            ocrLastExtractedRef.current = extractedText
          }
        }
      } else {
        toast.error('Upload a receipt/invoice image, PDF, or OCR text export (.txt/.csv)')
        return
      }

      const analysis = geminiAnalysis ?? (extractedText.trim() ? analyzeOcrDocument(extractedText) : null)
      if (geminiAnalysis) {
        setOcrDocumentAnalysis(geminiAnalysis)
        if (geminiAnalysis.warnings.length > 0) {
          toast.warning(geminiAnalysis.warnings[0])
        }
      }
      const parsedGrandTotal = Number.parseFloat(claimedGrandTotal.replace(/,/g, ''))

      if (analysis?.documentType === 'unknown') {
        toast.warning('OCR text loaded, but document type is uncertain')
      }

      if (analysis && analysis.documentType !== 'unknown' && Number.isFinite(parsedGrandTotal)) {
        await runOcrValidation(extractedText, parsedGrandTotal, { skipAnalysis: true })
      } else {
        toast.success(`Loaded OCR data from ${file.name}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to process OCR upload')
    } finally {
      setOcrProcessing(false)
      setOcrProgress(null)
      if (ocrFileInputRef.current) ocrFileInputRef.current.value = ''
    }
  }

  const getStatusBadge = (status: string) => {
    const s = canonicalPoStatus(status)
    switch (s) {
      case 'DRAFT':
        return <Badge variant="outline" className="bg-slate-500/10 text-slate-700 border-slate-500/20 gap-1.5"><Clock className="size-3" /> Draft</Badge>
      case 'PENDING_APPROVAL':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20 gap-1.5"><Clock className="size-3" /> Pending Approval</Badge>
      case 'APPROVED':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 gap-1.5"><CheckCircle2 className="size-3" /> Approved</Badge>
      case 'SENT_TO_SUPPLIER':
      case 'SENT':
        return <Badge variant="outline" className="bg-sky-500/10 text-sky-700 border-sky-500/20 gap-1.5"><Truck className="size-3" /> Sent to Supplier</Badge>
      case 'SUPPLIER_CONFIRMED':
        return <Badge variant="outline" className="bg-indigo-500/10 text-indigo-700 border-indigo-500/20 gap-1.5"><CheckCircle2 className="size-3" /> Confirmed</Badge>
      case 'PARTIALLY_RECEIVED':
        return <Badge variant="outline" className="bg-cyan-500/10 text-cyan-700 border-cyan-500/20 gap-1.5"><Clock className="size-3" /> Partially Received</Badge>
      case 'FULLY_RECEIVED':
      case 'RECEIVED':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 gap-1.5"><CheckCircle2 className="size-3" /> Fully Received</Badge>
      case 'INVOICE_PENDING':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-500/20 gap-1.5"><Clock className="size-3" /> Invoice Pending</Badge>
      case 'NEEDS_REVIEW':
        return <Badge variant="outline" className="bg-rose-500/10 text-rose-700 border-rose-500/20 gap-1.5"><AlertCircle className="size-3" /> Needs Review</Badge>
      case 'CLOSED':
        return <Badge variant="outline" className="bg-slate-500/10 text-slate-700 border-slate-500/20 gap-1.5"><CheckCircle2 className="size-3" /> Closed</Badge>
      case 'REJECTED':
        return <Badge variant="outline" className="bg-rose-500/10 text-rose-700 border-rose-500/20 gap-1.5"><AlertCircle className="size-3" /> Rejected</Badge>
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-stone-500/10 text-stone-700 border-stone-500/20 gap-1.5"><AlertCircle className="size-3" /> Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const selectedSr = approvedReqs.find(r => r.id === selectedSrId)
  const computedPoItems = selectedSr ? selectedSr.lines.map((line: any) => {
    const shortfall = line.requestedQty - (line.availableQtySnapshot || 0);
    const itemObj = items.find((i: any) => i.id === line.itemId);
    const unitPrice = itemObj?.price || 0;
    return {
      itemId: line.itemId,
      itemName: line.itemName,
      requestedQty: line.requestedQty,
      availableQtySnapshot: line.availableQtySnapshot || 0,
      qty: shortfall,
      unitPrice,
      unit: line.unit || 'pcs'
    }
  }).filter((i: any) => i.qty > 0) : []

  const selectedSupplierObj = suppliers.find(s => s.id === selectedSupplier)
  const isSupplierValid = selectedSupplierObj ? isSupplierUsableForPo(selectedSupplierObj) : false
  const canSubmitPO = !!selectedSrId && !!selectedSupplier && poItems.length > 0 && isSupplierValid
  const chooseSupplier = (supplierId: string) => {
    setSelectedSupplier(supplierId)
    const supplier = suppliers.find(s => s.id === supplierId)
    if (supplier?.paymentTerms) {
      setPoPaymentTerms(supplier.paymentTerms)
    }
  }
  const supplierQuery = supplierSearch.trim().toLowerCase()
  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!supplierQuery) return true
    return [
      supplier.name,
      supplier.gstNumber,
      supplier.phone,
      supplier.contact,
      supplier.contactPerson,
      supplier.email,
      supplier.category,
    ].some((value) => value?.toLowerCase().includes(supplierQuery))
  })
  const supplierRecommendations = (() => {
    const recommendations = new Map<string, { supplier: SupplierResponse; reasons: Set<string> }>()
    const addRecommendation = (supplierId: string | null | undefined, reason: string) => {
      if (!supplierId) return
      const supplier = suppliers.find((s) => s.id === supplierId)
      if (!supplier || !isSupplierUsableForPo(supplier)) return
      const existing = recommendations.get(supplier.id)
      if (existing) {
        existing.reasons.add(reason)
      } else {
        recommendations.set(supplier.id, { supplier, reasons: new Set([reason]) })
      }
    }

    for (const poItem of poItems) {
      const item = items.find((i) => i.id === poItem.itemId)
      addRecommendation(item?.preferredSupplierId, `Preferred for ${poItem.itemName}`)

      const lastPo = [...pos]
        .filter((po) => !['CANCELLED', 'REJECTED'].includes(po.status.toUpperCase()))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .find((po) => po.items.some((line) => line.itemId === poItem.itemId))
      addRecommendation(lastPo?.supplierId, `Last used for ${poItem.itemName}`)
    }

    return Array.from(recommendations.values()).map((entry) => ({
      supplier: entry.supplier,
      reasons: Array.from(entry.reasons),
    }))
  })()
  const recommendedSupplierIds = new Set(supplierRecommendations.map((entry) => entry.supplier.id))
  const supplierOptions = [...filteredSuppliers].sort((a, b) => {
    const aRank = recommendedSupplierIds.has(a.id) ? 0 : 1
    const bRank = recommendedSupplierIds.has(b.id) ? 0 : 1
    return aRank - bRank || a.name.localeCompare(b.name)
  })
  const poDraftCost = calculatePoCost(poItems, {
    transportationCost: poTransportationCost,
    cgstRate: poCgstRate,
    sgstRate: poSgstRate,
    igstRate: poIgstRate,
  })
  const selectedPoHasExtendedCost = !!selectedPo && (
    (selectedPo.transportationCost ?? 0) > 0 ||
    (selectedPo.cgstRate ?? 0) > 0 ||
    (selectedPo.sgstRate ?? 0) > 0 ||
    (selectedPo.igstRate ?? 0) > 0
  )
  const selectedPoCost = selectedPo ? calculatePoCost(selectedPo.items, {
    transportationCost: selectedPo.transportationCost ?? 0,
    cgstRate: selectedPo.cgstRate ?? 0,
    sgstRate: selectedPo.sgstRate ?? 0,
    igstRate: selectedPo.igstRate ?? 0,
    legacyTaxRate: selectedPoHasExtendedCost ? 0 : selectedPo.tax,
  }) : null
  const selectedPoGrandTotal = selectedPo
    ? (selectedPoHasExtendedCost ? selectedPo.totalAmount : (selectedPoCost?.grandTotal ?? selectedPo.totalAmount))
    : 0

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header section with Stats */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-1">
            <ShoppingCart className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Procurement Ops</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tighter">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
        
        {activeTab !== 'daily' && <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="rounded-xl border-border bg-transparent hover:bg-muted/20 gap-2"
            onClick={() => {
              setSupplierDialogSource('header')
              setNewSupplier(emptySupplierForm())
              setShowNewSupplierDialog(true)
            }}
          >
            <Building2 className="size-4" /> Add Supplier
          </Button>
          <Button 
            className="rounded-xl shadow-lg shadow-primary/20 gap-2"
            onClick={() => setShowNewPODialog(true)}
          >
            <Plus className="size-4" /> Raise Purchase Order
          </Button>
          <Button
            variant="outline"
            className="rounded-xl border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 gap-2"
            onClick={() => {
              setActiveTab('invoices')
              window.setTimeout(() => {
                document.getElementById('ocr-validation-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 50)
            }}
          >
            <FileText className="size-4" /> OCR Validation
          </Button>
        </div>}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="pos" value={activeTab} onValueChange={(value) => setActiveTab(value as ProcurementTab)} className="w-full">
        <TabsList className="bg-muted/20 p-1 rounded-xl border border-border mb-6">
          <TabsTrigger value="daily" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Daily Procurement
          </TabsTrigger>
          <TabsTrigger value="pos" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Purchase Orders
          </TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Invoices
          </TabsTrigger>
          <TabsTrigger value="intakes" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Review Queue
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="rounded-lg px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Suppliers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <ConversationDrivenDailyProcurement
            items={items}
            suppliers={suppliers}
            loadingMasterData={loading}
          />
        </TabsContent>

        <TabsContent value="pos" className="space-y-4">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">PO Number</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">SR Number</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Department</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Supplier</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Amount</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Approval</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Delivery</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={9} className="h-16 animate-pulse bg-muted/10" /></TableRow>
                    ))
                  ) : pos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <FileText className="size-10 opacity-20" />
                          <p className="text-sm">No purchase orders found.</p>
                          <Button variant="link" onClick={() => setShowNewPODialog(true)}>Create your first PO</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pos.map((po) => (
                      <TableRow 
                        key={po.id} 
                        className="group border-border/20 hover:bg-primary/5 cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedPo(po)
                          setShowPODetailDialog(true)
                        }}
                      >
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm">{po.poNumber}</span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="size-3" /> {format(new Date(po.createdAt), 'dd MMM yyyy')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {po.linkedSr ? (
                            <Badge variant="secondary" className="font-mono text-xs font-bold bg-muted/40 text-muted-foreground">
                              {po.linkedSr.requestNumber || `SR-${po.linkedSr.id.slice(-6).toUpperCase()}`}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {po.linkedSr?.department || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Building2 className="size-3.5 text-primary/60" />
                            </div>
                            <span className="text-xs font-semibold">{po.supplier.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 font-bold text-sm">
                            <IndianRupee className="size-3 text-muted-foreground" />
                            {po.totalAmount.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {canonicalPoStatus(po.status) === PO_STATUS.DRAFT ? (
                            <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-700 border-slate-500/20">Draft</Badge>
                          ) : canonicalPoStatus(po.status) === PO_STATUS.PENDING_APPROVAL ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/20">Pending Sign-off</Badge>
                          ) : po.approvedBy ? (
                            <div className="flex flex-col">
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20 w-fit">Approved</Badge>
                              <span className="text-[9px] text-muted-foreground mt-0.5">By admin</span>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Approved</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {po.deliveryDate ? format(new Date(po.deliveryDate), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            {isPoApprovalActionVisible(po.status) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg border-primary/20 text-primary hover:bg-primary/10 gap-1.5"
                                disabled={approvingPoId === po.id}
                                onClick={() => handleApprovePO(po.id)}
                              >
                                {approvingPoId === po.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Approve</span>
                                )}
                              </Button>
                            ) : isPoReceiveActionVisible(po.status) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10 gap-1.5"
                                onClick={() => handleReceivePO(po.id)}
                              >
                                <ArrowDownToLine className="size-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Receive</span>
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="size-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="size-4" />
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
          <Card id="ocr-validation-panel" className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/10">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertCircle className="size-4 text-primary" />
                    OCR Invoice Validation
                  </CardTitle>
                  <CardDescription>
                    Upload an image, PDF, or OCR text export, or paste raw OCR text, enter the claimed grand total, and validate math before recording the invoice.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {ocrDocumentAnalysis ? (
                    <Badge
                      variant="outline"
                      className={
                        ocrDocumentAnalysis.documentType === 'gst_invoice'
                          ? 'border-sky-500/40 text-sky-700 bg-sky-500/10'
                          : ocrDocumentAnalysis.documentType === 'cash_memo'
                          ? 'border-amber-500/40 text-amber-700 bg-amber-500/10'
                          : ocrDocumentAnalysis.documentType === 'estimate_bill'
                          ? 'border-violet-500/40 text-violet-700 bg-violet-500/10'
                          : ocrDocumentAnalysis.documentType === 'handwritten_receipt'
                          ? 'border-orange-500/40 text-orange-700 bg-orange-500/10'
                          : 'border-border text-muted-foreground bg-muted/10'
                      }
                    >
                      {formatOcrDocumentTypeLabel(ocrDocumentAnalysis.documentType)} {Math.round(ocrDocumentAnalysis.confidence * 100)}%
                    </Badge>
                  ) : null}
                  {ocrValidationResult ? (
                    <Badge
                      variant="outline"
                      className={
                        ocrValidationResult.globalInvoiceStatus === 'READY_FOR_STOCK'
                          ? 'border-emerald-500/40 text-emerald-700 bg-emerald-500/10'
                          : ocrValidationResult.globalInvoiceStatus === 'WARNING_RETAINED'
                          ? 'border-amber-500/40 text-amber-700 bg-amber-500/10'
                          : 'border-rose-500/40 text-rose-700 bg-rose-500/10'
                      }
                    >
                      {ocrValidationResult.globalInvoiceStatus}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              <input
                ref={ocrFileInputRef}
                type="file"
                accept=".txt,.csv,.pdf,image/*"
                className="hidden"
                onChange={(e) => handleOcrTextFileUpload(e.target.files?.[0] ?? null)}
              />
              <div className="grid gap-4 lg:grid-cols-[1.6fr_0.6fr_auto]">
                <div className="space-y-2 lg:col-span-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">OCR Text</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-lg text-[10px] gap-1.5"
                      onClick={() => ocrFileInputRef.current?.click()}
                      disabled={ocrProcessing || validatingOcr}
                    >
                      <FileText className="size-3.5" />
                      {ocrProcessing ? `OCR ${ocrProgress ?? 0}%` : 'Upload Image / PDF / OCR Export'}
                    </Button>
                  </div>
                  {ocrSourceName ? (
                    <p className="text-[10px] text-muted-foreground">
                      Loaded from <span className="font-medium">{ocrSourceName}</span>
                    </p>
                  ) : null}
                  <div className="min-h-36 flex items-center justify-center rounded-xl border border-border/10 bg-background p-4 text-xs text-muted-foreground">
                    <div>
                      <div className="font-medium">Upload files to run OCR</div>
                      <div className="text-[11px] mt-1">Raw OCR text is processed on the server and not displayed in the UI.</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Claimed Grand Total</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={claimedGrandTotal}
                    onChange={(e) => setClaimedGrandTotal(e.target.value)}
                    className="bg-background border-border rounded-xl h-11 font-bold"
                    placeholder="0.00"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    System checks line math within 0.02 and grand total within 0.05.
                  </p>
                </div>

                <div className="flex lg:items-end">
                  <Button
                    className="w-full rounded-xl shadow-lg shadow-primary/20 gap-2"
                    onClick={handleValidateOcrInvoice}
                    disabled={validatingOcr}
                  >
                    {validatingOcr ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    Validate OCR
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.9fr_1fr_0.7fr_auto]">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Invoice Number</Label>
                  <Input
                    value={ocrInvoiceNumber}
                    onChange={(e) => setOcrInvoiceNumber(e.target.value)}
                    className="bg-background border-border rounded-xl h-11 font-mono"
                    placeholder="INV/2024/789"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Purchase Order</Label>
                  <Select value={ocrPurchaseOrderId} onValueChange={(value) => setOcrPurchaseOrderId(value === '__NONE__' ? '' : value)}>
                    <SelectTrigger className="bg-background border-border rounded-xl h-11">
                      <SelectValue placeholder="Optional: select PO to auto-post" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">No PO selected</SelectItem>
                      {pos.map((po) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.poNumber} ({po.supplier.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Posting Mode</Label>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-between rounded-xl border-border bg-background"
                    onClick={() => setOcrAutoPost((value) => !value)}
                  >
                    <span className="text-xs font-medium">{ocrAutoPost ? 'Auto-post clean invoices' : 'Save to review queue'}</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {ocrAutoPost ? 'ON' : 'OFF'}
                    </span>
                  </Button>
                </div>

                <div className="flex lg:items-end">
                  <Button
                    className="w-full rounded-xl shadow-lg shadow-primary/20 gap-2"
                    onClick={handleProcessOcrIntake}
                    disabled={processingIntake || validatingOcr || ocrProcessing}
                  >
                    {processingIntake ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    Process & Save
                  </Button>
                </div>
              </div>

              {ocrValidationResult ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                      <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Calculated Subtotal</div>
                      <div className="mt-1 text-lg font-bold">₹ {ocrValidationResult.calculatedSubtotal.toLocaleString()}</div>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                      <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Line Items</div>
                      <div className="mt-1 text-lg font-bold">{ocrValidationResult.lineItems.length}</div>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                      <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Mismatch Count</div>
                      <div className="mt-1 text-lg font-bold">{ocrValidationResult.mismatchLog.length}</div>
                    </div>
                  </div>

                  {ocrValidationResult.mismatchLog.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Mismatch Log</Label>
                      <div className="space-y-2">
                        {ocrValidationResult.mismatchLog.map((entry, idx) => (
                          <div key={idx} className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-700">
                            {entry}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-xl border border-border/40">
                    <Table>
                      <TableHeader className="bg-muted/20">
                        <TableRow className="hover:bg-transparent border-border/50">
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Description</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Category</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Qty</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Stock Qty</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Unit</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Unit Price</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Line Total</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ocrValidationResult.lineItems.map((item, idx) => (
                          <TableRow key={idx} className="border-border/10">
                            <TableCell className="max-w-[280px] truncate text-xs">{item.rawDescription}</TableCell>
                            <TableCell className="text-xs">{item.category}</TableCell>
                            <TableCell className="text-xs">{item.originalQty.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">{item.normalizedStockQty.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">{item.inventoryUnit}</TableCell>
                            <TableCell className="text-xs">₹ {item.verifiedUnitPrice.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">₹ {item.calculatedLineTotal.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">
                              <Badge
                                variant="outline"
                                className={
                                  item.lineStatus === 'VALID'
                                    ? 'border-emerald-500/40 text-emerald-700 bg-emerald-500/10'
                                    : item.lineStatus === 'WARNING'
                                    ? 'border-amber-500/40 text-amber-700 bg-amber-500/10'
                                    : 'border-rose-500/40 text-rose-700 bg-rose-500/10'
                                }
                              >
                                {item.lineStatus}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-4 text-xs text-muted-foreground">
                  OCR results will appear here after validation.
                </div>
              )}
            </CardContent>
          </Card>
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

        <TabsContent value="intakes" className="space-y-4">
          <Card className="border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/10">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="size-4 text-primary" />
                Invoice Intake Review Queue
              </CardTitle>
              <CardDescription>
                Clean invoices auto-post here. Warning and rejected documents stay queued for manual review.
              </CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Source</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Invoice #</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">PO</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Validation</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Review</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Total</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={8} className="h-12 animate-pulse bg-muted/5" /></TableRow>
                    ))
                  ) : invoiceIntakes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-muted-foreground text-xs italic">
                        No OCR intakes processed yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoiceIntakes.map((intake) => (
                      <TableRow key={intake.id} className="border-border/10 hover:bg-primary/5 transition-colors">
                        <TableCell className="text-xs font-medium">
                          <div className="flex flex-col gap-1">
                            <span>{intake.sourceName || 'Manual'}</span>
                            {parseStoredOcrAnalysis(intake.validationJson) ? (
                              <span className="text-[10px] text-muted-foreground leading-tight">
                                {formatOcrDocumentTypeLabel(parseStoredOcrAnalysis(intake.validationJson)!.documentType)}
                                {' · '}
                                {Math.round(parseStoredOcrAnalysis(intake.validationJson)!.confidence * 100)}%
                                {parseStoredOcrAnalysis(intake.validationJson)!.supplierName ? ` · ${parseStoredOcrAnalysis(intake.validationJson)!.supplierName}` : ''}
                                {parseStoredOcrAnalysis(intake.validationJson)!.warnings.length > 0 ? ` · ${parseStoredOcrAnalysis(intake.validationJson)!.warnings.length} warning(s)` : ''}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{intake.invoiceNumber || '—'}</TableCell>
                        <TableCell className="text-xs">{intake.purchaseOrder?.poNumber || '—'}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              intake.validationStatus === 'READY_FOR_STOCK'
                                ? 'border-emerald-500/40 text-emerald-700 bg-emerald-500/10'
                                : intake.validationStatus === 'WARNING_RETAINED'
                                ? 'border-amber-500/40 text-amber-700 bg-amber-500/10'
                                : 'border-rose-500/40 text-rose-700 bg-rose-500/10'
                            }
                          >
                            {intake.validationStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              intake.reviewStatus === 'AUTO_POSTED'
                                ? 'border-emerald-500/40 text-emerald-700 bg-emerald-500/10'
                                : intake.reviewStatus === 'REJECTED'
                                ? 'border-rose-500/40 text-rose-700 bg-rose-500/10'
                                : intake.reviewStatus === 'NEEDS_REVIEW'
                                ? 'border-amber-500/40 text-amber-700 bg-amber-500/10'
                                : 'border-sky-500/40 text-sky-700 bg-sky-500/10'
                            }
                          >
                            {intake.reviewStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-bold">Rs. {intake.claimedGrandTotal.toLocaleString()}</TableCell>
                        <TableCell>
                          {intake.reviewStatus === 'AUTO_POSTED' ? (
                            <span className="text-[10px] text-emerald-600 font-medium">Posted</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg border-emerald-500/20 text-emerald-700 hover:bg-emerald-500/10 text-[10px]"
                                onClick={() => handleUpdateIntakeStatus(intake.id, 'RESOLVED')}
                                disabled={updatingIntakeId === intake.id}
                              >
                                Mark Resolved
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg border-rose-500/20 text-rose-700 hover:bg-rose-500/10 text-[10px]"
                                onClick={() => handleUpdateIntakeStatus(intake.id, 'REJECTED')}
                                disabled={updatingIntakeId === intake.id}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-[10px] text-muted-foreground">
                          {format(new Date(intake.createdAt), 'dd MMM yyyy')}
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
                    <p className="text-xs text-muted-foreground">{s.gstNumber || s.email || 'No GSTIN/email registered'}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/10">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Contact</span>
                      <span className="text-xs font-medium">{s.contactPerson || s.phone || s.contact || 'N/A'}</span>
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

            {/* Raise PO Dialog */}
      <Dialog open={showNewPODialog} onOpenChange={(open) => {
        setShowNewPODialog(open)
        if (!open) resetPOForm()
      }}>
        <DialogContent className="sm:max-w-4xl border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="size-5 text-primary" /> New Purchase Order
            </DialogTitle>
            <DialogDescription>Create a Purchase Order by converting an approved Store Requisition.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Select Approved Store Requisition</Label>
              <Select value={selectedSrId} onValueChange={setSelectedSrId}>
                <SelectTrigger className="bg-background border-border rounded-xl h-11">
                  <SelectValue placeholder="Choose an approved store requisition..." />
                </SelectTrigger>
                <SelectContent>
                  {approvedReqs.map(sr => (
                    <SelectItem key={sr.id} value={sr.id}>
                      {sr.requestNumber || `SR-${sr.id.slice(-6).toUpperCase()}`} - {sr.employee} ({sr.department}) - {format(new Date(sr.createdAt), 'dd MMM yyyy')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {approvedReqs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No approved store requisitions available for PO conversion.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-bold uppercase tracking-wider">Select Supplier</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg gap-1.5 text-xs"
                  onClick={() => {
                    setSupplierDialogSource('po')
                    setNewSupplier({
                      ...emptySupplierForm(),
                      name: supplierSearch.trim(),
                    })
                    setShowNewSupplierDialog(true)
                  }}
                >
                  <Plus className="size-3.5" /> Register Supplier
                </Button>
              </div>
              <Input
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Search by supplier, GSTIN, phone, email..."
                className="bg-background border-border rounded-xl h-10"
              />
              {selectedSrId && supplierRecommendations.length > 0 && (
                <div className="flex flex-wrap gap-2 rounded-xl border border-primary/15 bg-primary/5 p-2">
                  {supplierRecommendations.slice(0, 4).map((entry) => (
                    <Button
                      key={entry.supplier.id}
                      type="button"
                      variant={selectedSupplier === entry.supplier.id ? 'default' : 'outline'}
                      size="sm"
                      className="h-auto min-h-8 rounded-lg px-2 py-1 text-xs"
                      onClick={() => chooseSupplier(entry.supplier.id)}
                    >
                      <span className="font-semibold">{entry.supplier.name}</span>
                      <span className="text-[10px] opacity-70">{entry.reasons[0]}</span>
                    </Button>
                  ))}
                </div>
              )}
              <Select value={selectedSupplier} onValueChange={chooseSupplier}>
                <SelectTrigger className="bg-background border-border rounded-xl h-11">
                  <SelectValue placeholder="Choose a registered vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {supplierOptions.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{recommendedSupplierIds.has(s.id) ? ' (recommended)' : ''} {s.status === 'BLOCKED' ? ' (BLOCKED)' : s.status === 'INACTIVE' ? ' (INACTIVE)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supplierOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No supplier matches this search. Register a supplier here to keep the PO draft in place.
                </p>
              )}
              {selectedSupplierObj && !isSupplierValid && (
                <p className="text-xs text-rose-500 font-medium">
                  This supplier is currently inactive or blocked. Activate it before using it on a PO.
                </p>
              )}
            </div>

            {selectedSrId && (
              <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Requisition Items (Shortfalls to Order)</Label>
                <div className="overflow-x-auto rounded-lg border border-border/40">
                  <Table>
                    <TableHeader className="bg-muted/10">
                      <TableRow className="hover:bg-transparent border-border/50">
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2">Item</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2">Requested</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2">In Store</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2">To Order</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2 w-32">Price (₹)</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2 w-24">Disc (%)</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2 w-24">Line GST (%)</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2 text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poItems.map((pi: any, idx: number) => {
                        const lineTotal = (pi.qty * pi.unitPrice) * (1 - (pi.discount || 0) / 100) * (1 + (pi.taxRate || 0) / 100);
                        return (
                          <TableRow key={idx} className="border-border/10">
                            <TableCell className="text-xs font-medium py-2">{pi.itemName}</TableCell>
                            <TableCell className="text-xs py-2">{pi.requestedQty} {pi.unit}</TableCell>
                            <TableCell className="text-xs py-2">{pi.availableQtySnapshot} {pi.unit}</TableCell>
                            <TableCell className="text-xs font-bold text-amber-600 py-2">{pi.qty} {pi.unit}</TableCell>
                            <TableCell className="text-xs py-1">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={pi.unitPrice}
                                onChange={(e) => updatePoItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                className="h-8 w-28 text-xs bg-background border-border rounded-lg"
                              />
                            </TableCell>
                            <TableCell className="text-xs py-1">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={pi.discount || 0}
                                onChange={(e) => updatePoItem(idx, 'discount', parseFloat(e.target.value) || 0)}
                                className="h-8 w-20 text-xs bg-background border-border rounded-lg"
                              />
                            </TableCell>
                            <TableCell className="text-xs py-1">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={pi.taxRate || 0}
                                onChange={(e) => updatePoItem(idx, 'taxRate', parseFloat(e.target.value) || 0)}
                                className="h-8 w-20 text-xs bg-background border-border rounded-lg"
                              />
                            </TableCell>
                            <TableCell className="text-xs text-right py-2 font-semibold">
                              ₹ {lineTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {poItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-4 italic">
                            No shortfall items requiring PO conversion found in this requisition.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {poItems.length > 0 && (
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2 animate-in fade-in zoom-in duration-300">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Item subtotal</span>
                      <span className="font-semibold">Rs. {formatMoney(poDraftCost.lineSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Line GST</span>
                      <span className="font-semibold">Rs. {formatMoney(poDraftCost.lineTaxAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Transportation</span>
                      <span className="font-semibold">Rs. {formatMoney(poDraftCost.transportationCost)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">CGST + SGST + IGST ({poDraftCost.headerGstRate}%)</span>
                      <span className="font-semibold">Rs. {formatMoney(poDraftCost.headerGstAmount)}</span>
                    </div>
                    <Separator className="opacity-20" />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">PO Grand Total</span>
                      <span className="text-base font-bold text-primary">Rs. {formatMoney(poDraftCost.grandTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Expected Delivery Date</Label>
                <Input 
                  type="date"
                  value={poDeliveryDate}
                  onChange={(e) => setPoDeliveryDate(e.target.value)}
                  className="bg-background border-border rounded-xl h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Payment Terms</Label>
                <Input 
                  placeholder="e.g. Net 30"
                  value={poPaymentTerms}
                  onChange={(e) => setPoPaymentTerms(e.target.value)}
                  className="bg-background border-border rounded-xl h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Transportation Cost</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 500"
                  value={poTransportationCost || ''}
                  onChange={(e) => setPoTransportationCost(parseFloat(e.target.value) || 0)}
                  className="bg-background border-border rounded-xl h-11"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">CGST (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g. 9"
                  value={poCgstRate || ''}
                  onChange={(e) => setPoCgstRate(parseFloat(e.target.value) || 0)}
                  className="bg-background border-border rounded-xl h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">SGST (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g. 9"
                  value={poSgstRate || ''}
                  onChange={(e) => setPoSgstRate(parseFloat(e.target.value) || 0)}
                  className="bg-background border-border rounded-xl h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">IGST (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g. 18"
                  value={poIgstRate || ''}
                  onChange={(e) => setPoIgstRate(parseFloat(e.target.value) || 0)}
                  className="bg-background border-border rounded-xl h-11"
                />
              </div>
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
            {!canSubmitPO && (
              <span className="mr-auto self-center text-xs text-rose-500">
                {!selectedSrId ? 'Select an approved requisition' : !selectedSupplier ? 'Select a supplier' : !isSupplierValid ? 'Supplier must be active' : 'No items requiring order'}
              </span>
            )}
            <Button variant="ghost" onClick={() => setShowNewPODialog(false)} disabled={savingPO}>Cancel</Button>
            <Button
              className="rounded-xl px-8 shadow-lg shadow-primary/20 gap-2"
              onClick={handleCreatePO}
              disabled={savingPO || !canSubmitPO}
            >
              {savingPO ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
              Send Purchase Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Dialog */}
      <Dialog open={showNewSupplierDialog} onOpenChange={(open) => {
        setShowNewSupplierDialog(open)
        if (!open) setNewSupplier(emptySupplierForm())
      }}>
        <DialogContent className="sm:max-w-2xl border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" /> Register New Supplier
            </DialogTitle>
            <DialogDescription>
              {supplierDialogSource === 'po'
                ? 'Add the supplier without losing the current purchase order draft.'
                : 'Register supplier details for procurement and invoice matching.'}
            </DialogDescription>
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
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">GSTIN</Label>
                <Input 
                  value={newSupplier.gstNumber} 
                  onChange={(e) => setNewSupplier({...newSupplier, gstNumber: e.target.value})} 
                  className="bg-background border-border rounded-xl h-11"
                  placeholder="24AAAAA0000A1Z5"
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Contact Person</Label>
                <Input
                  value={newSupplier.contactPerson}
                  onChange={(e) => setNewSupplier({...newSupplier, contactPerson: e.target.value})}
                  className="bg-background border-border rounded-xl h-11"
                  placeholder="Purchase contact"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Phone</Label>
                <Input
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({...newSupplier, phone: e.target.value})}
                  className="bg-background border-border rounded-xl h-11"
                  placeholder="9876543210"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Payment Terms</Label>
                <Input
                  value={newSupplier.paymentTerms}
                  onChange={(e) => setNewSupplier({...newSupplier, paymentTerms: e.target.value})}
                  className="bg-background border-border rounded-xl h-11"
                  placeholder="Net 30"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Address</Label>
              <Textarea
                value={newSupplier.address}
                onChange={(e) => setNewSupplier({...newSupplier, address: e.target.value})}
                className="bg-background border-border rounded-xl min-h-20"
                placeholder="Registered billing address"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setShowNewSupplierDialog(false)} disabled={savingSupplier}>Cancel</Button>
            <Button 
              className="rounded-xl px-8 shadow-lg shadow-primary/20"
              onClick={handleCreateSupplier}
              disabled={savingSupplier || !newSupplier.name.trim()}
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

      {/* PO Detail Dialog */}
      <Dialog open={showPODetailDialog} onOpenChange={setShowPODetailDialog}>
        <DialogContent className="sm:max-w-3xl border-border max-h-[90vh] overflow-y-auto">
          {selectedPo && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <div className="space-y-1">
                    <DialogTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
                      <FileText className="size-5 text-primary" /> {selectedPo.poNumber}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Purchase Order Details & Progress Tracker
                    </DialogDescription>
                  </div>
                  {getStatusBadge(selectedPo.status)}
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Visual Stepper Timeline */}
                <div className="p-5 rounded-xl border border-border bg-muted/5 space-y-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Workflow Status Timeline</div>
                  
                  {/* Stepper component */}
                  <div className="py-6 overflow-x-auto">
                    <div className="flex items-center justify-between w-full min-w-[600px] relative px-4">
                      {/* Line behind circles */}
                      <div className="absolute top-[16px] left-[40px] right-[40px] h-0.5 bg-muted z-0" />
                      
                      {[
                        { label: 'Created', key: 'created' },
                        { label: 'Approved', key: 'approved' },
                        { label: 'Sent', key: 'sent' },
                        { label: 'Supplier Confirm', key: 'confirm' },
                        { label: 'Receive', key: 'receive' },
                        { label: 'Invoice', key: 'invoice' },
                        { label: 'Close', key: 'close' }
                      ].map((step, idx) => {
                        const state = (() => {
                          const s = canonicalPoStatus(selectedPo.status);
                          const rank: Record<string, number> = {
                            [PO_STATUS.DRAFT]: 0,
                            [PO_STATUS.PENDING_APPROVAL]: 1,
                            [PO_STATUS.APPROVED]: 2,
                            [PO_STATUS.SENT_TO_SUPPLIER]: 3,
                            [PO_STATUS.PARTIALLY_RECEIVED]: 5,
                            [PO_STATUS.FULLY_RECEIVED]: 6,
                            [PO_STATUS.INVOICE_PENDING]: 7,
                            [PO_STATUS.CLOSED]: 8
                          };
                          const currentRank = rank[s] ?? 0;

                          switch (step.key) {
                            case 'created':
                              return 'completed';
                            case 'approved':
                              if (currentRank > 1) return 'completed';
                              if (currentRank === 1) return 'active';
                              return 'upcoming';
                            case 'sent':
                              if (currentRank > 2) return 'completed';
                              if (currentRank === 2) return 'active';
                              return 'upcoming';
                            case 'confirm':
                              if (currentRank > 3) return 'completed';
                              if (currentRank === 3) return 'active';
                              return 'upcoming';
                            case 'receive':
                              if (currentRank > 5) return 'completed';
                              if (currentRank === 4 || currentRank === 5) return 'active';
                              return 'upcoming';
                            case 'invoice':
                              if (currentRank > 7) return 'completed';
                              if (currentRank === 6 || currentRank === 7) return 'active';
                              return 'upcoming';
                            case 'close':
                              if (currentRank === 8) return 'completed';
                              return 'upcoming';
                            default:
                              return 'upcoming';
                          }
                        })();
                        const stepLabel = step.key === 'approved' && state === 'active' ? 'Pending Approval' : step.label

                        return (
                          <div key={idx} className="flex flex-col items-center z-10 relative bg-background px-2">
                            <div className={`size-8 rounded-full flex items-center justify-center border-2 font-bold text-xs transition-all duration-300 ${
                              state === 'completed' 
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20' 
                                : state === 'active' 
                                ? 'bg-amber-500 border-amber-500 text-white animate-pulse shadow-md shadow-amber-500/20' 
                                : 'bg-muted border-muted-foreground/20 text-muted-foreground'
                            }`}>
                              {state === 'completed' ? '✓' : idx + 1}
                            </div>
                            <span className={`text-[10px] font-bold mt-2 text-center whitespace-nowrap uppercase tracking-wider ${
                              state === 'completed' 
                                ? 'text-emerald-500' 
                                : state === 'active' 
                                ? 'text-amber-500 font-extrabold' 
                                : 'text-muted-foreground/60'
                            }`}>
                              {stepLabel}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Supplier Details */}
                  <div className="space-y-3 p-4 rounded-xl border border-border/60 bg-muted/5">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Building2 className="size-3.5" /> Supplier Information
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Name:</span> <span className="font-bold">{selectedPo.supplier.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">GSTIN:</span> <span className="font-mono font-bold">{selectedPo.supplier.gstNumber || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Contact:</span> <span className="font-semibold">{selectedPo.supplier.contact || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms:</span> <span className="font-medium text-amber-600">{selectedPo.paymentTerms || selectedPo.supplier.paymentTerms || '—'}</span></div>
                    </div>
                  </div>

                  {/* Requisition & Meta */}
                  <div className="space-y-3 p-4 rounded-xl border border-border/60 bg-muted/5">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <ClipboardList className="size-3.5" /> Linked Requisition Details
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SR Number:</span> 
                        <span className="font-mono font-bold">
                          {selectedPo.linkedSr?.requestNumber || (selectedPo.linkedSrId ? `SR-${selectedPo.linkedSrId.slice(-6).toUpperCase()}` : '—')}
                        </span>
                      </div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Department:</span> <span className="font-semibold">{selectedPo.linkedSr?.department || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Requested By:</span> <span className="font-semibold">{selectedPo.linkedSr?.employee || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Expected Delivery:</span> <span className="font-semibold text-primary">{selectedPo.deliveryDate ? format(new Date(selectedPo.deliveryDate), 'dd MMM yyyy') : '—'}</span></div>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Purchase Items List</div>
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader className="bg-muted/15">
                        <TableRow className="hover:bg-transparent border-border/50">
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2.5">Item Name</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2.5">Ordered Qty</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2.5">Received Qty</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2.5 text-right">Unit Price</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2.5 text-right">Disc</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2.5 text-right">Line GST</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider py-2.5 text-right">Line Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPo.items.map((pi, idx) => (
                          <TableRow key={idx} className="border-border/10">
                            <TableCell className="text-xs font-medium py-2">{pi.item.name}</TableCell>
                            <TableCell className="text-xs py-2">{pi.qty} {pi.item.unit}</TableCell>
                            <TableCell className="text-xs py-2">
                              <span className={pi.receivedQty >= pi.qty ? 'text-emerald-500 font-bold' : pi.receivedQty > 0 ? 'text-amber-500 font-bold' : 'text-muted-foreground'}>
                                {pi.receivedQty} {pi.item.unit}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-right py-2">Rs. {formatMoney(pi.unitPrice)}</TableCell>
                            <TableCell className="text-xs text-right py-2">{pi.discount || 0}%</TableCell>
                            <TableCell className="text-xs text-right py-2">{pi.taxRate || 0}%</TableCell>
                            <TableCell className="text-xs text-right font-bold py-2">
                              Rs. {formatMoney((pi.qty * pi.unitPrice * (1 - (pi.discount || 0) / 100)) * (1 + (pi.taxRate || 0) / 100))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Pricing totals summary */}
                <div className="flex justify-end">
                  <div className="w-80 space-y-1.5 p-3 rounded-xl border border-border/60 bg-muted/10 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Item subtotal:</span> <span className="font-semibold">Rs. {formatMoney(selectedPoCost?.lineSubtotal ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Line GST:</span> <span className="font-semibold">Rs. {formatMoney(selectedPoCost?.lineTaxAmount ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Transportation:</span> <span className="font-semibold">Rs. {formatMoney(selectedPo.transportationCost ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">CGST ({selectedPo.cgstRate ?? 0}%):</span> <span className="font-semibold">Rs. {formatMoney(((selectedPoCost?.lineSubtotal ?? 0) + (selectedPo.transportationCost ?? 0)) * ((selectedPo.cgstRate ?? 0) / 100))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SGST ({selectedPo.sgstRate ?? 0}%):</span> <span className="font-semibold">Rs. {formatMoney(((selectedPoCost?.lineSubtotal ?? 0) + (selectedPo.transportationCost ?? 0)) * ((selectedPo.sgstRate ?? 0) / 100))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">IGST ({selectedPo.igstRate ?? 0}%):</span> <span className="font-semibold">Rs. {formatMoney(((selectedPoCost?.lineSubtotal ?? 0) + (selectedPo.transportationCost ?? 0)) * ((selectedPo.igstRate ?? 0) / 100))}</span></div>
                    {!selectedPoHasExtendedCost && selectedPo.tax > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Legacy Tax ({selectedPo.tax}%):</span> <span className="font-semibold">Rs. {formatMoney(selectedPoCost?.headerGstAmount ?? 0)}</span></div>
                    )}
                    <Separator className="opacity-20 my-1" />
                    <div className="flex justify-between text-sm font-bold text-primary"><span>Total Amount:</span> <span>Rs. {formatMoney(selectedPoGrandTotal)}</span></div>
                  </div>
                </div>

                {selectedPo.notes && (
                  <div className="space-y-1 p-3 rounded-lg border border-border/40 bg-muted/5 text-xs">
                    <div className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Internal Remarks / Notes</div>
                    <p className="text-foreground/80 leading-relaxed font-serif italic mt-0.5">{selectedPo.notes}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2 border-t border-border/10 gap-2">
                {isPoApprovalActionVisible(selectedPo.status) && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 gap-1.5 h-10 px-6"
                    disabled={approvingPoId === selectedPo.id}
                    onClick={() => handleApprovePO(selectedPo.id)}
                  >
                    {approvingPoId === selectedPo.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Approve Purchase Order
                  </Button>
                )}
                {isPoReceiveActionVisible(selectedPo.status) && (
                  <Button
                    className="bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 gap-1.5 h-10 px-6"
                    onClick={() => {
                      setShowPODetailDialog(false)
                      handleReceivePO(selectedPo.id)
                    }}
                  >
                    <ArrowDownToLine className="size-4" /> Receive Goods
                  </Button>
                )}
                <Button variant="ghost" className="rounded-xl h-10 px-6" onClick={() => setShowPODetailDialog(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
