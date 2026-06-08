import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

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
    const { supplierId, items, notes } = body; // items: Array<{ itemId: string, qty: number, unitPrice: number }>

    if (!supplierId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Supplier and items are required' }, { status: 400 });
    }

    const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });

    // Generate PO Number: PO-YYYYMMDD-XXXX
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await db.purchaseOrder.count({
      where: { poNumber: { startsWith: `PO-${date}` } }
    });
    const poNumber = `PO-${date}-${(count + 1).toString().padStart(3, '0')}`;

    const totalAmount = items.reduce((sum: number, i: any) => sum + (i.qty * i.unitPrice), 0);

    const po = await db.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        notes,
        totalAmount,
        status: 'SENT', // Defaulting to SENT for simplicity in this demo
        items: {
          create: items.map((i: any) => ({
            itemId: i.itemId,
            qty: i.qty,
            unitPrice: i.unitPrice
          }))
        }
      },
      include: {
        supplier: true,
        items: { include: { item: true } }
      }
    });

    return NextResponse.json({ po });
  } catch (error) {
    return handleApiError(error);
  }
}
