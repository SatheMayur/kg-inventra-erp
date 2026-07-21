/**
 * Prisma seed script — run via `npx prisma db seed`
 * Uses the same hashPassword function as the application.
 */
import { PrismaClient } from '@prisma/client'
import { pbkdf2Sync, randomBytes, createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import XLSX from 'xlsx'

const prisma = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex')
  const hash = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex')
  return `pbkdf2:${salt}:${hash}`
}

function computeRowHash(sheetName: string, row: any): string {
  const keys = Object.keys(row).sort()
  const sortedRow = keys.reduce((acc: any, key) => {
    acc[key] = row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : ''
    return acc
  }, {})
  const str = `${sheetName}:${JSON.stringify(sortedRow)}`
  return createHash('md5').update(str).digest('hex')
}

const USERS = [
  { empId: 'jbshah', name: 'JB Shah', department: 'Admin', floor: 'SF-B2', role: 'admin', password: 'pass123', phone: '919876543210' },
  { empId: 'software', name: 'Software', department: 'Software', floor: 'SF-B2', role: 'admin', password: 'pass123', phone: '919999999999' },
  { empId: 'pappu', name: 'Pappu bhai', department: 'Fancy', floor: 'FF-B4', role: 'employee', password: 'pass123' },
  { empId: 'hetal', name: 'Hetal bhai', department: 'Auto_Polish', floor: 'FF-B5', role: 'employee', password: 'pass123' },
  { empId: 'vishal', name: 'Vishal bhai', department: 'Recut', floor: 'FF-B5', role: 'employee', password: 'pass123' },
  { empId: 'security', name: 'Security', department: 'Security', floor: 'Entry_Exit_Gate', role: 'employee', password: 'pass123' },
  { empId: 'dhruval', name: 'Dhruval bhai', department: 'CLV', floor: 'FF-B2', role: 'employee', password: 'pass123' },
  { empId: 'nitin', name: 'Nitin Variya', department: 'Galaxy', floor: 'FF-B2', role: 'employee', password: 'pass123' },
  { empId: 'ashishp', name: 'Ashish Patel', department: 'CLV', floor: 'FF-B2', role: 'employee', password: 'pass123' },
  { empId: 'nilay', name: 'Nilay bhai', department: 'CLV', floor: 'GF-B2', role: 'employee', password: 'pass123' },
  { empId: 'piyush', name: 'Piyush bhai', department: 'DNA', floor: 'FF-B4', role: 'employee', password: 'pass123' },
  { empId: 'pankaj', name: 'Pankaj Shah', department: 'Lab', floor: 'FF-B3', role: 'employee', password: 'pass123' },
  { empId: 'arpit', name: 'Arpit bhai', department: 'Manual Round', floor: 'FF-B4', role: 'employee', password: 'pass123' },
  { empId: 'siril', name: 'Siril bhai', department: 'SPC_IT', floor: 'SF-B2', role: 'employee', password: 'pass123' },
  { empId: 'jayesh', name: 'Jayesh Tailor', department: 'HRD', floor: 'SF-B2', role: 'employee', password: 'pass123' },
  { empId: 'riken', name: 'Riken bhai', department: 'Rough analysis', floor: 'SF-B2', role: 'employee', password: 'pass123' },
  { empId: 'priyal', name: 'Priyal', department: 'Marketing', floor: 'SF-B2', role: 'employee', password: 'pass123' },
  { empId: 'aakash', name: 'Aakash bhai', department: 'Account', floor: 'SF-B2', role: 'employee', password: 'pass123' },
  { empId: 'nitintailor', name: 'Nitin Tailor', department: 'Store Manager', floor: 'SF-B6', role: 'employee', password: 'pass123', phone: '918888888888' },
  { empId: 'nimesh', name: 'Nimesh bhai', department: 'Laser', floor: 'FF-B5', role: 'employee', password: 'pass123' },
  { empId: 'piyushr', name: 'Piyush Rawal', department: 'Lab', floor: 'FF-B3', role: 'employee', password: 'pass123' },
  { empId: 'rkbhai', name: 'RK bhai', department: 'Xray', floor: 'FF-B5', role: 'employee', password: 'pass123' },
  { empId: 'jatin', name: 'Jatin bhai', department: 'Stock control', floor: 'FF-B3', role: 'employee', password: 'pass123' },
  { empId: 'kamlesh', name: 'Kamlesh bhai', department: 'Admin', floor: 'FF-B3', role: 'employee', password: 'pass123' },
  { empId: 'chintan', name: 'Chintan bhai', department: 'Hardware', floor: 'FF-B1', role: 'employee', password: 'pass123' },
  { empId: 'monil', name: 'Monil bhai', department: 'Admin', floor: 'SF-B2', role: 'employee', password: 'pass123' },
  { empId: 'micky', name: 'Micky bhai', department: 'BMS', floor: 'FF-B4', role: 'employee', password: 'pass123' },
  { empId: 'sandeshr', name: 'Sandesh Rawal', department: 'CLV', floor: 'FF-B2', role: 'DEPT_HEAD', password: 'pass123', isDeptHead: true },
  { empId: 'program', name: 'Program', department: 'Admin', floor: 'GF-B3', role: 'employee', password: 'pass123' },
  { empId: 'kirtichand', name: 'Kirti Chand', department: 'HR', floor: 'SF02', role: 'employee', password: 'pass123' },
  { empId: 'jitendra', name: 'Jitendra', department: 'R & D', floor: 'SF-B2', role: 'employee', password: 'pass123' },
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
  { key: 'csvExport',                     value: true  },
  { key: 'tooltips',                      value: true  },
  { key: 'reporting',                     value: true  },
  { key: 'barcode',                       value: false },
  { key: 'apply_historical_issues_to_stock', value: false }
]

async function main() {
  console.log('Seeding database...')

  // Feature flags are always needed by the app.
  for (const flag of FLAGS) {
    await prisma.featureFlag.upsert({ where: { key: flag.key }, update: {}, create: flag })
  }

  // Seed Admin & Users (Always required)
  const adminEmpId = process.env.ADMIN_EMPID
  const adminPassword = process.env.ADMIN_PASSWORD

  if (adminEmpId && adminPassword) {
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
  }

  if (!adminEmpId || !adminPassword || process.env.SEED_DEMO === 'true') {
    for (const u of USERS) {
      const hashed = hashPassword(u.password)
      await prisma.user.upsert({
        where: { empId: u.empId },
        update: {
          name: u.name,
          department: u.department,
          floor: u.floor,
          role: u.role,
          isDeptHead: u.isDeptHead || false,
          password: hashed,
          phone: u.phone,
        },
        create: { ...u, password: hashed, active: true },
      })
    }
    console.log('Seeded demo users (pass123) for development.')
  }

  // Try to find the historical store Excel sheet to seed departments and items
  let excelPath = ''
  const possiblePaths = [
    path.join(process.cwd(), '../kg_store_import_ready.xlsx'),
    path.join(process.cwd(), 'kg_store_import_ready.xlsx'),
    'd:\\Store_KG\\Store_KG\\kg_store_import_ready.xlsx',
    'D:\\Store_KG\\Store_KG\\kg_store_import_ready.xlsx'
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      excelPath = p
      break
    }
  }

  if (excelPath) {
    console.log(`Found historical Excel workbook at "${excelPath}". Parsing and seeding sheets...`)
    try {
      const wb = XLSX.readFile(excelPath)
      const deptSheet = wb.Sheets['Department_Master_Seed']
      const itemSheet = wb.Sheets['Item_Master_Seed']
      const transSheet = wb.Sheets['Issue_Transactions']

      if (!deptSheet || !itemSheet || !transSheet) {
        throw new Error('Workbook is missing one of the required historical sheets.')
      }

      const departmentsRaw = XLSX.utils.sheet_to_json(deptSheet, { defval: '' }) as Record<string, any>[]
      const itemsRaw = XLSX.utils.sheet_to_json(itemSheet, { defval: '' }) as Record<string, any>[]
      const transactionsRaw = XLSX.utils.sheet_to_json(transSheet, { defval: '' }) as Record<string, any>[]

      const batchId = 'cmqm7imx2000080s8x8msmylx'
      const fileName = path.basename(excelPath)

      // Perform all database operations inside a single transaction
      await prisma.$transaction(async (tx) => {
        // 1. Create/Update ImportBatch
        await tx.importBatch.upsert({
          where: { id: batchId },
          update: {
            fileName,
            status: 'COMPLETED',
            totalRows: departmentsRaw.length + itemsRaw.length + transactionsRaw.length,
            validRows: departmentsRaw.length + itemsRaw.length + transactionsRaw.length,
            errorRows: 0,
            completedAt: new Date(),
            createdBy: 'SYSTEM_SEED'
          },
          create: {
            id: batchId,
            fileName,
            status: 'COMPLETED',
            totalRows: departmentsRaw.length + itemsRaw.length + transactionsRaw.length,
            validRows: departmentsRaw.length + itemsRaw.length + transactionsRaw.length,
            errorRows: 0,
            startedAt: new Date(),
            completedAt: new Date(),
            createdBy: 'SYSTEM_SEED'
          }
        })

        // 2. Seed departments
        let seededDepts = 0
        for (let i = 0; i < departmentsRaw.length; i++) {
          const row = departmentsRaw[i]
          const rowNum = i + 2
          const name = String(row.department_name).trim()
          if (!name) continue
          const hash = computeRowHash('Department_Master_Seed', row)

          await tx.department.upsert({
            where: { name },
            update: {
              active: true,
              rowHash: hash,
              importBatchId: batchId,
              sourceFileName: fileName,
              sourceSheetName: 'Department_Master_Seed',
              sourceRowNumber: rowNum,
              sourceChannel: 'IMPORT',
              createdBy: 'SYSTEM_SEED'
            },
            create: {
              name,
              active: true,
              rowHash: hash,
              importBatchId: batchId,
              sourceFileName: fileName,
              sourceSheetName: 'Department_Master_Seed',
              sourceRowNumber: rowNum,
              sourceChannel: 'IMPORT',
              createdBy: 'SYSTEM_SEED'
            }
          })
          seededDepts++
        }
        console.log(`Seeded ${seededDepts} departments from Department_Master_Seed.`)

        // 3. Seed items
        let seededItems = 0
        const itemNameToItemMap = new Map<string, any>()
        
        // Cache existing active items
        const existingDbItems = await tx.item.findMany({
          where: { deletedAt: null }
        })
        for (const item of existingDbItems) {
          itemNameToItemMap.set(item.name.toLowerCase(), item)
        }

        for (let i = 0; i < itemsRaw.length; i++) {
          const row = itemsRaw[i]
          const rowNum = i + 2
          const name = String(row.item_name).trim()
          if (!name) continue

          const sourceItemName = row.source_item_name ? String(row.source_item_name).trim() : null
          const category = row.category ? String(row.category).trim() : 'General'
          const unit = row.unit ? String(row.unit).trim() : 'pcs'
          const hash = computeRowHash('Item_Master_Seed', row)
          const normName = name.toLowerCase()

          let item = itemNameToItemMap.get(normName)

          if (!item) {
            item = await tx.item.create({
              data: {
                name,
                sourceItemName,
                category,
                unit,
                stock: 0,
                minStock: 10,
                reservedQty: 0,
                active: true,
                importBatchId: batchId,
                sourceFileName: fileName,
                sourceSheetName: 'Item_Master_Seed',
                sourceRowNumber: rowNum,
                sourceChannel: 'IMPORT',
                rowHash: hash,
                createdBy: 'SYSTEM_SEED'
              }
            })
            itemNameToItemMap.set(normName, item)
          } else {
            item = await tx.item.update({
              where: { id: item.id },
              data: {
                sourceItemName: sourceItemName || item.sourceItemName,
                category: category !== 'General' ? category : item.category,
                unit: unit !== 'pcs' ? unit : item.unit,
                importBatchId: batchId,
                sourceFileName: fileName,
                sourceSheetName: 'Item_Master_Seed',
                sourceRowNumber: rowNum,
                sourceChannel: 'IMPORT',
                rowHash: hash,
                createdBy: 'SYSTEM_SEED'
              }
            })
            itemNameToItemMap.set(normName, item)
          }
          seededItems++
        }
        console.log(`Seeded/Updated ${seededItems} items from Item_Master_Seed.`)

        // 4. Seed transactions
        let seededTrans = 0
        
        // Cache existing transaction hashes to avoid findFirst per row
        const existingTxHashes = new Set<string>()
        const dbTxs = await tx.transaction.findMany({
          select: { rowHash: true }
        })
        for (const t of dbTxs) {
          if (t.rowHash) existingTxHashes.add(t.rowHash)
        }

        for (let i = 0; i < transactionsRaw.length; i++) {
          const row = transactionsRaw[i]
          const rowNum = i + 2
          const deptName = String(row.department).trim()
          const itemName = String(row.item_name).trim()
          const qty = Number(row.quantity)
          if (!itemName || isNaN(qty) || qty <= 0) continue

          const hash = computeRowHash('Issue_Transactions', row)
          const item = itemNameToItemMap.get(itemName.toLowerCase())
          if (!item) continue

          if (!existingTxHashes.has(hash)) {
            await tx.transaction.create({
              data: {
                type: 'OUT',
                subType: 'ISSUE',
                itemId: item.id,
                itemName: item.name,
                qty: qty,
                balanceAfter: item.stock,
                referenceType: 'IMPORT',
                reference: `Import row ${rowNum}`,
                remarks: `Historical consumption imported. Department: ${deptName}`,
                status: 'HISTORICAL',
                importBatchId: batchId,
                sourceFileName: fileName,
                sourceSheetName: 'Issue_Transactions',
                sourceRowNumber: rowNum,
                sourceChannel: 'IMPORT',
                rowHash: hash,
                createdBy: 'SYSTEM_SEED'
              }
            })
            seededTrans++
            existingTxHashes.add(hash)
          }
        }
        console.log(`Seeded ${seededTrans} transactions from Issue_Transactions.`)
      }, {
        timeout: 60000 // 60s timeout for bulk SQLite seeding
      })

    } catch (err: any) {
      console.error('Error parsing and seeding historical sheets:', err.message || err)
    }
  } else {
    console.log('[WARNING] kg_store_import_ready.xlsx not found on disk. Falling back to default demo items.')
    // Seed default items only as fallback
    for (const item of ITEMS) {
      const existing = await prisma.item.findFirst({ where: { name: item.name, category: item.category, deletedAt: null } })
      if (!existing) {
        await prisma.item.create({ data: { ...item, reservedQty: 0, version: 1 } })
      }
    }
    console.log('Seeded standard fallback items.')
  }

  // Seed default approval workflows (configurable approval engine)
  console.log('Seeding default approval workflows...')
  const APPROVAL_DEFAULTS = [
    { moduleName: 'STORE_REQUISITION', conditionType: 'ALWAYS',     conditionValue: null,     approverRole: 'DEPT_HEAD',     sequence: 1, active: true },
    { moduleName: 'STORE_REQUISITION', conditionType: 'AMOUNT_GTE', conditionValue: '10000',  approverRole: 'ACCOUNTS_USER', sequence: 2, active: false },
    { moduleName: 'PURCHASE_ORDER',    conditionType: 'ALWAYS',     conditionValue: null,     approverRole: 'STORE_ADMIN',   sequence: 1, active: true },
    { moduleName: 'PURCHASE_ORDER',    conditionType: 'AMOUNT_GTE', conditionValue: '100000', approverRole: 'ACCOUNTS_USER', sequence: 2, active: false },
  ]
  for (const rule of APPROVAL_DEFAULTS) {
    const existing = await prisma.approvalWorkflow.findFirst({
      where: {
        moduleName: rule.moduleName,
        sequence: rule.sequence,
        approverRole: rule.approverRole,
      },
    })
    if (existing) {
      console.log(`= exists  ${rule.moduleName} seq${rule.sequence} ${rule.approverRole} (left as-is)`)
    } else {
      await prisma.approvalWorkflow.create({ data: rule })
      console.log(`+ created ${rule.moduleName} seq${rule.sequence} ${rule.approverRole} active=${rule.active}`)
    }
  }

  console.log('Seeding complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
