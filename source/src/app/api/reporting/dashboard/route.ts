import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const requestWhere: Prisma.RequestWhereInput = {};
    if (userId) requestWhere.userId = userId;

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
      db.request.count({ where: { ...requestWhere, status: 'Pending' } }),
      db.request.count({ where: { ...requestWhere, status: 'Approved' } }),
      db.request.count({ where: { ...requestWhere, status: 'Issued' } }),
      db.request.count({ where: requestWhere }),
      db.transaction.count({ where: userId ? { userId } : {} }),
      db.request.findMany({
        where: requestWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, employee: true, department: true, itemName: true,
          qty: true, status: true, createdAt: true,
        },
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
        recentRequests,
        recentTransactions,
        lowStockItems: filteredLowStock.map((item) => ({
          ...item,
          available: item.stock - item.reservedQty,
        })),
      },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
