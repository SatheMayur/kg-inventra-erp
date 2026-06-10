/**
 * Prisma seed script — run via `npx prisma db seed`
 * Uses the same hashPassword function as the application.
 */
const { PrismaClient } = require('@prisma/client')
const { pbkdf2Sync, randomBytes } = require('crypto')

const prisma = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex')
  const hash = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex')
  return `pbkdf2:${salt}:${hash}`
}

const USERS = [
  { empId: 'jbshah',      name: 'JB Shah',        department: 'Admin',         floor: 'SF-B2',          role: 'admin',    password: 'pass123' },
  { empId: 'software',    name: 'Software',        department: 'Software',      floor: 'SF-B2',          role: 'admin',    password: 'pass123' },
  { empId: 'nitintailor', name: 'Nitin Tailor',    department: 'Store Manager', floor: 'SF-B6',          role: 'employee', password: 'pass123' },
]

const ITEMS = [
  { name: 'Blue Gel Pen',       category: 'Stationery',  unit: 'pcs',     stock: 120, minStock: 20 },
  { name: 'A4 Paper Ream',      category: 'Stationery',  unit: 'reams',   stock: 8,   minStock: 10 },
  { name: 'HDMI Cable 2m',      category: 'Electronics', unit: 'pcs',     stock: 6,   minStock: 5  },
  { name: 'USB-C Hub',          category: 'Electronics', unit: 'pcs',     stock: 3,   minStock: 5  },
  { name: 'Hand Sanitizer',     category: 'Hygiene',     unit: 'bottles', stock: 30,  minStock: 10 },
  { name: 'Safety Goggles',     category: 'Safety',      unit: 'pcs',     stock: 18,  minStock: 10 },
  { name: 'Diamond Blade 4"',   category: 'Tools',       unit: 'pcs',     stock: 15,  minStock: 5  },
  { name: 'Polishing Compound', category: 'Consumables', unit: 'tubes',   stock: 22,  minStock: 8  },
]

const FLAGS = [
  { key: 'csvExport',  value: true  },
  { key: 'tooltips',   value: true  },
  { key: 'reporting',  value: true  },
  { key: 'barcode',    value: false },
]

async function main() {
  console.log('Seeding database...')

  // Feature flags are always needed by the app.
  for (const flag of FLAGS) {
    await prisma.featureFlag.upsert({ where: { key: flag.key }, update: {}, create: flag })
  }

  const adminEmpId = process.env.ADMIN_EMPID
  const adminPassword = process.env.ADMIN_PASSWORD

  if (adminEmpId && adminPassword) {
    // Production handover: a single admin from env. No default passwords, no demo data.
    const hashed = hashPassword(adminPassword)
    await prisma.user.upsert({
      where: { empId: adminEmpId },
      update: { password: hashed, role: 'admin', active: true },
      create: {
        empId: adminEmpId,
        name: process.env.ADMIN_NAME || 'Administrator',
        department: process.env.ADMIN_DEPARTMENT || 'Admin',
        floor: '',
        role: 'admin',
        password: hashed,
        active: true,
      },
    })
    console.log(`Seeded production admin "${adminEmpId}".`)
  } else {
    // Dev fallback ONLY — insecure demo users (pass123) + sample catalog. Never in production.
    for (const u of USERS) {
      const hashed = hashPassword(u.password)
      await prisma.user.upsert({ where: { empId: u.empId }, update: { password: hashed }, create: { ...u, password: hashed, active: true } })
    }
    for (const item of ITEMS) {
      const existing = await prisma.item.findFirst({ where: { name: item.name, category: item.category, deletedAt: null } })
      if (!existing) await prisma.item.create({ data: { ...item, reservedQty: 0, version: 1 } })
    }
    console.log('Seeded DEV demo users (pass123) + sample items — insecure, dev only.')
  }

  console.log('Seeding complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
