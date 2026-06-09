import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  serialNumber: z.string().min(1).max(120),
  itemId: z.string().min(1).nullable().optional(),
  warrantyExpiry: z.string().datetime().nullable().optional(),
  licenseExpiry: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const assignedToUserId = searchParams.get('assignedToUserId') || undefined;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (assignedToUserId) where.assignedToUserId = assignedToUserId;

    const assets = await db.asset.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    return NextResponse.json({ assets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const data = createSchema.parse(await request.json());

    const dupe = await db.asset.findUnique({ where: { serialNumber: data.serialNumber } });
    if (dupe) throw new ApiError(409, 'An asset with this serial number already exists', 'CONFLICT');

    const asset = await db.asset.create({
      data: {
        name: data.name,
        serialNumber: data.serialNumber,
        itemId: data.itemId ?? null,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : null,
        notes: data.notes ?? null,
      },
    });

    await createAuditLog({
      action: 'CREATE_ASSET' as AuditAction,
      user: auth.user,
      targetId: asset.id,
      targetName: asset.name,
      metadata: { serialNumber: asset.serialNumber },
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
