import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';

const DEFAULT_FLAGS: Record<string, boolean> = {
  csvExport: true,
  tooltips: true,
  reporting: true,
  barcode: false,
};

function toFlagsMap(flags: Array<{ key: string; value: boolean }>) {
  const flagsMap: Record<string, boolean> = { ...DEFAULT_FLAGS };
  for (const flag of flags) flagsMap[flag.key] = flag.value;
  return flagsMap;
}

export async function GET(request: NextRequest) {
  try {
    const flags = await db.featureFlag.findMany({ orderBy: { key: 'asc' }, take: 100 });
    const flagsMap = toFlagsMap(flags);

    return NextResponse.json({ flags: flagsMap });
  } catch (error) {
    console.error('[settings/flags] falling back to defaults:', error);
    return NextResponse.json({ flags: DEFAULT_FLAGS });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin', 'STORE_ADMIN'], { rootOnly: true });
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { key, value } = body;

    if (!key || typeof value !== 'boolean') {
      throw new ApiError(400, 'key and value (boolean) are required', 'BAD_REQUEST');
    }

    const flag = await db.featureFlag.findUnique({ where: { key } });
    if (flag) {
      await db.featureFlag.update({ where: { key }, data: { value } });
    } else {
      await db.featureFlag.create({ data: { key, value } });
    }

    const allFlags = await db.featureFlag.findMany({ orderBy: { key: 'asc' } });
    const flagsMap = toFlagsMap(allFlags);

    return NextResponse.json({ flags: flagsMap });
  } catch (error) {
    return handleApiError(error);
  }
}
