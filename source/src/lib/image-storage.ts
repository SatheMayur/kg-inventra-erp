// Storage helper for item images.
// Local filesystem by default (dev / self-hosted); Vercel Blob when
// BLOB_READ_WRITE_TOKEN is present (serverless deploys have no persistent disk).
import { promises as fs } from 'fs';
import path from 'path';

const LOCAL_DIR = path.join(process.cwd(), 'public', 'uploads', 'items');
const LOCAL_DIR_PREFIX = `${LOCAL_DIR}${path.sep}`;

function hasBlobStorage(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function assertSafeFilename(filename: string): string {
  const normalized = filename.replace(/\\/g, '/');
  if (
    normalized !== path.posix.basename(normalized) ||
    normalized.includes('..') ||
    normalized.includes('/') ||
    normalized.includes('\\')
  ) {
    throw new Error(`Invalid image filename: ${filename}`);
  }
  return filename;
}

function resolveLocalImagePath(url: string): string | null {
  const localPath = url.startsWith('/api/uploads/')
    ? url.slice('/api/uploads/'.length)
    : url.startsWith('/uploads/')
      ? url.slice('/uploads/'.length)
      : null;

  if (!localPath) return null;

  const normalized = localPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.includes('..')) {
    return null;
  }

  const filePath = path.resolve(process.cwd(), 'public', 'uploads', normalized);
  return filePath.startsWith(LOCAL_DIR_PREFIX) ? filePath : null;
}

/** Persist a buffer; returns a browser-servable URL. */
export async function saveImage(buffer: Buffer, filename: string, contentType: string): Promise<string> {
  const safeFilename = assertSafeFilename(filename);

  if (hasBlobStorage()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`items/${safeFilename}`, buffer, { access: 'public', contentType });
    return blob.url;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, safeFilename), buffer);
  // Served via the API route - Next.js won't serve public/ files created after build
  return `/api/uploads/items/${safeFilename}`;
}

/** Delete by the URL previously returned from saveImage. Missing files are ignored. */
export async function deleteImage(url: string): Promise<void> {
  if (url.startsWith('http')) {
    if (!hasBlobStorage()) return; // blob URL but no token - nothing we can do
    const { del } = await import('@vercel/blob');
    await del(url).catch(() => {});
    return;
  }
  const filePath = resolveLocalImagePath(url);
  if (!filePath) return;
  await fs.unlink(filePath).catch(() => {});
}
