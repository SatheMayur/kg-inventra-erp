// One-off data migration for the Request -> Request + RequestLine split.
// Creates one RequestLine per existing legacy Request (single-line era), mapping
// qty/status into requestedQty/approvedQty/issuedQty. Idempotent: requests that
// already have lines are skipped, so it is safe to re-run.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const lineStatusFor = (s) => (s === 'ReadyForPickup' ? 'Approved' : s)
const APPROVED_STATES = ['Approved', 'ReadyForPickup', 'Issued', 'PartiallyIssued']

const run = async () => {
  const requests = await db.request.findMany()
  let created = 0
  let skipped = 0
  for (const r of requests) {
    const existing = await db.requestLine.count({ where: { requestId: r.id } })
    if (existing > 0) {
      skipped++
      continue
    }
    const approvedQty = APPROVED_STATES.includes(r.status) ? r.qty : 0
    const issuedQty = r.status === 'Issued' ? r.qty : 0
    await db.requestLine.create({
      data: {
        requestId: r.id,
        itemId: r.itemId,
        itemName: r.itemName,
        requestedQty: r.qty,
        approvedQty,
        issuedQty,
        status: lineStatusFor(r.status),
      },
    })
    created++
  }
  console.log(`backfill done: created=${created} skipped=${skipped} total=${requests.length}`)
  await db.$disconnect()
}

run().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
