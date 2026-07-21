import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { getKolkataDateBounds } from '@/lib/date-utils';

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
    const userId = searchParams.get('userId');
    const type   = searchParams.get('type');
    const date   = searchParams.get('date');
    const period = searchParams.get('period');
    const itemId = searchParams.get('itemId');

    const where: Prisma.TransactionWhereInput = {};

    // Department requesters only see their own ledger activity. Department heads
    // are scoped to their department; operational/reporting roles can see all.
    if (auth.user?.role === 'employee' || auth.user?.role === 'DEPT_USER') {
      where.userId = auth.user.id;
    } else if (auth.user?.role === 'DEPT_HEAD') {
      where.user = { department: auth.user.department };
      if (userId) where.userId = userId;
    } else if (userId) {
      where.userId = userId;
    }

    if (type) where.type = type;
    if (itemId) where.itemId = itemId;

    if (date) {
      const { start, end } = getKolkataDateBounds(date);
      where.date = { gte: start, lte: end };
    } else if (period && period !== 'all' && PERIOD_MS[period]) {
      where.date = { gte: new Date(Date.now() - PERIOD_MS[period]) };
    }

    const transactions = await db.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 500, // cap to prevent unbounded queries
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    return handleApiError(error);
  }
}
