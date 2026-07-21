import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { getKolkataDateString } from '@/lib/date-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10) || 30, 1), 365);
    const itemId = searchParams.get('itemId') || undefined;

    const since = new Date(Date.now() - days * 86400000);

    const txns = await db.transaction.findMany({
      where: {
        createdAt: { gte: since },
        ...(itemId ? { itemId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { itemId: true, itemName: true, type: true, qty: true, date: true, createdAt: true },
    });

    // Group by date (daily)
    const dailyMap: Record<string, { inQty: number; outQty: number }> = {};
    for (const t of txns) {
      const dateKey = getKolkataDateString(t.date ?? t.createdAt);
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { inQty: 0, outQty: 0 };
      if (t.type === 'IN') dailyMap[dateKey].inQty += t.qty;
      else dailyMap[dateKey].outQty += t.qty;
    }
    const daily = Object.entries(dailyMap)
      .map(([date, vals]) => ({ date, ...vals, net: vals.inQty - vals.outQty }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Group by item — top 10 by volume
    const itemMap: Record<string, { totalIn: number; totalOut: number }> = {};
    for (const t of txns) {
      const key = t.itemName;
      if (!itemMap[key]) itemMap[key] = { totalIn: 0, totalOut: 0 };
      if (t.type === 'IN') itemMap[key].totalIn += t.qty;
      else itemMap[key].totalOut += t.qty;
    }
    const byItem = Object.entries(itemMap)
      .map(([itemName, vals]) => ({ itemName, ...vals, net: vals.totalIn - vals.totalOut }))
      .sort((a, b) => (b.totalIn + b.totalOut) - (a.totalIn + a.totalOut))
      .slice(0, 10);

    const totalIn = txns.filter((t) => t.type === 'IN').reduce((s, t) => s + t.qty, 0);
    const totalOut = txns.filter((t) => t.type === 'OUT').reduce((s, t) => s + t.qty, 0);

    return NextResponse.json(
      { daily, byItem, totalIn, totalOut },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
