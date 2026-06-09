import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    // Allow unauthenticated reads of flags (useful for public UI); only block non-401 errors
    const auth = await authorize(request);
    if (auth.error && auth.status !== 401) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const flags = await db.featureFlag.findMany({ orderBy: { key: 'asc' }, take: 100 });
    const flagsMap: Record<string, boolean> = {};
    for (const flag of flags) flagsMap[flag.key] = flag.value;

    return NextResponse.json({ flags: flagsMap });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin'], { rootOnly: true });
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { key, value } = body;

    if (!key || typeof value !== 'boolean') {
      throw new ApiError(400, 'key and value (boolean) are required', 'BAD_REQUEST');
    }

    const flag = await db.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new ApiError(404, 'Feature flag not found', 'NOT_FOUND');

    await db.featureFlag.update({ where: { key }, data: { value } });

    const allFlags = await db.featureFlag.findMany({ orderBy: { key: 'asc' } });
    const flagsMap: Record<string, boolean> = {};
    for (const f of allFlags) flagsMap[f.key] = f.value;

    return NextResponse.json({ flags: flagsMap });
  } catch (error) {
    return handleApiError(error);
  }
}
