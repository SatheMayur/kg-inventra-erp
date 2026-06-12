// Storage helper for item images.
// Local filesystem by default (dev / self-hosted); Vercel Blob when
// BLOB_READ_WRITE_TOKEN is present (serverless deploys have no persistent disk).
import { promises as fs } from 'fs';
import path from 'path';

const LOCAL_DIR = path.join(process.cwd(), 'public', 'uploads', 'items');

function useBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Persist a buffer; returns a browser-servable URL. */
export async function saveImage(buffer: Buffer, filename: string, contentType: string): Promise<string> {
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`items/${filename}`, buffer, { access: 'public', contentType });
    return blob.url;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, filename), buffer);
  // Served via the API route — Next.js won't serve public/ files created after build
  return `/api/uploads/items/${filename}`;
}

/** Delete by the URL previously returned from saveImage. Missing files are ignored. */
export async function deleteImage(url: string): Promise<void> {
  if (url.startsWith('http')) {
    if (!useBlob()) return; // blob URL but no token — nothing we can do
    const { del } = await import('@vercel/blob');
    await del(url).catch(() => {});
    return;
  }
  const rel = url.replace(/^\/api\/uploads\//, 'uploads/').replace(/^\/uploads\//, 'uploads/');
  const filePath = path.join(process.cwd(), 'public', rel);
  await fs.unlink(filePath).catch(() => {});
}
