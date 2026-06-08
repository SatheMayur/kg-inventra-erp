import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { itemSchema } from '@/lib/validation';
import { createAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    
    // Pagination params — cap pageSize to prevent unbounded queries
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '10')));
    const skip = (page - 1) * pageSize;

    const where: Prisma.ItemWhereInput = {
      deletedAt: null,
    };

    if (category && category !== 'All') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { category: { contains: search } },
      ];
    }

    const [totalCount, items] = await Promise.all([
      db.item.count({ where }),
      db.item.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      })
    ]);

    return NextResponse.json(
      { items, pagination: { totalCount, page, pageSize, totalPages: Math.ceil(totalCount / pageSize) } },
      { headers: { 'Cache-Control': 'private, max-age=15' } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = itemSchema.parse(body);

    // Check for duplicate active items (manual check since SQLite NULLs don't block unique constraints effectively for our soft-delete)
    const existing = await db.item.findFirst({
      where: {
        name: { equals: validated.name },
        category: { equals: validated.category },
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ApiError(409, `An item named "${validated.name}" already exists in category "${validated.category}"`, 'CONFLICT');
    }

    const item = await db.item.create({
      data: {
        ...validated,
        reservedQty: 0,
        version: 1,
      },
    });

    // Audit Log
    await createAuditLog({
      action: 'CREATE_ITEM',
      user: auth.user,
      targetId: item.id,
      targetName: item.name,
      metadata: { category: item.category, stock: item.stock }
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
