import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin', 'STORE_ADMIN', 'MANAGEMENT']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10) || 30, 1), 365);

    const since = new Date(Date.now() - days * 86400000);

    const logs = await db.auditLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Group by userName
    const userMap: Record<string, { actionCount: number; actions: Record<string, number> }> = {};
    for (const log of logs) {
      const key = log.userName || log.userId || 'Unknown';
      if (!userMap[key]) userMap[key] = { actionCount: 0, actions: {} };
      userMap[key].actionCount += 1;
      userMap[key].actions[log.action] = (userMap[key].actions[log.action] ?? 0) + 1;
    }

    const users = Object.entries(userMap)
      .map(([userName, vals]) => ({ userName, ...vals }))
      .sort((a, b) => b.actionCount - a.actionCount);

    return NextResponse.json(
      { users, totalActions: logs.length, period: days },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
