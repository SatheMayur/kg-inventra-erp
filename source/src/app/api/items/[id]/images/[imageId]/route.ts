import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { deleteImage } from '@/lib/image-storage';

const LABEL_TYPES = new Set(['front', 'hazard', 'batch']);

// PATCH /api/items/[id]/images/[imageId] — { isPrimary?: true, labelType?: string|null, sortOrder?: number }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id, imageId } = await params;
    const body = await request.json();

    const image = await db.itemImage.findUnique({ where: { id: imageId } });
    if (!image || image.itemId !== id) throw new ApiError(404, 'Image not found', 'NOT_FOUND');

    if (body.isPrimary === true) {
      await db.$transaction([
        db.itemImage.updateMany({ where: { itemId: id }, data: { isPrimary: false } }),
        db.itemImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
        // Keep legacy single-photo field in sync with the primary thumbnail
        db.item.update({ where: { id }, data: { photoUrl: image.thumbnailPath } }),
      ]);
    }

    const data: { labelType?: string | null; sortOrder?: number } = {};
    if ('labelType' in body) {
      data.labelType = body.labelType === null || LABEL_TYPES.has(body.labelType) ? body.labelType : undefined;
    }
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder;
    if (Object.keys(data).length > 0) {
      await db.itemImage.update({ where: { id: imageId }, data });
    }

    const updated = await db.itemImage.findUnique({ where: { id: imageId } });
    return NextResponse.json({ image: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/items/[id]/images/[imageId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id, imageId } = await params;
    const image = await db.itemImage.findUnique({ where: { id: imageId } });
    if (!image || image.itemId !== id) throw new ApiError(404, 'Image not found', 'NOT_FOUND');

    await deleteImage(image.imagePath);
    await deleteImage(image.thumbnailPath);
    await db.itemImage.delete({ where: { id: imageId } });

    // If the primary was deleted, promote the next image (or clear legacy field)
    if (image.isPrimary) {
      const next = await db.itemImage.findFirst({
        where: { itemId: id },
        orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'asc' }],
      });
      if (next) {
        await db.$transaction([
          db.itemImage.update({ where: { id: next.id }, data: { isPrimary: true } }),
          db.item.update({ where: { id }, data: { photoUrl: next.thumbnailPath } }),
        ]);
      } else {
        await db.item.update({ where: { id }, data: { photoUrl: null } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
