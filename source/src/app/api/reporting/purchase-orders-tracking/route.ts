import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const pendingPos = await db.purchaseOrder.findMany({
      where: {
        status: {
          notIn: ['CLOSED', 'CANCELLED', 'REJECTED', 'FULLY_RECEIVED']
        }
      },
      include: {
        supplier: true,
        items: {
          include: { item: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const now = new Date();

    const purchaseOrders = pendingPos.map(po => {
      const ageInMs = now.getTime() - new Date(po.createdAt).getTime();
      const ageInDays = Math.max(0, Math.floor(ageInMs / (1000 * 60 * 60 * 24)));

      const totalItemsOrdered = po.items.reduce((acc, item) => acc + item.qty, 0);
      const totalItemsReceived = po.items.reduce((acc, item) => acc + item.receivedQty, 0);

      const items = po.items.map(pi => ({
        itemId: pi.itemId,
        itemName: pi.item.name,
        orderedQty: pi.qty,
        receivedQty: pi.receivedQty,
        pendingQty: Math.max(0, pi.qty - pi.receivedQty),
        unit: pi.item.unit || 'pcs',
        unitPrice: pi.unitPrice,
        discount: pi.discount,
        taxRate: pi.taxRate
      }));

      return {
        id: po.id,
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        status: po.status,
        createdAt: po.createdAt,
        expectedDeliveryDate: po.expectedDeliveryDate,
        ageInDays,
        totalAmount: po.totalAmount,
        totalItemsOrdered,
        totalItemsReceived,
        items
      };
    });

    return NextResponse.json({ purchaseOrders });
  } catch (error) {
    return handleApiError(error);
  }
}
