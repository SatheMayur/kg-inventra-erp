import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Serves runtime-uploaded files. Next.js only serves public/ assets that existed
// at BUILD time — files written after build 404 in production, so uploads go
// through this route instead.
const MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const rel = parts.join('/');
  // Block path traversal
  if (rel.includes('..') || path.isAbsolute(rel)) {
    return new NextResponse('Bad path', { status: 400 });
  }
  const filePath = path.join(process.cwd(), 'public', 'uploads', rel);
  try {
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext];
    if (!type) {
      return new NextResponse('Not found', { status: 404 });
    }
    const data = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
