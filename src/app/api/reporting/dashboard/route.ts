import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const user = auth.user!;
    const isDeptHead = user.role === 'DEPT_HEAD' || user.isDeptHead;
    const isStore = user.role === 'STORE_ADMIN' || user.role === 'STORE_OPERATOR';
    const isPurchase = user.role === 'PURCHASE_USER';
    const isManagement = user.role === 'admin' || user.role === 'MANAGEMENT';

    const requestWhere: Prisma.RequestWhereInput = {};
    if (userId) {
      requestWhere.userId = userId;
    } else if (isManagement) {
      // Management: see all
    } else if (isStore) {
      requestWhere.status = {
        in: [
          'Approved', 'PartiallyIssued', 'ReadyForPickup', 'Issued', 'CONVERTED_TO_PO',
          'PENDING_STORE_REVIEW', 'STOCK_AVAILABLE', 'ISSUE_PENDING', 'COMPLETED'
        ]
      };
    } else if (isPurchase) {
      requestWhere.status = {
        in: ['PURCHASE_REQUIRED', 'CONVERTED_TO_PO']
      };
    } else if (isDeptHead) {
      requestWhere.department = user.department;
    } else {
      requestWhere.userId = user.id;
    }

    const [
      totalItems,
      stockAgg,
      outOfStockCount,
      lowStockItems,
      pendingCount,
      approvedCount,
      issuedCount,
      totalRequests,
      totalTransactions,
      recentRequests,
      recentTransactions,
    ] = await Promise.all([
      db.item.count({ where: { deletedAt: null } }),
      db.item.aggregate({ where: { deletedAt: null }, _sum: { stock: true } }),
      db.item.count({ where: { deletedAt: null, stock: 0 } }),
      db.item.findMany({
        where: { deletedAt: null, stock: { gt: 0 } },
        select: { id: true, name: true, category: true, stock: true, minStock: true, reservedQty: true },
        orderBy: { stock: 'asc' },
        take: 20,
      }),
      db.request.count({
        where: {
          ...requestWhere,
          status: {
            in: ['Pending', 'SUBMITTED', 'Pending Department Approval', 'PENDING_DEPT_APPROVAL', 'UNDER_REVIEW']
          }
        }
      }),
      db.request.count({
        where: {
          ...requestWhere,
          status: {
            in: [
              'Approved', 'PENDING_STORE_REVIEW', 'STOCK_AVAILABLE', 'ISSUE_PENDING',
              'PARTIALLY_ISSUED', 'PartiallyIssued', 'ReadyForPickup', 'READY_FOR_PICKUP'
            ]
          }
        }
      }),
      db.request.count({
        where: {
          ...requestWhere,
          status: {
            in: ['Issued', 'COMPLETED']
          }
        }
      }),
      db.request.count({ where: requestWhere }),
      db.transaction.count({ where: userId ? { userId } : {} }),
      db.request.findMany({
        where: requestWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { lines: true },
      }),
      db.transaction.findMany({
        where: userId ? { userId } : {},
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          id: true, type: true, itemName: true, qty: true,
          reference: true, date: true, createdAt: true,
        },
      }),
    ]);

    const filteredLowStock = lowStockItems.filter(
      (item) => item.stock - item.reservedQty <= item.minStock
    );

    return NextResponse.json(
      {
        totalItems,
        totalStock: stockAgg._sum.stock ?? 0,
        lowStockCount: filteredLowStock.length,
        outOfStockCount,
        pendingCount,
        approvedCount,
        issuedCount,
        totalRequests,
        totalTransactions,
        recentRequests: recentRequests.map((r) => ({
          ...r,
          itemName: r.lines.map((line) => line.itemName).join(', '),
          qty: r.lines.reduce((sum, line) => sum + line.requestedQty, 0),
        })),
        recentTransactions,
        lowStockItems: filteredLowStock.map((item) => ({
          ...item,
          available: item.stock - item.reservedQty,
        })),
      },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    );
  } catch (error) {
    console.error('[reporting/dashboard] falling back to empty dashboard:', error);
    return NextResponse.json(
      {
        totalItems: 0,
        totalStock: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        pendingCount: 0,
        approvedCount: 0,
        issuedCount: 0,
        totalRequests: 0,
        totalTransactions: 0,
        recentRequests: [],
        recentTransactions: [],
        lowStockItems: [],
      },
      { headers: { 'Cache-Control': 'private, max-age=10' } }
    );
  }
}
