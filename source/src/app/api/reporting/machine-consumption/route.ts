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

    const lines = await db.requestLine.findMany({
      where: {
        issuedQty: { gt: 0 },
        request: {
          AND: [{ machine: { not: null } }, { machine: { not: "" } }]
        }
      },
      include: {
        request: true,
        item: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Aggregate flat list
    const consumptionMap = new Map<string, {
      machine: string;
      department: string;
      itemName: string;
      category: string;
      totalQty: number;
      totalSpent: number;
      unit: string;
      lastIssued: Date;
    }>();

    for (const line of lines) {
      const machine = line.request.machine || 'Unknown';
      const key = `${machine}_${line.itemId}`;
      const qty = line.issuedQty;
      const price = line.item.price || 0;
      const spent = qty * price;

      if (!consumptionMap.has(key)) {
        consumptionMap.set(key, {
          machine,
          department: line.request.department,
          itemName: line.itemName,
          category: line.item.category,
          totalQty: qty,
          totalSpent: spent,
          unit: line.unit || 'pcs',
          lastIssued: line.updatedAt
        });
      } else {
        const existing = consumptionMap.get(key)!;
        existing.totalQty += qty;
        existing.totalSpent += spent;
        if (new Date(line.updatedAt) > new Date(existing.lastIssued)) {
          existing.lastIssued = line.updatedAt;
        }
      }
    }

    const consumption = Array.from(consumptionMap.values()).map(c => ({
      ...c,
      totalSpent: parseFloat(c.totalSpent.toFixed(2))
    }));

    return NextResponse.json({ consumption });
  } catch (error) {
    return handleApiError(error);
  }
}
