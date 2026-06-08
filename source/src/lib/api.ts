// Typed API client for Inventra backend

import { useAppStore } from './store'

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

  // Add token if available
  const token = useAppStore.getState().token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
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
    const err = new Error(msg)
      ; (err as any).status = res.status
      ; (err as any).type = error.type
      ; (err as any).data = error

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
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RequestResponse {
  id: string
  userId: string
  employee: string
  department: string
  itemId: string
  itemName: string
  qty: number
  note: string | null
  status: 'Pending' | 'Approved' | 'Issued' | 'Rejected' | 'Cancelled'
  issuedAt: string | null
  issuedBy: string | null
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
  role: 'admin' | 'employee'
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
}

export interface POResponse {
  id: string
  poNumber: string
  supplierId: string
  status: 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED'
  totalAmount: number
  notes: string | null
  createdAt: string
  updatedAt: string
  supplier: SupplierResponse
  items: Array<{
    id: string
    itemId: string
    qty: number
    unitPrice: number
    item: ItemResponse
  }>
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

export interface PetpoojaPOResponse {
  poId: string
  poNo: string
  poDate: string
  vendorName: string
  totalAmount: number
  status: string
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

export const api = {
  auth: {
    login: (empId: string, password: string) =>
      POST<{ user: { id: string; empId: string; name: string; department: string; floor: string; role: 'admin' | 'employee'; active: boolean } }>('/api/auth/login', { empId, password }),
    logout: () => POST<{ success: boolean }>('/api/auth/logout', {}),
    seed: () => POST<{ message: string; seeded: boolean }>('/api/auth/seed', {}),
  },

  items: {
    list: async (params?: {
      category?: string
      stock?: string
      search?: string
      includeDeleted?: boolean
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
    }): Promise<ItemResponse> => {
      const res = await POST<{ item: ItemResponse }>('/api/items', data)
      return res.item
    },
    update: async (id: string, data: {
      name?: string
      category?: string
      unit?: string
      minStock?: number
    }): Promise<ItemResponse> => {
      const res = await PATCH<{ item: ItemResponse }>(`/api/items/${id}`, data)
      return res.item
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
      itemId: string
      qty: number
      note?: string
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
    issue: async (id: string, expectedVersion: number, issuedBy: string, userId: string): Promise<{ request: RequestResponse; item: ItemResponse }> => {
      const res = await PATCH<{ request: RequestResponse; item: ItemResponse }>(`/api/requests/${id}/issue`, { expectedVersion, issuedBy, userId })
      return res
    },
  },

  transactions: {
    list: async (params?: {
      userId?: string
      type?: string
      date?: string
      period?: string
    }): Promise<TransactionResponse[]> => {
      const res = await GET<{ transactions: TransactionResponse[] }>('/api/transactions', params)
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
    userActivity: (params?: { days?: number }) =>
      GET<UserActivityResponse>('/api/reporting/user-activity', params),
    itemFlow: (params?: { days?: number; itemId?: string }) =>
      GET<ItemFlowResponse>('/api/reporting/item-flow', params as Record<string, string | number | boolean | undefined>),
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
      create: (data: { supplierId: string, notes?: string, totalAmount?: number, items: Array<{ itemId: string, qty: number, unitPrice: number }> }) =>
        POST<{ po: POResponse }>('/api/purchase-orders', data).then(res => res.po),
      receive: (id: string) => PATCH<{ po: POResponse }>(`/api/purchase-orders/${id}/receive`).then(res => res.po),
    },
    invoices: {
      list: () => GET<InvoiceResponse[]>('/api/invoices'),
      create: (data: Partial<InvoiceResponse>) => POST<InvoiceResponse>('/api/invoices', data),
      update: (id: string, data: Partial<InvoiceResponse>) => PATCH<InvoiceResponse>('/api/invoices', { id, ...data }),
    }
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
    reconcile: (id: string, ppPoReference: string) =>
      PATCH<{ transfer: StockTransferResponse }>(`/api/stock-transfers/${id}/reconcile`, { ppPoReference }).then((r) => r.transfer),
    update: (id: string, data: { ppPoReference?: string; notes?: string }) =>
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

  petpooja: {
    ping: () => GET<{ ok: boolean; restaurantName?: string; error?: string }>('/api/petpooja/ping'),
    purchaseOrders: (from?: string, to?: string) =>
      GET<{ purchaseOrders: PetpoojaPOResponse[] }>(
        '/api/petpooja/purchase-orders',
        { from, to } as Record<string, string | undefined>
      ).then((r) => r.purchaseOrders),
  },

  tags: {
    list: () => GET<{ tags: Array<{ id: string; name: string; color: string; itemCount: number }> }>('/api/tags').then(r => r.tags),
    create: (data: { name: string; color?: string }) => POST<{ tag: { id: string; name: string; color: string } }>('/api/tags', data).then(r => r.tag),
    delete: (id: string) => DELETE<{ tag: { id: string } }>(`/api/tags/${id}`).then(r => r.tag),
  },

  itemTags: {
    list: (itemId: string) => GET<{ tags: Array<{ tag: { id: string; name: string; color: string } }> }>(`/api/items/${itemId}/tags`).then(r => r.tags),
    add: (itemId: string, tagId: string) => POST<{ itemTag: object }>(`/api/items/${itemId}/tags`, { tagId }),
    remove: (itemId: string, tagId: string) => POST<{ success: boolean }>(`/api/items/${itemId}/tags`, { tagId, _method: 'DELETE' }),
  },

  customFields: {
    list: () => GET<{ fields: Array<{ id: string; name: string; type: string; required: boolean }> }>('/api/custom-fields').then(r => r.fields),
    create: (data: { name: string; type: string; required?: boolean }) => POST<{ field: { id: string; name: string; type: string; required: boolean } }>('/api/custom-fields', data).then(r => r.field),
    delete: (id: string) => POST<{ success: boolean }>('/api/custom-fields', { id, _method: 'DELETE' }),
  },

  itemCustomFields: {
    get: (itemId: string) => GET<{ values: Record<string, unknown> }>(`/api/items/${itemId}/custom-fields`).then(r => r.values),
    update: (itemId: string, values: Record<string, unknown>) => PATCH<{ values: Record<string, unknown> }>(`/api/items/${itemId}/custom-fields`, { values }).then(r => r.values),
  },

  checkouts: {
    list: (params?: { status?: string; itemId?: string }) =>
      GET<{ checkouts: unknown[] }>('/api/checkouts', params as Record<string, string | undefined>).then(r => r.checkouts),
    create: (data: { itemId: string; qty: number; purpose?: string; expectedReturnAt?: string; notes?: string }) =>
      POST<{ checkout: unknown }>('/api/checkouts', data).then(r => r.checkout),
    return: (id: string) => PATCH<{ checkout: unknown }>(`/api/checkouts/${id}/return`).then(r => r.checkout),
  },

  pickLists: {
    list: (params?: { status?: string }) =>
      GET<{ pickLists: unknown[] }>('/api/pick-lists', params as Record<string, string | undefined>).then(r => r.pickLists),
    create: (data: { name: string; notes?: string; items: Array<{ itemId: string; itemName: string; qty: number; unit: string }> }) =>
      POST<{ pickList: unknown }>('/api/pick-lists', data).then(r => r.pickList),
    get: (id: string) => GET<{ pickList: unknown }>(`/api/pick-lists/${id}`).then(r => r.pickList),
    update: (id: string, data: { status?: string; notes?: string; items?: Array<{ id: string; pickedQty?: number; status?: string }> }) =>
      PATCH<{ pickList: unknown }>(`/api/pick-lists/${id}`, data).then(r => r.pickList),
  },

  labels: {
    get: (itemId: string) => GET<{ item: { id: string; name: string; category: string; unit: string; stock: number }; qrSvg: string }>(`/api/items/${itemId}/label`),
  },

  alerts: {
    list: () => GET<{ alerts: unknown[]; counts: { lowStock: number; maintenance: number; total: number } }>('/api/alerts'),
    send: (data?: { email?: string }) => POST<{ notified: number; emailed: boolean }>('/api/alerts/send', data),
  },

  maintenanceSchedules: {
    list: (params?: { status?: string; itemId?: string }) =>
      GET<{ schedules: unknown[] }>('/api/maintenance-schedules', params as Record<string, string | undefined>).then(r => r.schedules),
    create: (data: { itemId: string; title: string; dueDate: string; recurringDays?: number; notes?: string }) =>
      POST<{ schedule: unknown }>('/api/maintenance-schedules', data).then(r => r.schedule),
    update: (id: string, data: { action?: 'complete'; status?: string; notes?: string; dueDate?: string }) =>
      PATCH<{ schedule: unknown }>(`/api/maintenance-schedules/${id}`, data).then(r => r.schedule),
    delete: (id: string) => DELETE<{ schedule: unknown }>(`/api/maintenance-schedules/${id}`),
  },

  webhooks: {
    list: () => GET<{ webhooks: Array<{ id: string; name: string; url: string; events: string; active: boolean; secret: string | null; createdAt: string }> }>('/api/webhooks').then(r => r.webhooks),
    create: (data: { name: string; url: string; events: string[]; secret?: string }) =>
      POST<{ webhook: unknown }>('/api/webhooks', data).then(r => r.webhook),
    update: (id: string, data: { name?: string; url?: string; events?: string[]; active?: boolean; secret?: string }) =>
      PATCH<{ webhook: unknown }>(`/api/webhooks/${id}`, data).then(r => r.webhook),
    delete: (id: string) => DELETE<{ webhook: unknown }>(`/api/webhooks/${id}`),
    test: (id: string) => POST<{ ok: boolean }>(`/api/webhooks/${id}`, { action: 'test' }),
  },

  integrations: {
    test: (data: { type: 'slack' | 'teams'; webhookUrl: string }) =>
      POST<{ ok: boolean }>('/api/integrations/test', data),
  },
}
