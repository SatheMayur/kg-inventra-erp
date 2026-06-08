import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import QRCode from 'qrcode';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const item = await db.item.findUnique({ where: { id } });
    if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    const qrSvg = await QRCode.toString(item.id, { type: 'svg', margin: 1 });

    return NextResponse.json({
      item: {
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        stock: item.stock,
      },
      qrSvg,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
