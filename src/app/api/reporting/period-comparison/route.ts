import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      thisMonthOut, lastMonthOut,
      thisMonthRequests, lastMonthRequests,
      thisMonthIssued, lastMonthIssued,
      thisMonthTxnCount, lastMonthTxnCount,
    ] = await Promise.all([
      db.transaction.aggregate({ _sum: { qty: true }, where: { type: 'OUT', date: { gte: thisMonthStart } } }),
      db.transaction.aggregate({ _sum: { qty: true }, where: { type: 'OUT', date: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      db.request.count({ where: { createdAt: { gte: thisMonthStart } } }),
      db.request.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      db.request.count({ where: { status: 'Issued', issuedAt: { gte: thisMonthStart } } }),
      db.request.count({ where: { status: 'Issued', issuedAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      db.transaction.count({ where: { date: { gte: thisMonthStart } } }),
      db.transaction.count({ where: { date: { gte: lastMonthStart, lte: lastMonthEnd } } }),
    ]);

    const thisQty = thisMonthOut._sum.qty ?? 0;
    const lastQty = lastMonthOut._sum.qty ?? 0;
    const changePct = lastQty === 0
      ? (thisQty > 0 ? 100 : 0)
      : Math.round(((thisQty - lastQty) / lastQty) * 1000) / 10;

    return NextResponse.json({
      data: {
        thisMonth: { qty: thisQty, count: thisMonthTxnCount, requests: thisMonthRequests, issued: thisMonthIssued },
        lastMonth: { qty: lastQty, count: lastMonthTxnCount, requests: lastMonthRequests, issued: lastMonthIssued },
        changePct,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
