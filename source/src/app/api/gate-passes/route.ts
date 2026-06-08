import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const gatePasses = await db.gatePass.findMany({
      include: { request: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json(gatePasses);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { type, requestId, receiverName, vehicleNumber, purpose } = body;

    if (!type || !receiverName || !purpose) {
      return NextResponse.json({ error: 'type, receiverName, and purpose are required' }, { status: 400 });
    }

    // Generate sequential pass number GP-YYYYMMDD-NNN
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await db.gatePass.count({
      where: { passNumber: { startsWith: `GP-${date}` } },
    });
    const passNumber = `GP-${date}-${(count + 1).toString().padStart(3, '0')}`;

    const pass = await db.gatePass.create({
      data: { passNumber, type, requestId, receiverName, vehicleNumber, purpose, status: 'ISSUED' },
    });

    return NextResponse.json(pass, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const VALID_STATUSES = ['DRAFT', 'ISSUED', 'COMPLETED', 'CANCELLED'];
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    const pass = await db.gatePass.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json(pass);
  } catch (error) {
    return handleApiError(error);
  }
}
