import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from './db'
import { generateToken } from './jwt'
import { POST as createDailyBatch } from '@/app/api/daily-procurement/route'
import { GET as listItems, POST as createItem } from '@/app/api/items/route'
import { PATCH as updateItem } from '@/app/api/items/[id]/route'
import { POST as importDailyItems } from '@/app/api/items/daily-import/route'

const PREFIX = 'daily-item-api'

const users = {
  purchase: {
    id: `${PREFIX}-purchase`,
    empId: `${PREFIX}-purchase`,
    name: 'Daily Item Purchase',
    department: 'Purchase',
    role: 'PURCHASE_USER' as const,
    password: 'password',
    active: true,
  },
  employee: {
    id: `${PREFIX}-employee`,
    empId: `${PREFIX}-employee`,
    name: 'Daily Item Employee',
    department: 'Kitchen',
    role: 'employee' as const,
    password: 'password',
    active: true,
  },
  admin: {
    id: `${PREFIX}-admin`,
    empId: `${PREFIX}-admin`,
    name: 'Daily Item Admin',
    department: 'Admin',
    role: 'STORE_ADMIN' as const,
    password: 'password',
    active: true,
  },
}

const ids = {
  daily: `${PREFIX}-daily-tomato`,
  both: `${PREFIX}-both-onion`,
  standard: `${PREFIX}-standard-wrench`,
  service: `${PREFIX}-service-repair`,
}

async function cleanupFixtures() {
  await db.itemAlias.deleteMany({ where: { itemId: { startsWith: PREFIX } } })
  await db.item.deleteMany({
    where: {
      OR: [
        { id: { startsWith: PREFIX } },
        { name: { contains: PREFIX } },
      ],
    },
  })
  await db.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function seedFixtures() {
  await db.user.createMany({ data: Object.values(users) })
  await db.item.createMany({
    data: [
      {
        id: ids.daily,
        name: `${PREFIX} Daily Tomato`,
        category: 'Vegetables',
        unit: 'kg',
        stock: 10,
        minStock: 0,
        active: true,
        procurementType: 'DAILY',
        pricingMode: 'DAILY_MARKET_RATE',
        itemNature: 'PERISHABLE',
        baseUnit: 'kg',
        purchaseUnit: 'kg',
        consumptionUnit: 'kg',
        dailyProcurementEligible: true,
        perishable: true,
      },
      {
        id: ids.both,
        name: `${PREFIX} Both Onion`,
        category: 'Vegetables',
        unit: 'kg',
        stock: 8,
        minStock: 0,
        active: true,
        procurementType: 'BOTH',
        pricingMode: 'DAILY_MARKET_RATE',
        itemNature: 'PERISHABLE',
        baseUnit: 'kg',
        purchaseUnit: 'kg',
        consumptionUnit: 'kg',
        dailyProcurementEligible: true,
        perishable: true,
      },
      {
        id: ids.standard,
        name: `${PREFIX} Standard Wrench`,
        category: 'Tools',
        unit: 'pcs',
        stock: 4,
        minStock: 0,
        active: true,
        procurementType: 'STANDARD',
        pricingMode: 'LAST_APPROVED_RATE',
        itemNature: 'NON_PERISHABLE',
        dailyProcurementEligible: false,
      },
      {
        id: ids.service,
        name: `${PREFIX} Service Repair`,
        category: 'Services',
        unit: 'job',
        stock: 0,
        minStock: 0,
        active: true,
        procurementType: 'DAILY',
        pricingMode: 'MANUAL_QUOTATION',
        itemNature: 'SERVICE',
        dailyProcurementEligible: true,
      },
    ],
  })
  await db.itemAlias.create({
    data: {
      itemId: ids.daily,
      aliasText: `${PREFIX} fresh tamatar`,
      sourceType: 'manual_entry',
      confidenceScore: 1,
      timesMatched: 5,
    },
  })
}

async function tokenFor(user: typeof users[keyof typeof users]) {
  return generateToken({
    id: user.id,
    empId: user.empId,
    name: user.name,
    department: user.department,
    role: user.role,
  })
}

async function makeRequest(path: string, method: string, body: unknown, user: typeof users[keyof typeof users] = users.purchase) {
  const token = await tokenFor(user)
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('Daily Procurement shared item master APIs', () => {
  beforeEach(async () => {
    await cleanupFixtures()
    await seedFixtures()
  })

  afterEach(async () => {
    await cleanupFixtures()
  })

  it('filters Daily Procurement items and searches aliases without returning standard or service items', async () => {
    const res = await listItems(await makeRequest('/api/items?procurementContext=daily&pageSize=1000', 'GET', undefined))
    const data = await res.json()
    const names = data.items.map((item: any) => item.name)

    expect(res.status).toBe(200)
    expect(names).toContain(`${PREFIX} Daily Tomato`)
    expect(names).toContain(`${PREFIX} Both Onion`)
    expect(names).not.toContain(`${PREFIX} Standard Wrench`)
    expect(names).not.toContain(`${PREFIX} Service Repair`)

    const aliasRes = await listItems(await makeRequest(`/api/items?procurementContext=daily&search=${PREFIX}%20fresh%20tamatar&pageSize=1000`, 'GET', undefined))
    const aliasData = await aliasRes.json()
    expect(aliasData.items.map((item: any) => item.id)).toContain(ids.daily)
  })

  it('quick-adds a review-required daily item and blocks unauthorized users', async () => {
    const quickAddRes = await createItem(await makeRequest('/api/items', 'POST', {
      name: `${PREFIX} Quick Mint`,
      category: 'Vegetables',
      unit: 'kg',
      sourceChannel: 'DAILY_PROCUREMENT_QUICK_ADD',
    }))
    const quickAddData = await quickAddRes.json()

    expect(quickAddRes.status).toBe(201)
    expect(quickAddData.item.procurementType).toBe('DAILY')
    expect(quickAddData.item.dailyProcurementEligible).toBe(true)
    expect(quickAddData.item.requiresMasterReview).toBe(true)
    expect(quickAddData.item.sourceChannel).toBe('DAILY_PROCUREMENT_QUICK_ADD')

    const forbiddenRes = await createItem(await makeRequest('/api/items', 'POST', {
      name: `${PREFIX} Forbidden Basil`,
      category: 'Vegetables',
      unit: 'kg',
      sourceChannel: 'DAILY_PROCUREMENT_QUICK_ADD',
    }, users.employee))
    expect(forbiddenRes.status).toBe(403)
  })

  it('returns duplicate match details for aliases and rejects ineligible items in Daily Procurement batches', async () => {
    const duplicateRes = await createItem(await makeRequest('/api/items', 'POST', {
      name: `${PREFIX} fresh tamatar`,
      category: 'Vegetables',
      unit: 'kg',
      sourceChannel: 'DAILY_PROCUREMENT_INLINE',
      procurementType: 'DAILY',
      pricingMode: 'DAILY_MARKET_RATE',
      itemNature: 'PERISHABLE',
      dailyProcurementEligible: true,
    }))
    const duplicateData = await duplicateRes.json()

    expect(duplicateRes.status).toBe(409)
    expect(duplicateData.code).toBe('ITEM_DUPLICATE')
    expect(duplicateData.matches[0].matchType).toBe('EXACT_ALIAS')

    const batchRes = await createDailyBatch(await makeRequest('/api/daily-procurement', 'POST', {
      deliveryDate: '2026-07-19',
      deliveryLocation: 'Central Kitchen',
      lines: [
        {
          itemId: ids.standard,
          operationalRequirement: 5,
          requiredClosingStock: 0,
        },
      ],
    }))
    const batchData = await batchRes.json()

    expect(batchRes.status).toBe(400)
    expect(batchData.error).toContain('not eligible for Daily Procurement')
  })

  it('surfaces a misspelled alias match from a different category instead of creating a silent duplicate', async () => {
    // "fresh tamater" is a misspelling of the Daily Tomato alias "fresh tamatar",
    // entered under a DIFFERENT category (Grocery). Before cross-category +
    // alias-aware fuzzy matching this created a silent duplicate; now it must be
    // surfaced as a match against the existing item.
    const res = await createItem(await makeRequest('/api/items', 'POST', {
      name: `${PREFIX} fresh tamater`,
      category: 'Grocery',
      unit: 'kg',
      sourceChannel: 'DAILY_PROCUREMENT_INLINE',
      procurementType: 'DAILY',
      pricingMode: 'DAILY_MARKET_RATE',
      itemNature: 'PERISHABLE',
      dailyProcurementEligible: true,
    }))
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.code).toBe('ITEM_DUPLICATE')
    expect(data.matches.map((match: any) => match.itemId)).toContain(ids.daily)
  })

  it('validates daily item imports row-by-row and commits only fully valid files', async () => {
    const previewRows = [
      { 'Item name': `${PREFIX} Import Cabbage`, Category: 'Vegetables', 'Base unit': 'kg', 'Unit conversion': 1 },
      { 'Item name': `${PREFIX} Import Cabbage`, Category: 'Vegetables', 'Base unit': 'kg', 'Unit conversion': 1 },
      { 'Item name': `${PREFIX} Bad Conversion`, Category: 'Vegetables', 'Base unit': 'kg', 'Unit conversion': 0 },
      { 'Item name': `${PREFIX} Bad Category`, Category: 'Unknown Category', 'Base unit': 'kg', 'Unit conversion': 1 },
      { 'Item name': `${PREFIX} Missing Vendor`, Category: 'Vegetables', 'Base unit': 'kg', 'Preferred vendor': 'No Such Vendor' },
    ]

    const previewRes = await importDailyItems(await makeRequest('/api/items/daily-import', 'POST', { rows: previewRows, commit: false }))
    const previewData = await previewRes.json()
    expect(previewRes.status).toBe(200)
    expect(previewData.rows.map((row: any) => row.status)).toEqual([
      'VALID',
      'DUPLICATE',
      'INVALID_CONVERSION',
      'INVALID_CATEGORY',
      'VENDOR_NOT_FOUND',
    ])

    const blockedCommitRes = await importDailyItems(await makeRequest('/api/items/daily-import', 'POST', { rows: previewRows, commit: true }))
    expect(blockedCommitRes.status).toBe(400)
    expect(await db.item.findFirst({ where: { name: `${PREFIX} Import Cabbage` } })).toBeNull()

    const commitRes = await importDailyItems(await makeRequest('/api/items/daily-import', 'POST', {
      rows: [{ 'Item name': `${PREFIX} Import Potato`, Category: 'Vegetables', 'Base unit': 'kg', 'Purchase unit': 'kg', 'Consumption unit': 'kg' }],
      commit: true,
    }))
    const commitData = await commitRes.json()
    expect(commitRes.status).toBe(200)
    expect(commitData.importedCount).toBe(1)
    expect(commitData.rows[0].status).toBe('IMPORTED')
    expect(commitData.items[0].dailyProcurementEligible).toBe(true)
  })

  it('derives perishable from itemNature on create and ignores a divergent client value', async () => {
    const perishableRes = await createItem(await makeRequest('/api/items', 'POST', {
      name: `${PREFIX} Perishable Kale`,
      category: 'Vegetables',
      unit: 'kg',
      sourceChannel: 'DAILY_PROCUREMENT_INLINE',
      procurementType: 'DAILY',
      dailyProcurementEligible: true,
      itemNature: 'PERISHABLE',
    }))
    const perishableData = await perishableRes.json()
    expect(perishableRes.status).toBe(201)
    expect(perishableData.item.itemNature).toBe('PERISHABLE')
    expect(perishableData.item.perishable).toBe(true)

    // A NON_PERISHABLE item with a client-sent perishable:true must be stored as false —
    // itemNature is the single source of truth.
    const dryRes = await createItem(await makeRequest('/api/items', 'POST', {
      name: `${PREFIX} Dry Rice`,
      category: 'Grocery',
      unit: 'kg',
      sourceChannel: 'DAILY_PROCUREMENT_INLINE',
      procurementType: 'DAILY',
      dailyProcurementEligible: true,
      itemNature: 'NON_PERISHABLE',
      perishable: true,
    }))
    const dryData = await dryRes.json()
    expect(dryRes.status).toBe(201)
    expect(dryData.item.itemNature).toBe('NON_PERISHABLE')
    expect(dryData.item.perishable).toBe(false)
  })

  it('re-derives perishable when itemNature changes on update', async () => {
    // ids.daily is seeded PERISHABLE / perishable=true. Flipping nature must flip the flag.
    const res = await updateItem(
      await makeRequest(`/api/items/${ids.daily}`, 'PATCH', { itemNature: 'NON_PERISHABLE' }, users.admin),
      { params: Promise.resolve({ id: ids.daily }) },
    )
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.item.itemNature).toBe('NON_PERISHABLE')
    expect(data.item.perishable).toBe(false)
  })
})
