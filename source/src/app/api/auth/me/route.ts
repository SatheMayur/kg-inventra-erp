import { NextResponse, NextRequest } from 'next/server';
import { authorize } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({ user: auth.user });
}
