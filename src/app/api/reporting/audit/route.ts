import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin'], { rootOnly: true });
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const search = searchParams.get('search') || '';

    const where = search
      ? {
          OR: [
            { action: { contains: search, mode: 'insensitive' as const } },
            { userName: { contains: search, mode: 'insensitive' as const } },
            { targetName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [totalCount, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        totalCount,
        page,
        pageSize: PAGE_SIZE,
        totalPages: Math.ceil(totalCount / PAGE_SIZE),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
