import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { deleteImage, saveImage } from '@/lib/image-storage';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
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
    const buffer = Buffer.from(await file.arrayBuffer());
    const photoUrl = await saveImage(buffer, filename, file.type);
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
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const item = await db.item.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    if (item.photoUrl) {
      await deleteImage(item.photoUrl);
    }

    await db.item.update({ where: { id }, data: { photoUrl: null } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
