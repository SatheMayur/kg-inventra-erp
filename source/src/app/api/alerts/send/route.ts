import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { sendAlert, isMailConfigured } from '@/lib/mailer';
import { z } from 'zod';

const bodySchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const { email } = bodySchema.parse(body);

    // Low stock alerts
    const allItems = await db.item.findMany({ where: { deletedAt: null } });
    const lowStockItems = allItems.filter((item) => item.stock <= item.minStock);

    // Maintenance due alerts (within 7 days or overdue)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const maintenanceAlerts = await db.maintenanceSchedule.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lte: sevenDaysFromNow },
      },
      include: { item: { select: { name: true } } },
    });

    // Create in-app notifications
    const notifications: Array<{ title: string; message: string }> = [];

    for (const item of lowStockItems) {
      notifications.push({
        title: item.stock === 0 ? 'Out of Stock' : 'Low Stock Alert',
        message: `${item.name} has ${item.stock} ${item.unit} remaining (min: ${item.minStock})`,
      });
    }

    for (const schedule of maintenanceAlerts) {
      const due = new Date(schedule.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      notifications.push({
        title: 'Maintenance Due',
        message: `${schedule.title} for ${schedule.item.name} is due on ${due} (${schedule.status})`,
      });
    }

    await Promise.all(
      notifications.map((n) =>
        db.notification.create({
          data: {
            userId: auth.user!.id,
            title: n.title,
            message: n.message,
            type: 'warning',
          },
        })
      )
    );

    // Send email if requested and configured
    let emailed = false;
    if (email && isMailConfigured()) {
      const lowStockRows = lowStockItems
        .map(
          (i) =>
            `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${i.name}</td>` +
            `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:${i.stock === 0 ? '#e11d48' : '#d97706'}">${i.stock} / ${i.minStock} ${i.unit}</td></tr>`
        )
        .join('');

      const maintenanceRows = maintenanceAlerts
        .map((s) => {
          const due = new Date(s.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          return (
            `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${s.item.name}</td>` +
            `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${s.title}</td>` +
            `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${due}</td>` +
            `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#7c3aed">${s.status}</td></tr>`
          );
        })
        .join('');

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
          <h2 style="margin-bottom:4px">Inventory Alerts Summary</h2>
          <p style="color:#666;margin-top:0">Generated on ${new Date().toLocaleString('en-IN')}</p>

          ${
            lowStockItems.length > 0
              ? `<h3 style="margin-top:24px">Low Stock (${lowStockItems.length})</h3>
                 <table style="width:100%;border-collapse:collapse;font-size:13px">
                   <thead><tr>
                     <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Item</th>
                     <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Stock / Min</th>
                   </tr></thead>
                   <tbody>${lowStockRows}</tbody>
                 </table>`
              : '<p style="color:#666">No low-stock items.</p>'
          }

          ${
            maintenanceAlerts.length > 0
              ? `<h3 style="margin-top:24px">Maintenance Due (${maintenanceAlerts.length})</h3>
                 <table style="width:100%;border-collapse:collapse;font-size:13px">
                   <thead><tr>
                     <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Item</th>
                     <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Task</th>
                     <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Due Date</th>
                     <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Status</th>
                   </tr></thead>
                   <tbody>${maintenanceRows}</tbody>
                 </table>`
              : '<p style="color:#666">No maintenance tasks due.</p>'
          }
        </div>
      `;

      await sendAlert(email, 'Inventory Alerts', html);
      emailed = true;
    }

    return NextResponse.json({ notified: notifications.length, emailed });
  } catch (error) {
    return handleApiError(error);
  }
}
