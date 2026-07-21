import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const outputPath = 'docs/STORE_WORKFLOW_SIMPLE_GUIDE.pdf'
const pageWidth = 595
const pageHeight = 842

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

const ops = []

function rect(x, y, w, h, fill = [1, 1, 1], stroke = null) {
  ops.push('q')
  ops.push(`${fill.join(' ')} rg`)
  if (stroke) ops.push(`${stroke.join(' ')} RG 0.7 w`)
  ops.push(`${x} ${y} ${w} ${h} re ${stroke ? 'B' : 'f'}`)
  ops.push('Q')
}

function text(value, x, y, size = 10, font = 'F1', color = [0.13, 0.15, 0.18]) {
  ops.push('BT')
  ops.push(`/${font} ${size} Tf`)
  ops.push(`${color.join(' ')} rg`)
  ops.push(`${x} ${y} Td`)
  ops.push(`(${escapePdfText(value)}) Tj`)
  ops.push('ET')
}

function section(title, x, y) {
  text(title.toUpperCase(), x, y, 9.5, 'F2', [0.13, 0.21, 0.34])
  ops.push('q 0.35 0.49 0.72 RG 0.8 w')
  ops.push(`${x} ${y - 7} 232 0 m ${x + 232} ${y - 7} l S`)
  ops.push('Q')
}

function lines(items, x, startY, size = 9.2, gap = 13.2) {
  let y = startY
  for (const item of items) {
    text(item, x, y, size)
    y -= gap
  }
  return y
}

rect(0, 0, pageWidth, pageHeight, [0.98, 0.99, 1])
rect(0, 748, pageWidth, 94, [0.05, 0.12, 0.18])
text('KG Store Simple Workflow Guide', 38, 803, 21, 'F2', [1, 1, 1])
text('One-page guide for request, purchase order, receiving, and issue flow', 38, 779, 10.5, 'F1', [0.84, 0.92, 1])
text('Use this as the quick reference for daily store operations.', 38, 761, 9.2, 'F1', [0.72, 0.82, 0.9])

rect(34, 68, 254, 652, [1, 1, 1], [0.82, 0.87, 0.92])
rect(307, 68, 254, 652, [1, 1, 1], [0.82, 0.87, 0.92])

section('Main Flow', 50, 699)
lines([
  '1. Employee creates asset request.',
  '2. Manager/Admin approves or rejects.',
  '3. Store checks available stock.',
  '4. If stock is enough: reserve and issue.',
  '5. If stock is short: create PO/OP.',
  '6. Add item cost, transport, SGST/GST.',
  '7. Send order to vendor.',
  '8. Store receives items against PO.',
  '9. System adds received quantity to stock.',
  '10. Store proceeds to issue items.',
], 50, 675)

section('Cost Fields To Capture', 50, 520)
lines([
  '- Item unit price and quantity.',
  '- Transportation / freight cost.',
  '- SGST and GST values.',
  '- Vendor and expected delivery date.',
  '- Final total before confirming PO.',
], 50, 496)

section('Important Rules', 50, 405)
lines([
  '- Do not issue more than available stock.',
  '- Every shortage needs PO before issue.',
  '- Receiving PO items must increase stock.',
  '- Keep request status updated at each step.',
  '- Recheck totals before closing purchase.',
], 50, 381)

section('Status Meaning', 323, 699)
lines([
  '- Pending: waiting for approval.',
  '- Approved: request accepted.',
  '- Shortage: stock is not available.',
  '- PO Required: purchase must be created.',
  '- PO Ordered: vendor order placed.',
  '- Partially Received: some items received.',
  '- Received: items added to stock.',
  '- Issued: items given to employee.',
  '- Rejected/Closed: no further action.',
], 323, 675)

section('Who Does What', 323, 526)
lines([
  '- Employee: create request and track status.',
  '- Manager/Admin: approve or reject.',
  '- Store Manager: stock, PO, receive, issue.',
  '- Purchase/Admin: vendor, cost, tax checks.',
  '- Finance: verify totals when required.',
], 323, 502)

section('Next Action Guide', 323, 411)
lines([
  '- If Shortage: create PO/OP.',
  '- If vendor delivers: receive PO items.',
  '- If stock becomes available: issue items.',
  '- If issue is done: request becomes Issued.',
  '- If rejected: close with clear reason.',
], 323, 387)

rect(34, 28, 527, 26, [0.91, 0.95, 0.99], [0.78, 0.86, 0.94])
text('Quick check: Request approved -> Stock checked -> PO if shortage -> Receive -> Issue -> Close', 48, 38, 9, 'F2', [0.13, 0.21, 0.34])

const stream = ops.join('\n')
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
]

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

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, pdf, 'latin1')
console.log(outputPath)
