import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const items = await db.item.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, category: true, stock: true, price: true },
    });

    const totalValue = items.reduce((sum, item) => sum + item.stock * (item.price ?? 0), 0);

    // Group by category
    const categoryMap: Record<string, { itemCount: number; totalStock: number; totalValue: number }> = {};
    for (const item of items) {
      const cat = item.category || 'Uncategorized';
      if (!categoryMap[cat]) categoryMap[cat] = { itemCount: 0, totalStock: 0, totalValue: 0 };
      categoryMap[cat].itemCount += 1;
      categoryMap[cat].totalStock += item.stock;
      categoryMap[cat].totalValue += item.stock * (item.price ?? 0);
    }
    const byCategory = Object.entries(categoryMap)
      .map(([category, vals]) => ({ category, ...vals }))
      .sort((a, b) => b.totalValue - a.totalValue);

    // Top 10 items by value
    const topByValue = items
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        stock: item.stock,
        price: item.price ?? 0,
        value: item.stock * (item.price ?? 0),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return NextResponse.json(
      { totalValue, byCategory, topByValue },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
