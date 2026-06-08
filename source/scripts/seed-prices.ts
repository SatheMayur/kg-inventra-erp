import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const items = await prisma.item.findMany()
  for (const item of items) {
    const randomPrice = Math.floor(Math.random() * 500) + 10
    await prisma.item.update({
      where: { id: item.id },
      data: { price: randomPrice }
    })
    console.log(`Updated ${item.name} with price ₹${randomPrice}`)
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
