import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
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
    const userId = searchParams.get('userId');
    const type   = searchParams.get('type');
    const date   = searchParams.get('date');
    const period = searchParams.get('period');

    const where: Prisma.TransactionWhereInput = {};

    // Employees can only see their own transactions
    if (auth.user?.role === 'employee') {
      where.userId = auth.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (type) where.type = type;

    if (date) {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end   = new Date(date); end.setHours(23, 59, 59, 999);
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
