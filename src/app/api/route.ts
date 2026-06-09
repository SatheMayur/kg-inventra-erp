import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Inventra API',
    version: '1.0.0',
    status: 'ok',
    endpoints: {
      health: '/api/health',
      auth: {
        login: '/api/auth/login',
        logout: '/api/auth/logout',
        seed: '/api/auth/seed',
      },
      items: {
        list: '/api/items',
        detail: '/api/items/:id',
        restock: '/api/items/:id/restock',
        categories: '/api/items/categories',
        bulk: '/api/items/bulk',
      },
      requests: {
        list: '/api/requests',
        approve: '/api/requests/:id/approve',
        reject: '/api/requests/:id/reject',
        cancel: '/api/requests/:id/cancel',
        issue: '/api/requests/:id/issue',
      },
      transactions: '/api/transactions',
      users: {
        list: '/api/users',
        detail: '/api/users/:id',
        resetPassword: '/api/users/:id/reset-password',
        toggleActive: '/api/users/:id/toggle-active',
      },
      procurement: {
        purchaseOrders: '/api/purchase-orders',
        receive: '/api/purchase-orders/:id/receive',
        suppliers: '/api/suppliers',
        invoices: '/api/invoices',
      },
      logistics: {
        gatePasses: '/api/gate-passes',
        challans: '/api/challans',
      },
      notifications: '/api/notifications',
      settings: {
        flags: '/api/settings/flags',
      },
      reporting: {
        dashboard: '/api/reporting/dashboard',
        stockoutRisk: '/api/reporting/stockout-risk',
        topItems: '/api/reporting/top-items',
        periodComparison: '/api/reporting/period-comparison',
        departmentConsumption: '/api/reporting/department-consumption',
        audit: '/api/reporting/audit',
      },
    },
  });
}
