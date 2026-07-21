import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';

const variantSchema = z.object({
  name: z.string().min(1, 'Name required').max(200),
  packSize: z.string().max(50).default(''),
  packQty: z.number().int().min(1).default(1),
  unit: z.string().min(1).max(50).default('pcs'),
  barcode: z.string().max(100).optional(),
  stock: z.number().int().min(0).default(0),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id: itemId } = await params;

    const variants = await db.itemVariant.findMany({
      where: { itemId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ variants });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin' && auth.user?.role !== 'STORE_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id: itemId } = await params;

    const item = await db.item.findUnique({ where: { id: itemId, deletedAt: null } });
    if (!item) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    const body = await request.json();
    const validated = variantSchema.parse(body);

    const variant = await db.itemVariant.create({
      data: { ...validated, itemId },
    });

    await createAuditLog({
      action: 'CREATE_VARIANT',
      user: auth.user,
      targetId: item.id,
      targetName: item.name,
      metadata: { variantName: variant.name, packSize: variant.packSize, packQty: variant.packQty },
    });

    return NextResponse.json({ variant }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
