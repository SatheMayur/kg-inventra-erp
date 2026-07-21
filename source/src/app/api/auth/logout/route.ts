import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, authCookieOptions } from '@/lib/auth-cookie';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE_NAME, '', authCookieOptions(request, 0));
  return response;
}
