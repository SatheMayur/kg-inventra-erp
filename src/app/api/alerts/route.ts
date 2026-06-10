import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Low stock alerts
    const allItems = await db.item.findMany({ where: { deletedAt: null } });
    const lowStockAlerts = allItems
      .filter((item) => item.stock <= item.minStock)
      .map((item) => ({
        type: 'LOW_STOCK' as const,
        itemId: item.id,
        itemName: item.name,
        stock: item.stock,
        minStock: item.minStock,
        severity: item.stock === 0 ? 'critical' : 'warning',
      }));

    // Maintenance due alerts (due within 7 days or overdue)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const maintenanceAlerts = await db.maintenanceSchedule.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lte: sevenDaysFromNow },
      },
      include: { item: { select: { name: true } } },
    });

    const maintenanceMapped = maintenanceAlerts.map((s) => ({
      type: 'MAINTENANCE_DUE' as const,
      scheduleId: s.id,
      title: s.title,
      itemName: s.item.name,
      dueDate: s.dueDate,
      status: s.status,
    }));

    // Warranty / license expiry alerts (expiring within 30 days or already expired)
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiringAssets = await db.asset.findMany({
      where: {
        status: { not: 'RETIRED' },
        OR: [
          { warrantyExpiry: { lte: thirtyDaysFromNow } },
          { licenseExpiry: { lte: thirtyDaysFromNow } },
        ],
      },
    });
    const expiryAlerts = expiringAssets.map((a) => ({
      type: 'EXPIRY' as const,
      assetId: a.id,
      name: a.name,
      serialNumber: a.serialNumber,
      warrantyExpiry: a.warrantyExpiry,
      licenseExpiry: a.licenseExpiry,
    }));

    const alerts = [...lowStockAlerts, ...maintenanceMapped, ...expiryAlerts];

    return NextResponse.json({
      alerts,
      counts: {
        lowStock: lowStockAlerts.length,
        maintenance: maintenanceMapped.length,
        expiry: expiryAlerts.length,
        total: alerts.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
