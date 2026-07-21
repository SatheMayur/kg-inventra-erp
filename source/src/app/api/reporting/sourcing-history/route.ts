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

    const poItems = await db.pOItem.findMany({
      where: {
        purchaseOrder: {
          status: {
            notIn: ['CANCELLED', 'REJECTED']
          }
        }
      },
      include: {
        purchaseOrder: {
          include: { supplier: true }
        },
        item: true
      },
      orderBy: { purchaseOrder: { createdAt: 'desc' } }
    });

    const itemMap = new Map<string, {
      itemCode: string | null;
      itemName: string;
      category: string;
      preferredSupplier: string;
      rates: number[];
      totalQty: number;
      lastRate: number;
      lastDate: Date;
      unit: string;
    }>();

    for (const pi of poItems) {
      const itemId = pi.itemId;
      const rate = pi.unitPrice;
      const qty = pi.qty;
      const supplierName = pi.purchaseOrder.supplier.name;
      const date = pi.purchaseOrder.createdAt;

      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, {
          itemCode: pi.item.itemCode,
          itemName: pi.item.name,
          category: pi.item.category,
          preferredSupplier: supplierName,
          rates: [rate],
          totalQty: qty,
          lastRate: rate,
          lastDate: date,
          unit: pi.item.unit || 'pcs'
        });
      } else {
        const existing = itemMap.get(itemId)!;
        existing.rates.push(rate);
        existing.totalQty += qty;
      }
    }

    const sourcingHistory = Array.from(itemMap.entries()).map(([itemId, val]) => {
      const avgRate = val.rates.reduce((a, b) => a + b, 0) / val.rates.length;
      return {
        itemId,
        itemCode: val.itemCode || 'N/A',
        itemName: val.itemName,
        category: val.category,
        preferredSupplier: val.preferredSupplier,
        lastPurchaseRate: parseFloat(val.lastRate.toFixed(2)),
        avgPurchaseRate: parseFloat(avgRate.toFixed(2)),
        totalQtyOrdered: val.totalQty,
        lastPurchaseDate: val.lastDate,
        unit: val.unit
      };
    });

    return NextResponse.json({ sourcingHistory });
  } catch (error) {
    return handleApiError(error);
  }
}
