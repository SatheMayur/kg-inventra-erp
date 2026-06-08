import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';

const updateSchema = z.object({
  ppPoReference: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;

    const transfer = await db.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!transfer) throw new ApiError(404, 'Transfer not found', 'NOT_FOUND');

    return NextResponse.json({ transfer });
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
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;

    const existing = await db.stockTransfer.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Transfer not found', 'NOT_FOUND');

    const body = await request.json();
    const validated = updateSchema.parse(body);

    const transfer = await db.stockTransfer.update({
      where: { id },
      data: validated,
      include: { items: true },
    });

    return NextResponse.json({ transfer });
  } catch (error) {
    return handleApiError(error);
  }
}
