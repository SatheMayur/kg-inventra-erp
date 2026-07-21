import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';

const PUBLIC_ROUTES = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/seed',
  '/api/health',
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-role');
  requestHeaders.delete('x-user-payload'); // Prevent header spoofing from the client

  // Seed endpoint is strictly forbidden in production
  if (pathname === '/api/auth/seed' && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Gate WhatsApp integration routes using BRIDGE_API_KEY
  if (pathname.startsWith('/api/v1/wa/')) {
    const bridgeKey = request.headers.get('x-bridge-key');
    const expectedKey = process.env.BRIDGE_API_KEY;
    if (!expectedKey || bridgeKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing bridge key' },
        { status: 401 }
      );
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Uploaded images load via <img> tags which send no Authorization header
  if (!pathname.startsWith('/api') || PUBLIC_ROUTES.has(pathname) || pathname.startsWith('/api/uploads/')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith('/api/cron/')) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing cron secret' },
        { status: 401 }
      );
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const authHeader = request.headers.get('authorization');

  // Prefer httpOnly cookie; fall back to Bearer header for API clients
  const cookieToken = request.cookies.get('sh_token')?.value;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid token' },
      { status: 401 }
    );
  }

  const user = await verifyToken(token);

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized: Token expired or invalid' },
      { status: 401 }
    );
  }

  requestHeaders.set('x-user-id', user.id);
  requestHeaders.set('x-user-role', user.role);
  requestHeaders.set('x-user-payload', JSON.stringify(user));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: '/api/:path*',
};
