// Seed default approval workflows (plan Task 4 / spec §5).
//
// The ACTIVE rows reproduce TODAY's single-approver behavior exactly, so wiring the
// existing routes through the engine changes nothing until an admin configures more:
//   STORE_REQUISITION  ALWAYS -> DEPT_HEAD     (today: dept-head approves)
//   PURCHASE_ORDER     ALWAYS -> STORE_ADMIN   (today: store admin signs off)
//
// The AMOUNT_GTE rows are seeded INACTIVE — they are the spec's ">limit needs finance"
// examples, present and ready but switched off so behavior is unchanged. An admin turns
// them on in the workflow admin screen (Task 8). (The PO threshold stands in for the
// design's PO_APPROVAL_LIMIT, which never existed as runtime config.)
//
// Idempotent: skip-if-exists on (moduleName, sequence, approverRole), so re-running
// never duplicates rows and never clobbers an admin's later edits.
//
// Run once after the schema push:
//   DATABASE_URL="file:./prisma/dev.db" node prisma/seed-approvals.mjs

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DEFAULTS = [
  { moduleName: 'STORE_REQUISITION', conditionType: 'ALWAYS',     conditionValue: null,     approverRole: 'DEPT_HEAD',     sequence: 1, active: true },
  { moduleName: 'STORE_REQUISITION', conditionType: 'AMOUNT_GTE', conditionValue: '10000',  approverRole: 'ACCOUNTS_USER', sequence: 2, active: false },
  { moduleName: 'PURCHASE_ORDER',    conditionType: 'ALWAYS',     conditionValue: null,     approverRole: 'STORE_ADMIN',   sequence: 1, active: true },
  { moduleName: 'PURCHASE_ORDER',    conditionType: 'AMOUNT_GTE', conditionValue: '100000', approverRole: 'ACCOUNTS_USER', sequence: 2, active: false },
]

async function main() {
  for (const rule of DEFAULTS) {
    const existing = await db.approvalWorkflow.findFirst({
      where: {
        moduleName: rule.moduleName,
        sequence: rule.sequence,
        approverRole: rule.approverRole,
      },
    })
    if (existing) {
      console.log(`= exists  ${rule.moduleName} seq${rule.sequence} ${rule.approverRole} (left as-is)`)
      continue
    }
    await db.approvalWorkflow.create({ data: rule })
    console.log(`+ created ${rule.moduleName} seq${rule.sequence} ${rule.approverRole} active=${rule.active}`)
  }
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
