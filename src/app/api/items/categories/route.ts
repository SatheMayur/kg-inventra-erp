import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { ensureDefaultDailyCategories, normalizeItemName } from '@/lib/item-master';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const categories = await db.$transaction(async (tx) => {
      await ensureDefaultDailyCategories(tx);

      const [masterRows, legacyRows] = await Promise.all([
        tx.itemCategory.findMany({
          where: { active: true },
          select: { name: true },
          orderBy: { name: 'asc' },
        }),
        tx.item.findMany({
          where: { deletedAt: null, active: true },
          select: { category: true },
          distinct: ['category'],
          orderBy: { category: 'asc' },
        }),
      ]);

      const merged = new Map<string, string>();
      for (const row of masterRows) merged.set(normalizeItemName(row.name), row.name);
      for (const row of legacyRows) merged.set(normalizeItemName(row.category), row.category);
      return [...merged.values()].sort((a, b) => a.localeCompare(b));
    });

    return NextResponse.json({ categories });
  } catch (error) {
    return handleApiError(error);
  }
}
