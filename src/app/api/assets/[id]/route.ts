import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog, AuditAction } from '@/lib/audit';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['IN_STOCK', 'ASSIGNED', 'MAINTENANCE', 'RETIRED']).optional(),
  warrantyExpiry: z.string().datetime().nullable().optional(),
  licenseExpiry: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const asset = await db.asset.findUnique({ where: { id } });
    if (!asset) throw new ApiError(404, 'Asset not found', 'NOT_FOUND');
    return NextResponse.json({ asset });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const existing = await db.asset.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Asset not found', 'NOT_FOUND');

    const data = patchSchema.parse(await request.json());
    const asset = await db.asset.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.warrantyExpiry !== undefined && {
          warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        }),
        ...(data.licenseExpiry !== undefined && {
          licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : null,
        }),
      },
    });

    await createAuditLog({
      action: 'UPDATE_ASSET' as AuditAction,
      user: auth.user,
      targetId: id,
      targetName: asset.name,
    });

    return NextResponse.json({ asset });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const existing = await db.asset.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Asset not found', 'NOT_FOUND');

    await db.asset.delete({ where: { id } });
    await createAuditLog({
      action: 'DELETE_ASSET' as AuditAction,
      user: auth.user,
      targetId: id,
      targetName: existing.name,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
