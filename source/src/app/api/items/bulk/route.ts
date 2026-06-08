import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';
import { Prisma } from '@prisma/client';

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  unit: z.string().min(1).max(50),
  stock: z.number().int().min(0),
  minStock: z.number().int().min(0),
});

const bulkSchema = z.array(itemSchema).min(1, 'At least one item is required');

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const validated = bulkSchema.parse(body);

    const result = await db.$transaction(async (tx) => {
      const created: Prisma.ItemGetPayload<Record<string, never>>[] = [];

      for (const itemData of validated) {
        // Skip duplicates silently in bulk import
        const existing = await tx.item.findFirst({
          where: { name: itemData.name, category: itemData.category, deletedAt: null },
        });
        if (existing) continue;

        const item = await tx.item.create({
          data: { ...itemData, reservedQty: 0, version: 1 },
        });
        created.push(item);
      }

      return created;
    });

    await createAuditLog({
      action: 'BULK_IMPORT',
      user: auth.user,
      metadata: { count: result.length },
    });

    return NextResponse.json({ count: result.length, items: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
