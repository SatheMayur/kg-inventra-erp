import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const notifications = await db.notification.findMany({
      where: { userId: auth.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { id, readAll } = body;

    if (readAll) {
      await db.notification.updateMany({
        where: { userId: auth.user!.id, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updated = await db.notification.update({
      where: { id, userId: auth.user!.id },
      data: { read: true },
    });

    return NextResponse.json({ notification: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
