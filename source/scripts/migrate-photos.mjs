// One-off: copy legacy Item.photoUrl values into the ItemImage table as primary images.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const items = await db.item.findMany({ where: { photoUrl: { not: null } }, select: { id: true, photoUrl: true } })
let migrated = 0
for (const it of items) {
  const exists = await db.itemImage.findFirst({ where: { itemId: it.id } })
  if (!exists) {
    await db.itemImage.create({
      data: { itemId: it.id, imagePath: it.photoUrl, thumbnailPath: it.photoUrl, isPrimary: true },
    })
    migrated++
  }
}
console.log(`legacy photos found: ${items.length}, migrated: ${migrated}`)
await db.$disconnect()
