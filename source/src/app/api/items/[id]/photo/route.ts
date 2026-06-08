import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) throw new ApiError(400, 'No file provided', 'BAD_REQUEST');
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new ApiError(400, 'Only JPEG, PNG, and WebP images are allowed', 'BAD_REQUEST');
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError(400, 'File exceeds 5MB limit', 'BAD_REQUEST');
    }

    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const filename = `${id}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'items');

    await fs.mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(uploadDir, filename), buffer);

    const photoUrl = `/uploads/items/${filename}`;
    await db.item.update({ where: { id }, data: { photoUrl } });

    return NextResponse.json({ photoUrl });
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

    const { id } = await params;

    const item = await db.item.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    if (item.photoUrl) {
      const filePath = path.join(process.cwd(), 'public', item.photoUrl);
      await fs.unlink(filePath).catch(() => {
        // Ignore missing-file errors — DB record should still be cleared
      });
    }

    await db.item.update({ where: { id }, data: { photoUrl: null } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
