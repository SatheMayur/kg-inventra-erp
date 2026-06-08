import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [items, consumptionGroups] = await Promise.all([
      db.item.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, stock: true, reservedQty: true, minStock: true, unit: true },
      }),
      db.transaction.groupBy({
        by: ['itemId'],
        where: { type: 'OUT', date: { gte: thirtyDaysAgo } },
        _sum: { qty: true },
      }),
    ]);

    const consumptionMap: Record<string, number> = {};
    for (const g of consumptionGroups) {
      consumptionMap[g.itemId] = g._sum.qty ?? 0;
    }

    const riskItems = items
      .map((item) => {
        const totalConsumed = consumptionMap[item.id] || 0;
        const dailyRate = totalConsumed / 30;
        const available = item.stock - item.reservedQty;

        let daysLeft: number | null = null;
        let status: 'critical' | 'warning' | 'ok' | 'insufficient' = 'ok';

        if (dailyRate > 0) {
          daysLeft = Math.floor(available / dailyRate);
          if (daysLeft <= 7) status = 'critical';
          else if (daysLeft <= 14) status = 'warning';
          else status = 'ok';
        } else if (available === 0) {
          daysLeft = 0;
          status = 'critical';
        } else {
          status = 'insufficient';
        }

        return {
          id: item.id,
          name: item.name,
          stock: item.stock,
          unit: item.unit,
          daysLeft,
          rate: Math.round(dailyRate * 10) / 10,
          status,
        };
      })
      .filter((item) => item.status !== 'ok')
      .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));

    return NextResponse.json({ items: riskItems }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    return handleApiError(error);
  }
}
