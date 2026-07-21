import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

import { PO_STATUS } from '@/lib/po-status';

// GET /api/reporting/supplier-performance — per-supplier delivery time + fulfillment accuracy.
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin', 'STORE_ADMIN', 'PURCHASE_USER', 'ACCOUNTS_USER', 'MANAGEMENT']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const suppliers = await db.supplier.findMany({
      include: { pos: { include: { items: true } } },
    });

    const report = suppliers
      .map((s) => {
        const pos = s.pos;
        const totalValue = pos.reduce((sum, p) => sum + p.totalAmount, 0);
        const received = pos.filter((p) =>
          [
            PO_STATUS.FULLY_RECEIVED,
            PO_STATUS.PARTIALLY_RECEIVED,
            PO_STATUS.INVOICE_PENDING,
            PO_STATUS.CLOSED
          ].includes(p.status as any) && p.receivedAt
        );

        const delays = received.map((p) => {
          const targetDate = p.expectedDeliveryDate || p.createdAt;
          return Math.max(0, Math.round((p.receivedAt!.getTime() - targetDate.getTime()) / 86400000));
        });
        const avgDeliveryDays = delays.length
          ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
          : null;

        let ordered = 0;
        let fulfilled = 0;
        for (const p of received) {
          for (const it of p.items) {
            ordered += it.qty;
            fulfilled += it.receivedQty;
          }
        }
        const fulfillmentRate = ordered > 0 ? Math.round((fulfilled / ordered) * 1000) / 10 : null;

        return {
          supplierId: s.id,
          name: s.name,
          poCount: pos.length,
          receivedCount: received.length,
          totalValue: Math.round(totalValue * 100) / 100,
          avgDeliveryDays,
          fulfillmentRate,
        };
      })
      .sort((a, b) => b.poCount - a.poCount);

    return NextResponse.json({ suppliers: report }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    return handleApiError(error);
  }
}
