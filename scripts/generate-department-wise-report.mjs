import { mkdirSync, writeFileSync } from 'node:fs'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db'
}

const { PrismaClient } = await import('@prisma/client')

const db = new PrismaClient()

const DEFAULT_DEPARTMENTS = [
  'Admin', 'Account', 'Auto_Polish', 'BMS', 'CLV', 'DNA', 'Fancy', 'Galaxy',
  'Hardware', 'HR', 'HRD', 'Lab', 'Laser', 'Manual Round', 'Marketing',
  'Program', 'R & D', 'Recut', 'Rough analysis', 'Security', 'Software',
  'SPC_IT', 'Stock control', 'Store Manager', 'Xray',
]

function kolkataParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

function reportDate() {
  const p = kolkataParts()
  return `${p.year}-${p.month}-${p.day}`
}

function reportTimestamp() {
  const p = kolkataParts()
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute} IST`
}

function money(value) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function number(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function normalizeStatus(status) {
  return String(status || '').toUpperCase().replace(/[\s_-]+/g, '')
}

function departmentKey(name) {
  const cleaned = String(name || '').trim()
  return cleaned || 'Unknown'
}

function newStats(name) {
  return {
    department: name,
    totalUsers: 0,
    activeUsers: 0,
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    poRequiredRequests: 0,
    issuedRequests: 0,
    rejectedCancelledRequests: 0,
    requestedQty: 0,
    issueCount: 0,
    issueQty: 0,
    estSpend: 0,
    poCount: 0,
    openPoCount: 0,
    poAmount: 0,
    lastIssueDate: null,
    topItems: new Map(),
  }
}

function getStats(map, name) {
  const key = departmentKey(name)
  if (!map.has(key)) map.set(key, newStats(key))
  return map.get(key)
}

function requestBucket(request) {
  const status = normalizeStatus(request.status)
  const hasPendingPurchase = (request.lines || []).some((line) => (line.pendingPurchaseQty || 0) > 0)

  if (status === 'ISSUED' || status === 'CLOSED') return 'issued'
  if (status === 'REJECTED' || status === 'CANCELLED') return 'rejectedCancelled'
  if (hasPendingPurchase || status === 'CONVERTEDTOPO' || status === 'POREQUIRED') return 'poRequired'
  if (['APPROVED', 'READYFORPICKUP', 'STOCKAVAILABLE', 'ISSUEPENDING', 'PARTIALLYISSUED'].includes(status)) return 'approved'
  return 'pending'
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toAscii(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
}

function truncate(value, maxLength) {
  const text = toAscii(value)
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text
}

function escapePdfText(text) {
  return toAscii(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildCsv(rows, outputPath) {
  const headers = [
    'Department',
    'Active Users',
    'Total Users',
    'Requests',
    'Pending',
    'Approved',
    'PO Required',
    'Issued',
    'Rejected/Cancelled',
    'Requested Qty',
    'Issue Qty',
    'Estimated Spend Rs',
    'Linked POs',
    'Open POs',
    'PO Amount Rs',
    'Last Issue',
    'Top Issued Item',
  ]

  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push([
      row.department,
      row.activeUsers,
      row.totalUsers,
      row.totalRequests,
      row.pendingRequests,
      row.approvedRequests,
      row.poRequiredRequests,
      row.issuedRequests,
      row.rejectedCancelledRequests,
      row.requestedQty,
      row.issueQty,
      Math.round(row.estSpend * 100) / 100,
      row.poCount,
      row.openPoCount,
      Math.round(row.poAmount * 100) / 100,
      row.lastIssueLabel,
      row.topIssuedItem,
    ].map(csvCell).join(','))
  }

  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
}

function renderPdf(rows, summary, outputPath) {
  const pageWidth = 842
  const pageHeight = 595
  const margin = 26
  const tableX = margin
  const rowHeight = 13
  const columns = [
    { label: 'Department', key: 'department', w: 116, align: 'left' },
    { label: 'Users', key: 'activeUsers', w: 35, align: 'right' },
    { label: 'Req', key: 'totalRequests', w: 35, align: 'right' },
    { label: 'Pend', key: 'pendingRequests', w: 35, align: 'right' },
    { label: 'PO Req', key: 'poRequiredRequests', w: 45, align: 'right' },
    { label: 'Issued', key: 'issuedRequests', w: 40, align: 'right' },
    { label: 'Issue Qty', key: 'issueQty', w: 52, align: 'right' },
    { label: 'Spend Rs', key: 'estSpendLabel', w: 64, align: 'right' },
    { label: 'POs', key: 'poCount', w: 36, align: 'right' },
    { label: 'Open', key: 'openPoCount', w: 39, align: 'right' },
    { label: 'Last Issue', key: 'lastIssueLabel', w: 63, align: 'left' },
    { label: 'Top Issued Item', key: 'topIssuedItem', w: 214, align: 'left' },
  ]

  const pageRows = []
  let firstPageRows = rows.slice(0, 27)
  pageRows.push(firstPageRows)
  let remaining = rows.slice(firstPageRows.length)
  while (remaining.length > 0) {
    pageRows.push(remaining.slice(0, 34))
    remaining = remaining.slice(34)
  }

  const pageStreams = pageRows.map((chunk, pageIndex) => {
    const ops = []
    const rect = (x, y, w, h, fill = [1, 1, 1], stroke = null) => {
      ops.push('q')
      ops.push(`${fill.join(' ')} rg`)
      if (stroke) ops.push(`${stroke.join(' ')} RG 0.6 w`)
      ops.push(`${x} ${y} ${w} ${h} re ${stroke ? 'B' : 'f'}`)
      ops.push('Q')
    }
    const text = (value, x, y, size = 8, font = 'F1', color = [0.13, 0.15, 0.18]) => {
      ops.push('BT')
      ops.push(`/${font} ${size} Tf`)
      ops.push(`${color.join(' ')} rg`)
      ops.push(`${x} ${y} Td`)
      ops.push(`(${escapePdfText(value)}) Tj`)
      ops.push('ET')
    }
    const rightText = (value, x, y, width, size = 7.2, font = 'F1', color = [0.13, 0.15, 0.18]) => {
      const approxWidth = toAscii(value).length * size * 0.48
      text(value, x + width - approxWidth - 4, y, size, font, color)
    }

    rect(0, 0, pageWidth, pageHeight, [0.98, 0.99, 1])

    if (pageIndex === 0) {
      rect(0, 525, pageWidth, 70, [0.05, 0.12, 0.18])
      text('Department-wise Store Report', 32, 564, 20, 'F2', [1, 1, 1])
      text(`Generated: ${summary.generatedAt} | Period: all available data`, 32, 541, 9, 'F1', [0.8, 0.9, 1])

      const cardY = 482
      const cards = [
        ['Departments', number(summary.departments)],
        ['Active Users', number(summary.activeUsers)],
        ['Requests', number(summary.requests)],
        ['Issued Qty', number(summary.issueQty)],
        ['Est. Spend', `Rs. ${money(summary.estSpend)}`],
        ['Open POs', number(summary.openPoCount)],
      ]
      const cardW = 125
      cards.forEach(([label, value], index) => {
        const x = margin + index * (cardW + 6)
        rect(x, cardY, cardW, 36, [1, 1, 1], [0.82, 0.87, 0.92])
        text(label.toUpperCase(), x + 8, cardY + 22, 6.4, 'F2', [0.36, 0.42, 0.5])
        text(value, x + 8, cardY + 8, 10, 'F2', [0.08, 0.15, 0.23])
      })
    } else {
      rect(0, 550, pageWidth, 45, [0.05, 0.12, 0.18])
      text('Department-wise Store Report', 32, 571, 14, 'F2', [1, 1, 1])
      text(`Generated: ${summary.generatedAt} | Page ${pageIndex + 1}`, 32, 555, 8, 'F1', [0.8, 0.9, 1])
    }

    const tableTop = pageIndex === 0 ? 454 : 526
    rect(tableX, tableTop - 1, 790, 18, [0.9, 0.95, 0.99], [0.76, 0.84, 0.92])
    let x = tableX
    for (const col of columns) {
      text(col.label, x + 4, tableTop + 4, 6.3, 'F2', [0.13, 0.21, 0.34])
      x += col.w
    }

    let y = tableTop - rowHeight
    chunk.forEach((row, rowIndex) => {
      if (rowIndex % 2 === 0) rect(tableX, y - 2, 790, rowHeight, [1, 1, 1])
      else rect(tableX, y - 2, 790, rowHeight, [0.96, 0.98, 1])
      let colX = tableX
      for (const col of columns) {
        let value = row[col.key]
        if (col.key === 'department') value = truncate(value, 21)
        if (col.key === 'topIssuedItem') value = truncate(value || '-', 38)
        if (col.align === 'right') rightText(value, colX, y + 2, col.w)
        else text(value || '-', colX + 4, y + 2, 7.1)
        colX += col.w
      }
      y -= rowHeight
    })

    text('Note: Estimated spend uses current item prices, matching the existing department-consumption report logic.', margin, 24, 7, 'F1', [0.4, 0.46, 0.54])
    rightText(`Page ${pageIndex + 1} of ${pageRows.length}`, pageWidth - 110, 24, 80, 7, 'F1', [0.4, 0.46, 0.54])
    return ops.join('\n')
  })

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ]

  const pageObjectIds = []
  for (const stream of pageStreams) {
    const pageObjId = objects.length + 1
    const contentObjId = objects.length + 2
    pageObjectIds.push(pageObjId)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`)
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  writeFileSync(outputPath, pdf, 'latin1')
}

try {
  const [dbDepartments, users, requests, transactions, purchaseOrders] = await Promise.all([
    db.department.findMany({ where: { active: true }, select: { name: true } }),
    db.user.findMany({ select: { department: true, active: true } }),
    db.request.findMany({
      include: {
        lines: {
          select: {
            requestedQty: true,
            pendingPurchaseQty: true,
          },
        },
      },
    }),
    db.transaction.findMany({
      where: { type: 'OUT' },
      include: {
        user: { select: { department: true } },
        item: { select: { price: true } },
      },
    }),
    db.purchaseOrder.findMany({
      include: {
        linkedSr: { select: { department: true } },
        items: { select: { qty: true, receivedQty: true } },
      },
    }),
  ])

  const stats = new Map()
  for (const dept of DEFAULT_DEPARTMENTS) getStats(stats, dept)
  for (const dept of dbDepartments) getStats(stats, dept.name)

  for (const user of users) {
    const row = getStats(stats, user.department)
    row.totalUsers += 1
    if (user.active) row.activeUsers += 1
  }

  for (const request of requests) {
    const row = getStats(stats, request.department)
    row.totalRequests += 1
    row.requestedQty += (request.lines || []).reduce((sum, line) => sum + (line.requestedQty || 0), 0)
    const bucket = requestBucket(request)
    if (bucket === 'issued') row.issuedRequests += 1
    else if (bucket === 'rejectedCancelled') row.rejectedCancelledRequests += 1
    else if (bucket === 'poRequired') row.poRequiredRequests += 1
    else if (bucket === 'approved') row.approvedRequests += 1
    else row.pendingRequests += 1
  }

  for (const transaction of transactions) {
    const row = getStats(stats, transaction.user?.department)
    row.issueCount += 1
    row.issueQty += transaction.qty
    row.estSpend += transaction.qty * (transaction.item?.price || 0)
    if (!row.lastIssueDate || transaction.date > row.lastIssueDate) row.lastIssueDate = transaction.date
    row.topItems.set(transaction.itemName, (row.topItems.get(transaction.itemName) || 0) + transaction.qty)
  }

  const openPoStatuses = new Set(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT_TO_SUPPLIER', 'PARTIALLY_RECEIVED', 'INVOICE_PENDING'])
  for (const po of purchaseOrders) {
    const dept = po.linkedSr?.department || 'Unlinked PO'
    const row = getStats(stats, dept)
    row.poCount += 1
    row.poAmount += po.totalAmount || 0
    if (openPoStatuses.has(po.status)) row.openPoCount += 1
  }

  const rows = Array.from(stats.values()).map((row) => {
    const topIssuedItem = Array.from(row.topItems.entries()).sort((a, b) => b[1] - a[1])[0]
    const lastIssueLabel = row.lastIssueDate
      ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(row.lastIssueDate)
      : '-'
    return {
      ...row,
      estSpendLabel: money(row.estSpend),
      lastIssueLabel,
      topIssuedItem: topIssuedItem ? `${topIssuedItem[0]} (${number(topIssuedItem[1])})` : '-',
    }
  }).sort((a, b) => a.department.localeCompare(b.department))

  const summary = {
    generatedAt: reportTimestamp(),
    departments: rows.length,
    activeUsers: rows.reduce((sum, row) => sum + row.activeUsers, 0),
    requests: rows.reduce((sum, row) => sum + row.totalRequests, 0),
    issueQty: rows.reduce((sum, row) => sum + row.issueQty, 0),
    estSpend: rows.reduce((sum, row) => sum + row.estSpend, 0),
    openPoCount: rows.reduce((sum, row) => sum + row.openPoCount, 0),
  }

  mkdirSync('docs', { recursive: true })
  const date = reportDate()
  const pdfPath = `docs/DEPARTMENT_WISE_REPORT_${date}.pdf`
  const csvPath = `docs/DEPARTMENT_WISE_REPORT_${date}.csv`

  buildCsv(rows, csvPath)
  renderPdf(rows, summary, pdfPath)

  console.log(JSON.stringify({ pdfPath, csvPath, rows: rows.length, summary }, null, 2))
} finally {
  await db.$disconnect()
}
