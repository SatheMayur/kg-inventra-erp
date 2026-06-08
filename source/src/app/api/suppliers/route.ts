import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const suppliers = await db.supplier.findMany({
      orderBy: { name: 'asc' },
      take: 500,
    });

    return NextResponse.json({ suppliers });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await request.json();
    const { name, contact, email, category } = body;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const supplier = await db.supplier.create({
      data: { name, contact, email, category },
    });

    return NextResponse.json({ supplier });
  } catch (error) {
    return handleApiError(error);
  }
}
