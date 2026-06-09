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
      : new Date(0);

    const transactions = await db.transaction.findMany({
      where: { type: 'OUT', date: { gte: startDate } },
      select: { itemId: true, itemName: true, qty: true },
    });

    const itemMap: Record<string, { itemName: string; qty: number }> = {};
    for (const txn of transactions) {
      if (!itemMap[txn.itemId]) itemMap[txn.itemId] = { itemName: txn.itemName, qty: 0 };
      itemMap[txn.itemId].qty += txn.qty;
    }

    const items = Object.values(itemMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}
