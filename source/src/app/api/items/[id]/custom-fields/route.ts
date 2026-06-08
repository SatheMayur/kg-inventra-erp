import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { Prisma } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const item = await db.item.findUnique({ where: { id }, select: { customFields: true } });
    if (!item) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    return NextResponse.json({ values: (item.customFields as Record<string, unknown>) ?? {} });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const body = await request.json();
    const { values } = body as { values?: Record<string, unknown> };

    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new ApiError(400, 'values must be an object', 'BAD_REQUEST');
    }

    const item = await db.item.findUnique({ where: { id }, select: { customFields: true } });
    if (!item) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    const existing = (item.customFields as Record<string, unknown>) ?? {};
    const merged = { ...existing, ...values };

    await db.item.update({ where: { id }, data: { customFields: merged as Prisma.InputJsonValue } });

    return NextResponse.json({ values: merged });
  } catch (error) {
    return handleApiError(error);
  }
}
