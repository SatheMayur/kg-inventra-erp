import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { createAuditLog, AuditAction } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

    const pos = await db.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ pos });
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
    const { supplierId, items, notes } = body as {
      supplierId?: string
      items?: { itemId: string; qty: number; unitPrice: number }[]
      notes?: string
    };

    if (!supplierId || !Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'Supplier and at least one item are required', 'BAD_REQUEST');
    }
    for (const i of items) {
      if (!i.itemId || typeof i.qty !== 'number' || i.qty <= 0 || typeof i.unitPrice !== 'number' || i.unitPrice < 0) {
        throw new ApiError(400, 'Each line needs itemId, qty > 0 and unitPrice >= 0', 'BAD_REQUEST');
      }
    }

    const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new ApiError(404, 'Supplier not found', 'NOT_FOUND');

    // Generate PO Number: PO-YYYYMMDD-XXX
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await db.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${date}` } } });
    const poNumber = `PO-${date}-${(count + 1).toString().padStart(3, '0')}`;

    const totalAmount = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

    // Budget gate: POs above the approval limit must be approved before they can be SENT.
    const limit = Number(process.env.PO_APPROVAL_LIMIT ?? 50000);
    const status = totalAmount > limit ? 'PENDING_APPROVAL' : 'SENT';

    const po = await db.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        notes: notes ?? null,
        totalAmount,
        status,
        items: { create: items.map((i) => ({ itemId: i.itemId, qty: i.qty, unitPrice: i.unitPrice })) },
      },
      include: { supplier: true, items: { include: { item: true } } },
    });

    await createAuditLog({
      action: 'CREATE_PO' as AuditAction,
      user: auth.user,
      targetId: po.id,
      targetName: poNumber,
      metadata: { totalAmount, status },
    });

    return NextResponse.json({ po });
  } catch (error) {
    return handleApiError(error);
  }
}
