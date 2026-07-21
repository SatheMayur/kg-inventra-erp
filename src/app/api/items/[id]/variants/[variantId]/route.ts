import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';

const variantUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  packSize: z.string().max(50).optional(),
  packQty: z.number().int().min(1).optional(),
  unit: z.string().min(1).max(50).optional(),
  barcode: z.string().max(100).nullable().optional(),
  stock: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin' && auth.user?.role !== 'STORE_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id: itemId, variantId } = await params;

    const existing = await db.itemVariant.findUnique({ where: { id: variantId, itemId } });
    if (!existing) throw new ApiError(404, 'Variant not found', 'NOT_FOUND');

    const body = await request.json();
    const validated = variantUpdateSchema.parse(body);

    const variant = await db.itemVariant.update({
      where: { id: variantId },
      data: validated,
    });

    return NextResponse.json({ variant });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin' && auth.user?.role !== 'STORE_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id: itemId, variantId } = await params;

    const existing = await db.itemVariant.findUnique({ where: { id: variantId, itemId } });
    if (!existing) throw new ApiError(404, 'Variant not found', 'NOT_FOUND');

    const variant = await db.itemVariant.delete({ where: { id: variantId } });

    return NextResponse.json({ variant });
  } catch (error) {
    return handleApiError(error);
  }
}
