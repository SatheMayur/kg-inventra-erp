import { db } from '@/lib/db'
import { isMailConfigured, sendAlert } from '@/lib/mailer'
import { getKolkataDaysAhead } from './date-utils'
import { createNotificationOnce } from './notifications'

type RunInventoryAlertsOptions = {
  notificationUserId: string
  email?: string
}

export async function runInventoryAlerts({ notificationUserId, email }: RunInventoryAlertsOptions) {
  const allItems = await db.item.findMany({ where: { deletedAt: null, active: true } })
  const lowStockItems = allItems.filter((item) => item.stock <= item.minStock)

  const sevenDaysFromNow = getKolkataDaysAhead(7)
  const maintenanceAlerts = await db.maintenanceSchedule.findMany({
    where: {
      status: { in: ['PENDING', 'OVERDUE'] },
      dueDate: { lte: sevenDaysFromNow },
    },
    include: { item: { select: { name: true } } },
  })

  const now = new Date()
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  const pendingRequisitions = await db.request.findMany({
    where: {
      status: {
        notIn: ['Issued', 'Rejected', 'Cancelled', 'CONVERTED_TO_PO']
      },
      createdAt: { lte: threeDaysAgo }
    }
  })

  const overduePOs = await db.purchaseOrder.findMany({
    where: {
      status: {
        notIn: ['CLOSED', 'CANCELLED', 'REJECTED', 'FULLY_RECEIVED']
      },
      expectedDeliveryDate: { lte: now }
    },
    include: {
      supplier: true
    }
  })

  const notifications: Array<{ title: string; message: string }> = []

  for (const item of lowStockItems) {
    notifications.push({
      title: item.stock === 0 ? 'Out of Stock' : 'Low Stock Alert',
      message: `${item.name} has ${item.stock} ${item.unit} remaining (min: ${item.minStock})`,
    })
  }

  for (const schedule of maintenanceAlerts) {
    const due = new Date(schedule.dueDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    notifications.push({
      title: 'Maintenance Due',
      message: `${schedule.title} for ${schedule.item.name} is due on ${due} (${schedule.status})`,
    })
  }

  for (const req of pendingRequisitions) {
    const reqNo = req.requestNumber || `REQ-${req.id.slice(-6).toUpperCase()}`;
    const daysPending = Math.max(0, Math.floor((now.getTime() - new Date(req.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
    notifications.push({
      title: 'Pending Requisition Alert',
      message: `Requisition ${reqNo} requested by ${req.employee} (${req.department}) has been pending for ${daysPending} days`,
    })
  }

  for (const po of overduePOs) {
    const expected = po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }) : 'N/A';
    notifications.push({
      title: 'Overdue PO Alert',
      message: `Purchase Order ${po.poNumber} for ${po.supplier.name} is overdue (Expected: ${expected}, Status: ${po.status})`,
    })
  }

  const notificationResults = await Promise.all(
    notifications.map((notification) =>
      createNotificationOnce({
        userId: notificationUserId,
        title: notification.title,
        message: notification.message,
        type: 'warning',
        link: 'alerts',
      })
    )
  )
  const createdNotifications = notificationResults.filter((result) => result.created).length

  let emailed = false
  if (email && isMailConfigured()) {
    const lowStockRows = lowStockItems
      .map(
        (item) =>
          `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${item.name}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:${item.stock === 0 ? '#e11d48' : '#d97706'}">${item.stock} / ${item.minStock} ${item.unit}</td></tr>`
      )
      .join('')

    const maintenanceRows = maintenanceAlerts
      .map((schedule) => {
        const due = new Date(schedule.dueDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
        return (
          `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${schedule.item.name}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${schedule.title}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${due}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#7c3aed">${schedule.status}</td></tr>`
        )
      })
      .join('')

    const pendingReqRows = pendingRequisitions
      .map((req) => {
        const reqNo = req.requestNumber || `REQ-${req.id.slice(-6).toUpperCase()}`;
        const daysPending = Math.max(0, Math.floor((now.getTime() - new Date(req.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
        const reqDate = new Date(req.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        return (
          `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${reqNo}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${req.employee} (${req.department})</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${reqDate}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#e11d48">${daysPending} days</td></tr>`
        )
      })
      .join('')

    const overduePoRows = overduePOs
      .map((po) => {
        const expected = po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }) : 'N/A';
        return (
          `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${po.poNumber}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${po.supplier.name}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${expected}</td>` +
          `<td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#d97706">${po.status}</td></tr>`
        )
      })
      .join('')

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

        ${
          pendingRequisitions.length > 0
            ? `<h3 style="margin-top:24px">Pending Requisitions (> 3 Days) (${pendingRequisitions.length})</h3>
               <table style="width:100%;border-collapse:collapse;font-size:13px">
                 <thead><tr>
                   <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Request No.</th>
                   <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Requester</th>
                   <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Requested Date</th>
                   <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Pending Age</th>
                 </tr></thead>
                 <tbody>${pendingReqRows}</tbody>
               </table>`
            : '<p style="color:#666">No pending requisitions exceeding 3 days.</p>'
        }

        ${
          overduePOs.length > 0
            ? `<h3 style="margin-top:24px">Overdue Purchase Orders (${overduePOs.length})</h3>
               <table style="width:100%;border-collapse:collapse;font-size:13px">
                 <thead><tr>
                   <th style="text-align:left;padding:8px 12px;background:#f9f9f9">PO Number</th>
                   <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Supplier</th>
                   <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Expected Date</th>
                   <th style="text-align:left;padding:8px 12px;background:#f9f9f9">Status</th>
                 </tr></thead>
                 <tbody>${overduePoRows}</tbody>
               </table>`
            : '<p style="color:#666">No overdue purchase orders.</p>'
        }
      </div>
    `

    await sendAlert(email, 'Inventory Alerts Summary', html)
    emailed = true
  }

  return {
    notified: createdNotifications,
    activeAlerts: notifications.length,
    emailed,
    lowStock: lowStockItems.length,
    maintenanceDue: maintenanceAlerts.length,
    pendingRequisitions: pendingRequisitions.length,
    overduePOs: overduePOs.length,
  }
}
