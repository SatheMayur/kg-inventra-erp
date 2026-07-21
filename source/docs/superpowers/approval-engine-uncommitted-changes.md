# Approval Engine — uncommitted edits in prior-WIP files

These feature edits were **applied to the working tree** but **not committed**, because each
file also contains unrelated prior WIP that can't be isolated from these lines non-interactively
(`git add -p` is unavailable in the build environment). They are recorded here exactly so they
can be verified or re-applied after the surrounding WIP is committed.

Spec: `docs/superpowers/specs/2026-06-23-approval-engine-design.md`.
Plan: `docs/superpowers/plans/2026-06-23-approval-engine.md`.
Clean (committed) parts of this feature: see `git log` for `feat(approvals): ...` commits
(pure rules core, engine, seed, route wiring, timeline, admin CRUD — the *new* files).

---

## 1. `prisma/schema.prisma` — three new models (Task 2)

Appended after the legacy `ApprovalLog` model (which is left in place). The live
`prisma/dev.db` was updated with `prisma db push` (purely additive: 3 `CREATE TABLE` +
3 `CREATE INDEX`, confirmed via `prisma migrate diff` — no drops/alters/data loss).

```prisma
model ApprovalWorkflow {
  id             String   @id @default(cuid())
  moduleName     String
  conditionType  String
  conditionValue String?
  approverRole   String
  sequence       Int
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([moduleName, active])
  @@map("approval_workflows")
}

model ApprovalInstance {
  id           String   @id @default(cuid())
  moduleName   String
  documentType String
  documentId   String
  status       String   @default("PENDING_APPROVAL")
  currentStep  Int      @default(1)
  createdById  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  steps        ApprovalStep[]
  @@index([moduleName, documentId])
  @@map("approval_instances")
}

model ApprovalStep {
  id           String    @id @default(cuid())
  instanceId   String
  sequence     Int
  approverRole String
  status       String    @default("PENDING")
  approvedById String?
  approvedAt   DateTime?
  remarks      String?
  instance     ApprovalInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  @@index([instanceId])
  @@map("approval_instance_steps")
}
```

---

### How to commit cleanly later
After committing your own WIP in these files, the lines above are already in the tree — just
`git add` each file. If you ever revert one of these files, re-apply from this record.
