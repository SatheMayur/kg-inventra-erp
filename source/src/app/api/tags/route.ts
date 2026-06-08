import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';

const createTagSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  color: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const tags = await db.tag.findMany({
      include: { items: { select: { itemId: true } } },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      tags: tags.map((t) => ({ ...t, itemCount: t.items.length })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const validated = createTagSchema.parse(body);

    const existing = await db.tag.findUnique({ where: { name: validated.name } });
    if (existing) throw new ApiError(409, `Tag "${validated.name}" already exists`, 'CONFLICT');

    const tag = await db.tag.create({
      data: {
        name: validated.name,
        color: validated.color ?? '#6366f1',
      },
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
