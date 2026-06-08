import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

const PERIOD_MS: Record<string, number> = {
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const startDate = PERIOD_MS[period]
      ? new Date(Date.now() - PERIOD_MS[period])
      : new Date(0); // 'all'

    const transactions = await db.transaction.findMany({
      where: { type: 'OUT', date: { gte: startDate } },
      include: { 
        user: { select: { department: true } },
        item: { select: { price: true } }
      },
    });

    const deptMap: Record<string, { qty: number, spending: number }> = {};
    for (const txn of transactions) {
      const dept = txn.user?.department || 'Unknown';
      if (!deptMap[dept]) {
        deptMap[dept] = { qty: 0, spending: 0 };
      }
      deptMap[dept].qty += txn.qty;
      deptMap[dept].spending += txn.qty * (txn.item?.price || 0);
    }

    const departments = Object.entries(deptMap)
      .map(([department, data]) => ({ 
        department, 
        qty: data.qty,
        spending: Math.round(data.spending * 100) / 100 
        // Note: spending is calculated based on current item prices. 
        // In a production audit system, we would store historical price at transaction time.
      }))
      .sort((a, b) => b.spending - a.spending);

    return NextResponse.json({ departments }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    return handleApiError(error);
  }
}
