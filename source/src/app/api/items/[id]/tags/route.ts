import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';

const tagIdSchema = z.object({
  tagId: z.string().min(1),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const itemTags = await db.itemTag.findMany({
      where: { itemId: id },
      include: { tag: true },
    });

    return NextResponse.json({ tags: itemTags.map((it) => it.tag) });
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

    const { id } = await params;
    const body = await request.json();
    const { tagId } = tagIdSchema.parse(body);

    const item = await db.item.findUnique({ where: { id, deletedAt: null } });
    if (!item) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    const tag = await db.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new ApiError(404, 'Tag not found', 'NOT_FOUND');

    await db.itemTag.upsert({
      where: { itemId_tagId: { itemId: id, tagId } },
      create: { itemId: id, tagId },
      update: {},
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin' && auth.user?.role !== 'STORE_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const { tagId } = tagIdSchema.parse(body);

    const existing = await db.itemTag.findUnique({
      where: { itemId_tagId: { itemId: id, tagId } },
    });
    if (!existing) throw new ApiError(404, 'Tag not assigned to this item', 'NOT_FOUND');

    await db.itemTag.delete({ where: { itemId_tagId: { itemId: id, tagId } } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
