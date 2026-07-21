// One-off: rewrite stored image URLs from /uploads/... to /api/uploads/...
// (Next.js production only serves build-time public/ files; uploads now go through the API route.)
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const imgs = await db.itemImage.findMany()
for (const i of imgs) {
  await db.itemImage.update({
    where: { id: i.id },
    data: {
      imagePath: i.imagePath.replace(/^\/uploads\//, '/api/uploads/'),
      thumbnailPath: i.thumbnailPath.replace(/^\/uploads\//, '/api/uploads/'),
    },
  })
}
const items = await db.item.findMany({ where: { photoUrl: { startsWith: '/uploads/' } } })
for (const it of items) {
  await db.item.update({
    where: { id: it.id },
    data: { photoUrl: it.photoUrl.replace(/^\/uploads\//, '/api/uploads/') },
  })
}
console.log(`fixed images: ${imgs.length}, items: ${items.length}`)
await db.$disconnect()
