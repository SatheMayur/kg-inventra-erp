import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin', 'employee', 'STORE_ADMIN', 'STORE_OPERATOR', 'DEPT_USER', 'DEPT_HEAD', 'PURCHASE_USER', 'ACCOUNTS_USER', 'MANAGEMENT']);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Query all transactions with status = HISTORICAL
    const histTransactions = await db.transaction.findMany({
      where: { status: 'HISTORICAL' },
      select: {
        qty: true,
        itemName: true,
        remarks: true,
        item: {
          select: {
            price: true,
            category: true,
            unit: true
          }
        }
      }
    });

    let totalQty = 0;
    let totalSpent = 0;
    const deptStatsMap = new Map<string, { qty: number, spending: number }>();
    const itemStatsMap = new Map<string, { qty: number, spending: number, unit: string, category: string }>();

    for (const tx of histTransactions) {
      let deptName = 'Unknown';
      if (tx.remarks && tx.remarks.includes('Department: ')) {
        deptName = tx.remarks.split('Department: ')[1].trim();
      }

      const qty = tx.qty;
      const price = tx.item?.price ?? 0;
      const spending = qty * price;

      totalQty += qty;
      totalSpent += spending;

      // Update department stats
      const deptStat = deptStatsMap.get(deptName) || { qty: 0, spending: 0 };
      deptStat.qty += qty;
      deptStat.spending += spending;
      deptStatsMap.set(deptName, deptStat);

      // Update item stats
      const itemStat = itemStatsMap.get(tx.itemName) || { qty: 0, spending: 0, unit: tx.item?.unit || 'pcs', category: tx.item?.category || 'General' };
      itemStat.qty += qty;
      itemStat.spending += spending;
      itemStatsMap.set(tx.itemName, itemStat);
    }

    const deptConsumption = Array.from(deptStatsMap.entries()).map(([department, stat]) => ({
      department,
      qty: stat.qty,
      spending: parseFloat(stat.spending.toFixed(2))
    })).sort((a, b) => b.qty - a.qty);

    const topItems = Array.from(itemStatsMap.entries()).map(([itemName, stat]) => ({
      itemName,
      qty: stat.qty,
      spending: parseFloat(stat.spending.toFixed(2)),
      unit: stat.unit,
      category: stat.category
    })).sort((a, b) => b.qty - a.qty).slice(0, 15);

    return NextResponse.json({
      totalQuantity: totalQty,
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      deptConsumption,
      topItems
    });

  } catch (error) {
    return handleApiError(error);
  }
}
