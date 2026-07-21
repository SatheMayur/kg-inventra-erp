// Typed API client for Inventra backend

import { useAppStore } from './store'

export class ApiClientError extends Error {
  public status: number
  public type?: string
  public data?: any

  constructor(message: string, status: number, type?: string, data?: any) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.type = type
    this.data = data
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new ApiClientError(error.error || error.message || `HTTP ${res.status}`, res.status)
  }
  return res.json()
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  let url = path

  if (params) {
    const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    if (filtered.length > 0) {
      const qs = filtered
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
      url += `?${qs}`
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include', // send httpOnly cookie on every request
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }))
    const msg = error.error || error.message || `HTTP ${res.status}`
    const err = new ApiClientError(msg, res.status, error.type, error)

    // Auto-logout on 401 — token expired or invalid
    if (res.status === 401) {
      // Defer to avoid calling store during render
      setTimeout(() => {
        const { reset } = useAppStore.getState()
        reset()
      }, 0)
    }

    throw err
  }

  return res.json()
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {}

  const res = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }))
    const msg = error.error || error.message || `HTTP ${res.status}`
    const err = new ApiClientError(msg, res.status, error.type, error)

    if (res.status === 401) {
      setTimeout(() => {
        const { reset } = useAppStore.getState()
        reset()
      }, 0)
    }

    throw err
  }

  return res.json()
}

function GET<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
  return request<T>('GET', path, undefined, params)
}

function POST<T>(path: string, body?: unknown) {
  return request<T>('POST', path, body)
}

function PATCH<T>(path: string, body?: unknown) {
  return request<T>('PATCH', path, body)
}

function DELETE<T>(path: string) {
  return request<T>('DELETE', path)
}

// Types
export interface ItemResponse {
  id: string
  name: string
  category: string
  unit: string
  stock: number
  minStock: number
  reservedQty: number
  version: number
  photoUrl: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  price: number
  avgDailyConsumption?: number
  rop?: number
  itemCode?: string | null
  hsnCode?: string | null
  gstRate?: number
  maxStock?: number
  safetyStock?: number
  reorderQty?: number
  shortName?: string | null
  subCategory?: string | null
  description?: string | null
  preferredSupplierId?: string | null
  warehouse?: string | null
  rack?: string | null
  shelf?: string | null
  bin?: string | null
  active?: boolean
  onOrderQty?: number
  aliases?: Array<{ id: string; aliasText: string }>
  procurementType?: 'STANDARD' | 'DAILY' | 'BOTH'
  pricingMode?: 'DAILY_MARKET_RATE' | 'CONTRACT_RATE' | 'VENDOR_PRICE_LIST' | 'LAST_APPROVED_RATE' | 'MANUAL_QUOTATION' | 'EMERGENCY_PROVISIONAL_RATE'
  itemNature?: 'PERISHABLE' | 'NON_PERISHABLE' | 'SERVICE'
  baseUnit?: string | null
  purchaseUnit?: string | null
  consumptionUnit?: string | null
  unitConversion?: number
  perishable?: boolean
  shelfLife?: number | null
  storageCondition?: string | null
  qualityGradeEnabled?: boolean
  dailyProcurementEligible?: boolean
  requiresMasterReview?: boolean
  sourceChannel?: string
}

export interface ItemDuplicateMatchResponse {
  itemId: string
  name: string
  category: string
  unit: string
  active: boolean
  matchType: 'EXACT_NAME' | 'EXACT_ALIAS' | 'INACTIVE_DUPLICATE' | 'SIMILAR_NAME'
  confidence: number
}

export interface DailyItemImportRowResponse {
  rowNumber: number
  status: 'VALID' | 'IMPORTED' | 'DUPLICATE' | 'POSSIBLE_MATCH' | 'MISSING_UNIT' | 'INVALID_CATEGORY' | 'INVALID_CONVERSION' | 'VENDOR_NOT_FOUND' | 'IMPORT_FAILED'
  message: string
  matches: ItemDuplicateMatchResponse[]
  input: {
    name: string
    itemCode: string | null
    category: string
    baseUnit: string
    purchaseUnit: string
    consumptionUnit: string
    unitConversion: number
    pricingMode: string
    perishable: boolean
    preferredSupplierId: string | null
    preferredVendor: string | null
    storageCondition: string | null
    minStock: number
  }
  itemId: string | null
}

export interface RequestLineResponse {
  id: string
  requestId: string
  itemId: string
  itemName: string
  requestedQty: number
  approvedQty: number
  issuedQty: number
  availableQty?: number
  pendingPurchaseQty?: number
  fulfillmentStatus?: string
  unit?: string
  status: 'Pending' | 'Approved' | 'PartiallyIssued' | 'Issued' | 'Rejected' | 'Cancelled'
}

export interface RequestResponse {
  id: string
  requestNumber?: string | null
  userId: string
  employee: string
  department: string
  requiredDate: string | null
  machine: string | null
  concernPerson?: string | null
  purpose?: string | null
  // itemId/itemName/qty are transitional fields derived by the API from `lines`
  // so the current single-line UI keeps working; prefer `lines` in new code.
  itemId: string
  itemName: string
  qty: number
  note: string | null
  status: string
  priority?: string | null
  currentApproverRole?: string | null
  currentApproverUserId?: string | null
  createdBy?: string | null
  departmentId?: string | null
  issuedAt: string | null
  issuedBy: string | null
  lines: RequestLineResponse[]
  createdAt: string
  updatedAt: string
}

export interface TransactionResponse {
  id: string
  type: 'IN' | 'OUT'
  itemId: string
  itemName: string
  qty: number
  reference: string
  userId: string | null
  date: string
  createdAt: string
}

export interface UserResponse {
  id: string
  empId: string
  name: string
  department: string
  floor: string
  role: string
  isDeptHead?: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface DashboardData {
  totalItems: number
  totalStock: number
  lowStockCount: number
  outOfStockCount?: number
  pendingCount: number
  approvedCount: number
  issuedCount: number
  totalRequests?: number
  totalTransactions?: number
  recentRequests: RequestResponse[]
  recentTransactions: TransactionResponse[]
  lowStockItems: Array<{
    id: string
    name: string
    category: string
    stock: number
    minStock: number
    reservedQty: number
    available: number
  }>
}

export interface DeptConsumption {
  department: string
  qty: number
  spending: number
}

export interface TopItem {
  itemName: string
  qty: number
}

export interface StockoutRiskItem {
  id: string
  name: string
  stock: number
  unit: string
  daysLeft: number | null
  rate: number
  status: 'critical' | 'warning' | 'ok' | 'insufficient'
}

export interface PeriodComparison {
  thisMonth: { count: number; qty: number; requests: number; issued: number }
  lastMonth: { count: number; qty: number; requests: number; issued: number }
  changePct: number
}

export interface InventoryValueCategory {
  category: string
  itemCount: number
  totalStock: number
  totalValue: number
}

export interface InventoryValueItem {
  id: string
  name: string
  category: string
  stock: number
  price: number
  value: number
}

export interface InventoryValueResponse {
  totalValue: number
  byCategory: InventoryValueCategory[]
  topByValue: InventoryValueItem[]
}

export interface UserActivityEntry {
  userName: string
  actionCount: number
  actions: Record<string, number>
}

export interface UserActivityResponse {
  users: UserActivityEntry[]
  totalActions: number
  period: number
}

export interface ItemFlowDaily {
  date: string
  inQty: number
  outQty: number
  net: number
}

export interface ItemFlowByItem {
  itemName: string
  totalIn: number
  totalOut: number
  net: number
}

export interface ItemFlowResponse {
  daily: ItemFlowDaily[]
  byItem: ItemFlowByItem[]
  totalIn: number
  totalOut: number
}

export interface FlagsResponse {
  flags: Record<string, boolean>
}

export interface NotificationResponse {
  id: string
  userId: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  link: string | null
  createdAt: string
}

export interface SupplierResponse {
  id: string
  name: string
  contact: string | null
  email: string | null
  category: string | null
  active: boolean
  createdAt: string
  status?: string
  gstNumber?: string | null
  phone?: string | null
  address?: string | null
  paymentTerms?: string | null
  contactPerson?: string | null
}

export interface POResponse {
  id: string
  poNumber: string
  supplierId: string
  status: string
  totalAmount: number
  notes: string | null
  createdAt: string
  updatedAt: string
  linkedSrId?: string | null
  linkedSr?: RequestResponse | null
  supplier: SupplierResponse
  approvedBy?: string | null
  approvedAt?: string | null
  expectedDeliveryDate?: string | null
  deliveryDate?: string | null
  paymentTerms?: string | null
  tax: number
  transportationCost: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  createdBy?: string | null
  receivedAt?: string | null
  items: Array<{
    id: string
    itemId: string
    qty: number
    receivedQty: number
    unitPrice: number
    discount: number
    taxRate: number
    item: ItemResponse
  }>
}

export interface DailyQuoteRecommendationResponse {
  quoteId: string
  supplierId: string
  supplierName: string
  score: number
  landedRate: number
  availableQuantity: number
  coverageRatio: number
  reasons: string[]
}

export interface DailyVendorQuoteResponse {
  id: string
  enquiryLineId: string
  supplierId: string
  originalMessageId?: string | null
  originalMessageText?: string | null
  quotedItemText?: string | null
  matchedItemId?: string | null
  requestedQuantity: number
  availableQuantity: number
  quotedRate: number
  quotedUnit: string
  conversionFactor?: number | null
  conversionApproximate: boolean
  normalizedRate?: number | null
  qualityGrade?: string | null
  transportCharge: number
  taxRate: number
  deliveryTime?: string | null
  validityDateTime?: string | null
  substituteItem?: string | null
  vendorRemarks?: string | null
  parsingConfidence?: number | null
  verificationStatus: string
  verifiedBy?: string | null
  verifiedAt?: string | null
  supplier?: SupplierResponse
}

export interface DailyRateEnquiryLineResponse {
  id: string
  enquiryId: string
  batchLineId: string
  itemId: string
  requestedQty: number
  unit: string
  qualityGrade?: string | null
  itemSpec?: string | null
  status: string
  quotes?: DailyVendorQuoteResponse[]
}

export interface DailyRateEnquiryResponse {
  id: string
  enquiryNumber: string
  batchId: string
  supplierId: string
  status: string
  businessStatus: string
  messageStatus: string
  whatsappMessageId?: string | null
  whatsappReference: string
  language: string
  sentAt?: string | null
  createdBy: string
  notes?: string | null
  createdAt: string
  updatedAt: string
  supplier?: SupplierResponse
  lines?: DailyRateEnquiryLineResponse[]
}

export interface DailyVendorAllocationResponse {
  id: string
  batchId: string
  batchLineId: string
  quoteId?: string | null
  supplierId: string
  itemId: string
  allocatedQty: number
  unit: string
  normalizedRate: number
  transportCharge: number
  taxRate: number
  landedRate: number
  recommendationReason?: string | null
  status: string
  createdBy: string
  approvedBy?: string | null
  approvedAt?: string | null
  supplier?: SupplierResponse
  quote?: DailyVendorQuoteResponse | null
}

export interface DailySupplyOrderLineResponse {
  id: string
  supplyOrderId: string
  allocationId: string
  itemId: string
  itemName: string
  orderedQty: number
  acceptedQty: number
  rejectedQty: number
  unit: string
  rate: number
  taxRate: number
  transportCharge: number
  status: string
}

export interface DailySupplyOrderResponse {
  id: string
  orderNumber: string
  batchId: string
  supplierId: string
  status: string
  whatsappMessageId?: string | null
  whatsappReference: string
  messageStatus: string
  businessConfirmationStatus: string
  deliveryLocation?: string | null
  deliveryDate?: string | null
  deliveryTimeSlot?: string | null
  createdBy: string
  approvedBy?: string | null
  approvedAt?: string | null
  sentAt?: string | null
  purchaseOrderId?: string | null
  notes?: string | null
  supplier?: SupplierResponse
  lines?: DailySupplyOrderLineResponse[]
}

export interface DailyProcurementLineResponse {
  id: string
  batchId: string
  sourceType: string
  sourceRequestId?: string | null
  sourceRequestLineId?: string | null
  itemId: string
  itemName: string
  unit: string
  operationalRequirement: number
  requiredClosingStock: number
  usableStock: number
  confirmedPendingSupply: number
  calculatedNetQty: number
  finalPurchaseQty: number
  overrideReason?: string | null
  overriddenBy?: string | null
  overriddenAt?: string | null
  qualityGrade?: string | null
  itemSpec?: string | null
  storageCondition?: string | null
  deliveryLocation?: string | null
  deliveryTimeSlot?: string | null
  status: string
  item?: ItemResponse
  enquiryLines?: DailyRateEnquiryLineResponse[]
  allocations?: DailyVendorAllocationResponse[]
}

export interface DailyProcurementBatchResponse {
  id: string
  batchNumber: string
  deliveryDate: string
  deliveryTimeSlot?: string | null
  requirementCutoffTime?: string | null
  locationId?: string | null
  deliveryLocation?: string | null
  status: string
  createdBy: string
  createdById?: string | null
  approvedBy?: string | null
  approvedAt?: string | null
  notes?: string | null
  version: number
  cancellationReason?: string | null
  createdAt: string
  updatedAt: string
  lines: DailyProcurementLineResponse[]
  enquiries: DailyRateEnquiryResponse[]
  allocations: DailyVendorAllocationResponse[]
  supplyOrders: DailySupplyOrderResponse[]
  recommendationsByLineId?: Record<string, DailyQuoteRecommendationResponse[]>
}

export interface InvoiceResponse {
  id: string
  invoiceNumber: string
  purchaseOrderId: string
  amount: number
  status: 'UNPAID' | 'PAID' | 'CANCELLED'
  notes: string | null
  createdAt: string
  updatedAt: string
  purchaseOrder: POResponse
}

export interface InvoiceIntakeResponse {
  id: string
  sourceName: string | null
  invoiceNumber: string | null
  rawOcrText: string
  claimedGrandTotal: number
  purchaseOrderId: string | null
  validationStatus: 'READY_FOR_STOCK' | 'WARNING_RETAINED' | 'REJECTED_MATH_ERROR'
  reviewStatus: 'PENDING' | 'AUTO_POSTED' | 'NEEDS_REVIEW' | 'REJECTED' | 'RESOLVED'
  validationJson: string
  postedInvoiceId: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  purchaseOrder: POResponse | null
  validationResult: InvoiceValidationResponse
}

export interface InvoiceValidationLineItem {
  rawDescription: string
  category: 'STATIONERY' | 'DIAMOND_TOOLS' | 'LIQUIDS' | 'GENERAL'
  originalQty: number
  normalizedStockQty: number
  inventoryUnit: 'pcs' | 'Liters'
  verifiedUnitPrice: number
  calculatedLineTotal: number
  lineStatus: 'VALID' | 'WARNING' | 'ERROR'
  systemNote: string
}

export interface InvoiceValidationResponse {
  isValid: boolean
  globalInvoiceStatus: 'READY_FOR_STOCK' | 'WARNING_RETAINED' | 'REJECTED_MATH_ERROR'
  calculatedSubtotal: number
  mismatchLog: string[]
  lineItems: InvoiceValidationLineItem[]
}

export interface GeminiInvoiceLineItem {
  description: string
  quantity: number | null
  unit: string | null
  rate: number | null
  amount: number | null
}

export interface GeminiInvoiceExtraction {
  document_type: 'gst_invoice' | 'cash_memo' | 'estimate_bill' | 'handwritten_receipt' | 'unknown'
  supplier: {
    name: string | null
    gstin: string | null
    address: string | null
  }
  buyer: {
    name: string | null
    gstin: string | null
  }
  invoice_details: {
    invoice_number: string | null
    invoice_date: string | null
    place_of_supply: string | null
  }
  line_items: GeminiInvoiceLineItem[]
  totals: {
    subtotal: number | null
    tax: number | null
    grand_total: number | null
  }
  warnings: string[]
  confidence: number
}

export interface GeminiInvoiceExtractionResponse {
  model: string
  canonicalText: string
  extraction: GeminiInvoiceExtraction
  analysis: {
    documentType: 'gst_invoice' | 'cash_memo' | 'estimate_bill' | 'handwritten_receipt' | 'unknown'
    confidence: number
    supplierName: string | null
    supplierConfidence: number
    warnings: string[]
    reasons: string[]
  }
  sourceName: string | null
}

export interface ChallanResponse {
  id: string
  challanNumber: string
  purchaseOrderId: string
  receivedBy: string
  date: string
  status: 'PENDING' | 'CONFIRMED'
  notes: string | null
  createdAt: string
  updatedAt: string
  purchaseOrder: POResponse
}

export interface GatePassResponse {
  id: string
  passNumber: string
  type: 'IN' | 'OUT'
  requestId: string | null
  receiverName: string
  vehicleNumber: string | null
  purpose: string | null
  status: 'DRAFT' | 'ISSUED' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  updatedAt: string
  request?: RequestResponse
}

export interface ItemVariantResponse {
  id: string
  itemId: string
  name: string
  packSize: string
  packQty: number
  unit: string
  barcode: string | null
  stock: number
  createdAt: string
  updatedAt: string
}

export interface StockTransferItemResponse {
  id: string
  transferId: string
  itemId: string
  itemName: string
  variantId: string | null
  variantName: string | null
  qty: number
  unit: string
}

export interface StockTransferResponse {
  id: string
  memoNumber: string
  fromLocation: string
  toLocation: string
  status: 'DRAFT' | 'CONFIRMED' | 'RECONCILED'
  ppPoReference: string | null
  ppReconciled: boolean
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  items: StockTransferItemResponse[]
}

// API object
export interface AuditLog {
  id: string
  action: string
  userId?: string
  userName?: string
  targetId?: string
  targetName?: string
  metadata?: string
  ip?: string
  createdAt: string
}

export interface CheckoutResponse {
  id: string
  itemId: string
  userId: string
  qty: number
  purpose: string | null
  checkedOutAt: string
  expectedReturnAt: string | null
  returnedAt: string | null
  status: string
  notes: string | null
  item?: ItemResponse
  user?: UserResponse
}

export interface PickListItemResponse {
  id: string
  pickListId: string
  itemId: string
  itemName: string
  qty: number
  pickedQty: number
  unit: string
  status: string
}

export interface PickListResponse {
  id: string
  name: string
  status: string
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  items?: PickListItemResponse[]
}

export interface AlertResponse {
  type: 'LOW_STOCK' | 'MAINTENANCE_DUE' | 'EXPIRY'
  itemId?: string
  scheduleId?: string
  assetId?: string
  itemName?: string
  name?: string
  title?: string
  stock?: number
  minStock?: number
  severity?: 'critical' | 'warning'
  dueDate?: string
  status?: string
  serialNumber?: string
  warrantyExpiry?: string | null
  licenseExpiry?: string | null
}

export interface MaintenanceScheduleResponse {
  id: string
  itemId: string
  title: string
  dueDate: string
  recurringDays: number | null
  lastCompleted: string | null
  status: string
  notes: string | null
  assetId: string | null
  createdAt: string
  updatedAt: string
  item?: ItemResponse
}

export interface WebhookResponse {
  id: string
  name: string
  url: string
  events: string
  active: boolean
  secret: string | null
  createdAt: string
  updatedAt: string
}

export const api = {
  auth: {
    login: (empId: string, password: string) =>
      POST<{ user: { id: string; empId: string; name: string; department: string; floor: string; role: 'admin' | 'employee'; active: boolean } }>('/api/auth/login', { empId, password }),
    logout: () => POST<{ success: boolean }>('/api/auth/logout', {}),
    seed: () => POST<{ message: string; seeded: boolean }>('/api/auth/seed', {}),
    me: () => GET<{ user: { id: string; empId: string; name: string; department: string; floor: string; role: 'admin' | 'employee'; active: boolean; isDeptHead?: boolean } }>('/api/auth/me'),
  },

  items: {
    list: async (params?: {
      category?: string
      stock?: string
      search?: string
      includeDeleted?: boolean
      procurementContext?: 'daily'
      context?: 'daily'
      includeAll?: boolean
      showAll?: boolean
      cacheBust?: number
      page?: number
      pageSize?: number
    }): Promise<{ items: ItemResponse[]; pagination: { totalCount: number; page: number; pageSize: number; totalPages: number } }> => {
      return GET<{ items: ItemResponse[]; pagination: { totalCount: number; page: number; pageSize: number; totalPages: number } }>('/api/items', params)
    },
    categories: async (): Promise<string[]> => {
      const res = await GET<{ categories: string[] }>('/api/items/categories')
      return res.categories
    },
    bulkImport: async (items: Array<{ name: string; category: string; unit: string; stock: number; minStock: number }>): Promise<{ count: number; items: ItemResponse[] }> => {
      return POST<{ count: number; items: ItemResponse[] }>('/api/items/bulk', items)
    },
    create: async (data: {
      name: string
      category: string
      unit: string
      stock: number
      minStock: number
      itemCode?: string
      hsnCode?: string
      gstRate?: number
      maxStock?: number
      safetyStock?: number
      reorderQty?: number
      shortName?: string
      subCategory?: string
      description?: string
      warehouse?: string
      rack?: string
      shelf?: string
      bin?: string
      preferredSupplierId?: string
      procurementType?: 'STANDARD' | 'DAILY' | 'BOTH'
      pricingMode?: 'DAILY_MARKET_RATE' | 'CONTRACT_RATE' | 'VENDOR_PRICE_LIST' | 'LAST_APPROVED_RATE' | 'MANUAL_QUOTATION' | 'EMERGENCY_PROVISIONAL_RATE'
      itemNature?: 'PERISHABLE' | 'NON_PERISHABLE' | 'SERVICE'
      baseUnit?: string
      purchaseUnit?: string
      consumptionUnit?: string
      unitConversion?: number
      perishable?: boolean
      shelfLife?: number
      storageCondition?: string
      qualityGradeEnabled?: boolean
      dailyProcurementEligible?: boolean
      requiresMasterReview?: boolean
      sourceChannel?: string
      confirmDuplicate?: boolean
      active?: boolean
    }): Promise<ItemResponse> => {
      const res = await POST<{ item: ItemResponse }>('/api/items', data)
      return res.item
    },
    update: async (id: string, data: {
      name?: string
      category?: string
      unit?: string
      minStock?: number
      itemCode?: string
      hsnCode?: string
      gstRate?: number
      maxStock?: number
      safetyStock?: number
      reorderQty?: number
      shortName?: string
      subCategory?: string
      description?: string
      warehouse?: string
      rack?: string
      shelf?: string
      bin?: string
      preferredSupplierId?: string
      procurementType?: 'STANDARD' | 'DAILY' | 'BOTH'
      pricingMode?: 'DAILY_MARKET_RATE' | 'CONTRACT_RATE' | 'VENDOR_PRICE_LIST' | 'LAST_APPROVED_RATE' | 'MANUAL_QUOTATION' | 'EMERGENCY_PROVISIONAL_RATE'
      itemNature?: 'PERISHABLE' | 'NON_PERISHABLE' | 'SERVICE'
      baseUnit?: string
      purchaseUnit?: string
      consumptionUnit?: string
      unitConversion?: number
      perishable?: boolean
      shelfLife?: number
      storageCondition?: string
      qualityGradeEnabled?: boolean
      dailyProcurementEligible?: boolean
      requiresMasterReview?: boolean
      active?: boolean
    }): Promise<ItemResponse> => {
      const res = await PATCH<{ item: ItemResponse }>(`/api/items/${id}`, data)
      return res.item
    },
    dailyImport: async (file: File, commit: boolean): Promise<{ rows: DailyItemImportRowResponse[]; importedCount: number; items: ItemResponse[] }> => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('commit', String(commit))
      return upload<{ rows: DailyItemImportRowResponse[]; importedCount: number; items: ItemResponse[] }>('/api/items/daily-import', formData)
    },
    delete: async (id: string): Promise<ItemResponse> => {
      const res = await DELETE<{ item: ItemResponse }>(`/api/items/${id}`)
      return res.item
    },
    restock: async (id: string, data: { qty: number; reference?: string; userId?: string }): Promise<ItemResponse> => {
      const res = await POST<{ item: ItemResponse }>(`/api/items/${id}/restock`, data)
      return res.item
    },
  },

  requests: {
    list: async (params?: {
      userId?: string
      status?: string
    }): Promise<RequestResponse[]> => {
      const res = await GET<{ requests: RequestResponse[] }>('/api/requests', params)
      return res.requests
    },
    create: async (data: {
      userId: string
      employee: string
      department: string
      itemId?: string
      qty?: number
      lines?: Array<{ itemId: string; qty: number } | { customItemName: string; unit?: string; qty: number }>
      note?: string
      requiredDate?: string
      machine?: string
      concernPerson?: string
      priority?: string
      purpose?: string
      remarks?: string
      attachments?: string
      status?: string
    }): Promise<RequestResponse> => {
      const res = await POST<{ request: RequestResponse }>('/api/requests', data)
      return res.request
    },
    approve: async (id: string): Promise<RequestResponse> => {
      const res = await PATCH<{ request: RequestResponse }>(`/api/requests/${id}/approve`)
      return res.request
    },
    reject: async (id: string): Promise<RequestResponse> => {
      const res = await PATCH<{ request: RequestResponse }>(`/api/requests/${id}/reject`)
      return res.request
    },
    cancel: async (id: string, userId: string): Promise<RequestResponse> => {
      const res = await PATCH<{ request: RequestResponse }>(`/api/requests/${id}/cancel`, { userId })
      return res.request
    },
    issue: async (
      id: string,
      data: {
        issuedBy: string
        lines?: Array<{ lineId: string; qty: number }>
      }
    ): Promise<{ request: RequestResponse; item: ItemResponse }> => {
      const res = await PATCH<{ request: RequestResponse; item: ItemResponse }>(`/api/requests/${id}/issue`, data)
      return res
    },
    markReady: async (id: string): Promise<RequestResponse> => {
      const res = await PATCH<{ request: RequestResponse }>(`/api/requests/${id}/ready`)
      return res.request
    },
  },

  transactions: {
    list: async (params?: {
      userId?: string
      type?: string
      date?: string
      period?: string
      itemId?: string
    }): Promise<TransactionResponse[]> => {
      const res = await GET<{ transactions: TransactionResponse[] }>('/api/transactions', params as Record<string, string | undefined>)
      return res.transactions
    },
  },

  users: {
    list: async (): Promise<UserResponse[]> => {
      const res = await GET<{ users: UserResponse[] }>('/api/users')
      return res.users
    },
    create: async (data: {
      empId: string
      name: string
      department: string
      floor?: string
      role: string
      isDeptHead?: boolean
      password: string
    }): Promise<UserResponse> => {
      const res = await POST<{ user: UserResponse }>('/api/users', data)
      return res.user
    },
    update: async (id: string, data: {
      name?: string
      department?: string
      floor?: string
      role?: string
      isDeptHead?: boolean
    }): Promise<UserResponse> => {
      const res = await PATCH<{ user: UserResponse }>(`/api/users/${id}`, data)
      return res.user
    },
    resetPassword: async (id: string, password: string): Promise<UserResponse> => {
      const res = await PATCH<{ user: UserResponse }>(`/api/users/${id}/reset-password`, { password })
      return res.user
    },
    toggleActive: async (id: string): Promise<UserResponse> => {
      const res = await PATCH<{ user: UserResponse }>(`/api/users/${id}/toggle-active`)
      return res.user
    },
  },

  departments: {
    list: async (): Promise<string[]> => {
      const res = await GET<{ departments: string[] }>('/api/departments')
      return res.departments
    }
  },

  reporting: {
    dashboard: (params?: { userId?: string }) =>
      GET<DashboardData>('/api/reporting/dashboard', params),
    deptConsumption: async (params?: { period?: string }): Promise<DeptConsumption[]> => {
      const res = await GET<{ departments: DeptConsumption[] }>('/api/reporting/department-consumption', params)
      return res.departments
    },
    topItems: async (params?: { period?: string }): Promise<TopItem[]> => {
      const res = await GET<{ items: TopItem[] }>('/api/reporting/top-items', params)
      return res.items
    },
    stockoutRisk: async (): Promise<StockoutRiskItem[]> => {
      const res = await GET<{ items: StockoutRiskItem[] }>('/api/reporting/stockout-risk')
      return res.items
    },
    periodComparison: () =>
      GET<{ data: PeriodComparison }>('/api/reporting/period-comparison').then((res) => res.data),
    auditLogs: (params?: { page?: number; search?: string }) =>
      GET<{ logs: AuditLog[]; pagination: { totalCount: number; page: number; pageSize: number; totalPages: number } }>('/api/reporting/audit', params),
    inventoryValue: () =>
      GET<InventoryValueResponse>('/api/reporting/inventory-value'),
    historicalConsumption: () =>
      GET<{ totalQuantity: number; totalSpent: number; deptConsumption: any[]; topItems: any[] }>('/api/reporting/historical-consumption'),
    userActivity: (params?: { days?: number }) =>
      GET<UserActivityResponse>('/api/reporting/user-activity', params),
    itemFlow: (params?: { days?: number; itemId?: string }) =>
      GET<ItemFlowResponse>('/api/reporting/item-flow', params as Record<string, string | number | boolean | undefined>),
    machineConsumption: () =>
      GET<{ consumption: any[] }>('/api/reporting/machine-consumption'),
    requisitionsAging: () =>
      GET<{ requisitions: any[] }>('/api/reporting/requisitions-aging'),
    purchaseOrdersTracking: () =>
      GET<{ purchaseOrders: any[] }>('/api/reporting/purchase-orders-tracking'),
    sourcingHistory: () =>
      GET<{ sourcingHistory: any[] }>('/api/reporting/sourcing-history'),
  },

  settings: {
    getFlags: async (): Promise<Record<string, boolean>> => {
      const res = await GET<{ flags: Record<string, boolean> }>('/api/settings/flags')
      return res.flags
    },
    updateFlag: async (key: string, value: boolean): Promise<Record<string, boolean>> => {
      const res = await PATCH<{ flags: Record<string, boolean> }>('/api/settings/flags', { key, value })
      return res.flags
    },
    workflows: {
      list: async (params?: { moduleName?: string }): Promise<any[]> => {
        const res = await GET<{ workflows: any[] }>('/api/settings/workflows', params)
        return res.workflows
      },
      create: async (data: any): Promise<any> => {
        const res = await POST<{ workflow: any }>('/api/settings/workflows', data)
        return res.workflow
      },
      update: async (id: string, data: any): Promise<any> => {
        const res = await PATCH<{ workflow: any }>('/api/settings/workflows', { id, ...data })
        return res.workflow
      },
      reorder: async (updates: Array<{ id: string; sequence: number }>): Promise<void> => {
        await PATCH<void>('/api/settings/workflows', { reorder: updates })
      },
      delete: async (id: string): Promise<void> => {
        await request<void>('DELETE', '/api/settings/workflows', { id })
      },
    },
  },
  notifications: {
    list: async (): Promise<NotificationResponse[]> => {
      const res = await GET<{ notifications: NotificationResponse[] }>('/api/notifications')
      return res.notifications
    },
    markRead: async (id: string): Promise<NotificationResponse> => {
      const res = await PATCH<{ notification: NotificationResponse }>('/api/notifications', { id })
      return res.notification
    },
    markAllRead: async (): Promise<void> => {
      await PATCH('/api/notifications', { readAll: true })
    },
  },
  procurement: {
    suppliers: {
      list: () => GET<{ suppliers: SupplierResponse[] }>('/api/suppliers').then(res => res.suppliers),
      create: (data: Partial<SupplierResponse>) => POST<{ supplier: SupplierResponse }>('/api/suppliers', data).then(res => res.supplier),
    },
    pos: {
      list: () => GET<{ pos: POResponse[] }>('/api/purchase-orders').then(res => res.pos),
      create: (data: {
        linkedSrId: string
        supplierId: string
        notes?: string
        deliveryDate?: string
        paymentTerms?: string
        tax?: number
        transportationCost?: number
        cgstRate?: number
        sgstRate?: number
        igstRate?: number
        items?: Array<{ itemId: string; qty: number; unitPrice: number; discount?: number; taxRate?: number }>
      }) => 
        POST<{ po: POResponse }>('/api/purchase-orders', data).then(res => res.po),
      receive: (id: string) => PATCH<{ po: POResponse }>(`/api/purchase-orders/${id}/receive`).then(res => res.po),
      approve: (id: string) => POST<{ po: POResponse }>(`/api/purchase-orders/${id}/approve`).then(res => res.po),
    },
    invoices: {
      list: () => GET<InvoiceResponse[]>('/api/invoices'),
      create: (data: Partial<InvoiceResponse>) => POST<InvoiceResponse>('/api/invoices', data),
      update: (id: string, data: Partial<InvoiceResponse>) => PATCH<InvoiceResponse>('/api/invoices', { id, ...data }),
      validateOcr: (data: { rawOcrLines?: string[]; rawOcrText?: string; claimedGrandTotal: number }) =>
        POST<InvoiceValidationResponse>('/api/invoice-validation', data),
      extractGemini: (file: File) => {
        const formData = new FormData()
        formData.append('file', file)
        return upload<GeminiInvoiceExtractionResponse>('/api/invoice-extract', formData)
      },
    },
    invoiceIntakes: {
      list: () => GET<InvoiceIntakeResponse[]>('/api/invoice-intakes'),
      process: (data: {
        sourceName?: string
        invoiceNumber?: string
        purchaseOrderId?: string
        rawOcrText: string
        claimedGrandTotal: number
        autoPost?: boolean
        notes?: string
      }) => POST<{ intake: InvoiceIntakeResponse; invoice: InvoiceResponse | null }>('/api/invoice-intakes', data),
      update: (id: string, data: { reviewStatus: 'PENDING' | 'NEEDS_REVIEW' | 'RESOLVED' | 'REJECTED'; notes?: string | null }) =>
        PATCH<InvoiceIntakeResponse>(`/api/invoice-intakes/${id}`, data),
    },
    daily: {
      list: () =>
        GET<{ batches: DailyProcurementBatchResponse[] }>('/api/daily-procurement').then(res => res.batches),
      get: (id: string) =>
        GET<{ batch: DailyProcurementBatchResponse }>(`/api/daily-procurement/${id}`).then(res => res.batch),
      create: (data: {
        deliveryDate: string
        deliveryTimeSlot?: string | null
        requirementCutoffTime?: string
        locationId?: string | null
        deliveryLocation?: string | null
        notes?: string | null
        lines: Array<{
          itemId: string
          operationalRequirement: number
          requiredClosingStock?: number
          finalPurchaseQty?: number
          overrideReason?: string | null
          qualityGrade?: string | null
          itemSpec?: string | null
          storageCondition?: string | null
          deliveryLocation?: string | null
          deliveryTimeSlot?: string | null
          sourceType?: string | null
          sourceRequestId?: string | null
          sourceRequestLineId?: string | null
        }>
      }) => POST<{ batch: DailyProcurementBatchResponse }>('/api/daily-procurement', data).then(res => res.batch),
      sendEnquiries: (id: string, data: {
        supplierIds: string[]
        batchLineIds?: string[]
        sendWhatsApp?: boolean
        language?: string
        notes?: string
      }) => POST<{ enquiries: DailyRateEnquiryResponse[] }>(`/api/daily-procurement/${id}/enquiries`, data).then(res => res.enquiries),
      createQuote: (data: {
        enquiryLineId: string
        supplierId?: string
        originalMessageId?: string | null
        originalMessageText?: string | null
        quotedItemText?: string | null
        matchedItemId?: string
        availableQuantity: number
        quotedRate: number
        quotedUnit: string
        conversionFactor?: number
        conversionApproximate?: boolean
        qualityGrade?: string | null
        transportCharge?: number
        taxRate?: number
        deliveryTime?: string
        validityDateTime?: string
        substituteItem?: string | null
        vendorRemarks?: string | null
        parsingConfidence?: number
        verificationStatus?: string
      }) => POST<{ quote: DailyVendorQuoteResponse }>('/api/daily-procurement/quotes', data).then(res => res.quote),
      allocate: (id: string, data: {
        allocations: Array<{ batchLineId: string; quoteId: string; allocatedQty: number; reason?: string }>
      }) => POST<{ batch: DailyProcurementBatchResponse }>(`/api/daily-procurement/${id}/allocations`, data).then(res => res.batch),
      approve: (id: string, data?: { remarks?: string }) =>
        POST<{ batch: DailyProcurementBatchResponse }>(`/api/daily-procurement/${id}/approve`, data ?? {}).then(res => res.batch),
      sendSupplyOrders: (id: string, data?: { supplyOrderIds?: string[] }) =>
        POST<{ batch: DailyProcurementBatchResponse; supplyOrders: DailySupplyOrderResponse[] }>(
          `/api/daily-procurement/${id}/supply-orders`,
          data ?? {},
        ).then(res => res),
    },
  },
  logistics: {
    challans: {
      list: () => GET<ChallanResponse[]>('/api/challans'),
      create: (data: Partial<ChallanResponse>) => POST<ChallanResponse>('/api/challans', data),
    },
    gatePasses: {
      list: () => GET<GatePassResponse[]>('/api/gate-passes'),
      create: (data: { type: 'IN' | 'OUT'; receiverName: string; vehicleNumber?: string | null; purpose?: string | null; requestId?: string | null; status?: string }) => POST<GatePassResponse>('/api/gate-passes', data),
      update: (id: string, status: string) => PATCH<GatePassResponse>('/api/gate-passes', { id, status }),
    }
  },

  stockTransfers: {
    list: (params?: { status?: string; reconciled?: boolean }) =>
      GET<{ transfers: StockTransferResponse[] }>('/api/stock-transfers', params as Record<string, string | number | boolean | undefined>)
        .then((r) => r.transfers),
    create: (data: {
      fromLocation: string
      toLocation: string
      notes?: string
      items: Array<{ itemId: string; itemName: string; variantId?: string; variantName?: string; qty: number; unit: string }>
    }) => POST<{ transfer: StockTransferResponse }>('/api/stock-transfers', data).then((r) => r.transfer),
    confirm: (id: string) =>
      PATCH<{ transfer: StockTransferResponse }>(`/api/stock-transfers/${id}/confirm`).then((r) => r.transfer),
    reconcile: (id: string, data: { ppPoReference: string }) =>
      PATCH<{ transfer: StockTransferResponse }>(`/api/stock-transfers/${id}/reconcile`, data).then((r) => r.transfer),
    update: (id: string, data: { notes?: string }) =>
      PATCH<{ transfer: StockTransferResponse }>(`/api/stock-transfers/${id}`, data).then((r) => r.transfer),
  },

  variants: {
    list: (itemId: string) =>
      GET<{ variants: ItemVariantResponse[] }>(`/api/items/${itemId}/variants`).then((r) => r.variants),
    create: (itemId: string, data: { name: string; packSize?: string; packQty?: number; unit?: string; barcode?: string; stock?: number }) =>
      POST<{ variant: ItemVariantResponse }>(`/api/items/${itemId}/variants`, data).then((r) => r.variant),
    update: (itemId: string, variantId: string, data: Partial<{ name: string; packSize: string; packQty: number; unit: string; barcode: string | null; stock: number }>) =>
      PATCH<{ variant: ItemVariantResponse }>(`/api/items/${itemId}/variants/${variantId}`, data).then((r) => r.variant),
    delete: (itemId: string, variantId: string) =>
      DELETE<{ variant: ItemVariantResponse }>(`/api/items/${itemId}/variants/${variantId}`).then((r) => r.variant),
  },

  tags: {
    list: () => GET<{ tags: Array<{ id: string; name: string; color: string; itemCount: number }> }>('/api/tags').then(r => r.tags),
    create: (data: { name: string; color?: string }) => POST<{ tag: { id: string; name: string; color: string } }>('/api/tags', data).then(r => r.tag),
    delete: (id: string) => DELETE<{ tag: { id: string } }>(`/api/tags/${id}`).then(r => r.tag),
  },

  itemTags: {
    list: (itemId: string) => GET<{ tags: Array<{ tag: { id: string; name: string; color: string } }> }>(`/api/items/${itemId}/tags`).then(r => r.tags),
    add: (itemId: string, tagId: string) => POST<{ itemTag: object }>(`/api/items/${itemId}/tags`, { tagId }),
    remove: (itemId: string, tagId: string) => request<{ success: boolean }>('DELETE', `/api/items/${itemId}/tags`, { tagId }),
  },

  customFields: {
    list: () => GET<{ fields: Array<{ id: string; name: string; type: string; required: boolean }> }>('/api/custom-fields').then(r => r.fields),
    create: (data: { name: string; type: string; required?: boolean }) => POST<{ field: { id: string; name: string; type: string; required: boolean } }>('/api/custom-fields', data).then(r => r.field),
    delete: (id: string) => request<{ ok: boolean }>('DELETE', '/api/custom-fields', { id }),
  },

  itemCustomFields: {
    get: (itemId: string) => GET<{ values: Record<string, unknown> }>(`/api/items/${itemId}/custom-fields`).then(r => r.values),
    update: (itemId: string, values: Record<string, unknown>) => PATCH<{ values: Record<string, unknown> }>(`/api/items/${itemId}/custom-fields`, { values }).then(r => r.values),
  },

  checkouts: {
    list: (params?: { status?: string; itemId?: string }) =>
      GET<{ checkouts: CheckoutResponse[] }>('/api/checkouts', params as Record<string, string | undefined>).then(r => r.checkouts),
    create: (data: { itemId: string; qty: number; purpose?: string; expectedReturnAt?: string; notes?: string }) =>
      POST<{ checkout: CheckoutResponse }>('/api/checkouts', data).then(r => r.checkout),
    return: (id: string) => PATCH<{ checkout: CheckoutResponse }>(`/api/checkouts/${id}/return`).then(r => r.checkout),
  },

  pickLists: {
    list: (params?: { status?: string }) =>
      GET<{ pickLists: PickListResponse[] }>('/api/pick-lists', params as Record<string, string | undefined>).then(r => r.pickLists),
    create: (data: { name: string; notes?: string; items: Array<{ itemId: string; itemName: string; qty: number; unit: string }> }) =>
      POST<{ pickList: PickListResponse }>('/api/pick-lists', data).then(r => r.pickList),
    get: (id: string) => GET<{ pickList: PickListResponse }>(`/api/pick-lists/${id}`).then(r => r.pickList),
    update: (id: string, data: { status?: string; notes?: string; items?: Array<{ id: string; pickedQty?: number; status?: string }> }) =>
      PATCH<{ pickList: PickListResponse }>(`/api/pick-lists/${id}`, data).then(r => r.pickList),
  },

  labels: {
    get: (itemId: string) => GET<{ item: { id: string; name: string; category: string; unit: string; stock: number }; qrSvg: string }>(`/api/items/${itemId}/label`),
  },

  alerts: {
    list: () => GET<{ alerts: AlertResponse[]; counts: { lowStock: number; maintenance: number; total: number } }>('/api/alerts'),
    send: (data?: { email?: string }) => POST<{ notified: number; emailed: boolean }>('/api/alerts/send', data),
  },

  maintenanceSchedules: {
    list: (params?: { status?: string; itemId?: string }) =>
      GET<{ schedules: MaintenanceScheduleResponse[] }>('/api/maintenance-schedules', params as Record<string, string | undefined>).then(r => r.schedules),
    create: (data: { itemId: string; title: string; dueDate: string; recurringDays?: number; notes?: string }) =>
      POST<{ schedule: MaintenanceScheduleResponse }>('/api/maintenance-schedules', data).then(r => r.schedule),
    update: (id: string, data: { action?: 'complete'; status?: string; notes?: string; dueDate?: string }) =>
      PATCH<{ schedule: MaintenanceScheduleResponse }>(`/api/maintenance-schedules/${id}`, data).then(r => r.schedule),
    delete: (id: string) => DELETE<{ schedule: MaintenanceScheduleResponse }>(`/api/maintenance-schedules/${id}`),
  },

  webhooks: {
    list: () => GET<{ webhooks: WebhookResponse[] }>('/api/webhooks').then(r => r.webhooks),
    create: (data: { name: string; url: string; events: string[]; secret?: string }) =>
      POST<{ webhook: WebhookResponse }>('/api/webhooks', data).then(r => r.webhook),
    update: (id: string, data: { name?: string; url?: string; events?: string[]; active?: boolean; secret?: string }) =>
      PATCH<{ webhook: WebhookResponse }>(`/api/webhooks/${id}`, data).then(r => r.webhook),
    delete: (id: string) => DELETE<{ webhook: WebhookResponse }>(`/api/webhooks/${id}`),
    test: (id: string) => POST<{ ok: boolean }>(`/api/webhooks/${id}`, { action: 'test' }),
  },

  integrations: {
    test: (data: { type: 'slack' | 'teams'; webhookUrl: string }) =>
      POST<{ ok: boolean }>('/api/integrations/test', data),
  },
}
