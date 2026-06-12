import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { saveImage } from '@/lib/image-storage';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const LABEL_TYPES = new Set(['front', 'hazard', 'batch']);

// GET /api/items/[id]/images — all images for an item, primary first
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const images = await db.itemImage.findMany({
      where: { itemId: id },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { uploadedAt: 'asc' }],
    });
    return NextResponse.json({ images });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/items/[id]/images — multipart upload, field "files" (multiple), optional "labelType"
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const item = await db.item.findUnique({ where: { id } });
    if (!item || item.deletedAt) throw new ApiError(404, 'Item not found', 'NOT_FOUND');

    const formData = await request.formData();
    const files = formData.getAll('files').filter((f): f is File => f instanceof File);
    const labelTypeRaw = formData.get('labelType');
    const labelType =
      typeof labelTypeRaw === 'string' && LABEL_TYPES.has(labelTypeRaw) ? labelTypeRaw : null;

    if (files.length === 0) throw new ApiError(400, 'No files provided', 'BAD_REQUEST');

    const hasPrimary = (await db.itemImage.count({ where: { itemId: id, isPrimary: true } })) > 0;
    const maxSort = await db.itemImage.aggregate({ where: { itemId: id }, _max: { sortOrder: true } });
    let sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const created: Awaited<ReturnType<typeof db.itemImage.create>>[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new ApiError(400, `"${file.name}": only JPEG, PNG, WebP allowed`, 'BAD_REQUEST');
      }
      if (file.size > MAX_BYTES) {
        throw new ApiError(400, `"${file.name}" exceeds 10MB limit`, 'BAD_REQUEST');
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      // Re-encode through sharp — also defeats files that merely claim an image MIME type
      let original: Buffer, thumb: Buffer;
      try {
        original = await sharp(buffer).rotate().webp({ quality: 88 }).toBuffer();
        thumb = await sharp(buffer).rotate().resize(150, 150, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
      } catch {
        throw new ApiError(400, `"${file.name}" is not a valid image`, 'BAD_REQUEST');
      }

      const base = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const imagePath = await saveImage(original, `${base}.webp`, 'image/webp');
      const thumbnailPath = await saveImage(thumb, `${base}_thumb.webp`, 'image/webp');

      const isPrimary = !hasPrimary && created.length === 0;
      const img = await db.itemImage.create({
        data: { itemId: id, imagePath, thumbnailPath, isPrimary, labelType, sortOrder: sortOrder++ },
      });
      created.push(img);

      // Keep legacy single-photo field pointing at the primary thumbnail
      if (isPrimary) {
        await db.item.update({ where: { id }, data: { photoUrl: thumbnailPath } });
      }
    }

    return NextResponse.json({ images: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
