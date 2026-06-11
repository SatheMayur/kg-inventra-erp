import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth-provider';
import { authorize } from '../../../../lib/auth';
import { GITHUB_CONFIG, getGitHubRawUrl } from '@/lib/github';

const DEFAULT_USERS = [
  { empId: 'jbshah', name: 'JB Shah', department: 'Admin', floor: 'SF-B2', role: 'admin', password: 'pass123', active: true },
  { empId: 'software', name: 'Software', department: 'Software', floor: 'SF-B2', role: 'admin', password: 'pass123', active: true },
  { empId: 'pappu', name: 'Pappu bhai', department: 'Fancy', floor: 'FF-B4', role: 'employee', password: 'pass123', active: true },
  { empId: 'hetal', name: 'Hetal bhai', department: 'Auto_Polish', floor: 'FF-B5', role: 'employee', password: 'pass123', active: true },
  { empId: 'vishal', name: 'Vishal bhai', department: 'Recut', floor: 'FF-B5', role: 'employee', password: 'pass123', active: true },
  { empId: 'security', name: 'Security', department: 'Security', floor: 'Entry_Exit_Gate', role: 'employee', password: 'pass123', active: true },
  { empId: 'dhruval', name: 'Dhruval bhai', department: 'CLV', floor: 'FF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'nitin', name: 'Nitin Variya', department: 'Galaxy', floor: 'FF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'ashishp', name: 'Ashish Patel', department: 'CLV', floor: 'FF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'nilay', name: 'Nilay bhai', department: 'CLV', floor: 'GF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'piyush', name: 'Piyush bhai', department: 'DNA', floor: 'FF-B4', role: 'employee', password: 'pass123', active: true },
  { empId: 'pankaj', name: 'Pankaj Shah', department: 'Lab', floor: 'FF-B3', role: 'employee', password: 'pass123', active: true },
  { empId: 'arpit', name: 'Arpit bhai', department: 'Manual Round', floor: 'FF-B4', role: 'employee', password: 'pass123', active: true },
  { empId: 'siril', name: 'Siril bhai', department: 'SPC_IT', floor: 'SF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'jayesh', name: 'Jayesh Tailor', department: 'HRD', floor: 'SF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'riken', name: 'Riken bhai', department: 'Rough analysis', floor: 'SF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'priyal', name: 'Priyal', department: 'Marketing', floor: 'SF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'aakash', name: 'Aakash bhai', department: 'Account', floor: 'SF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'nitintailor', name: 'Nitin Tailor', department: 'Store Manager', floor: 'SF-B6', role: 'employee', password: 'pass123', active: true },
  { empId: 'nimesh', name: 'Nimesh bhai', department: 'Laser', floor: 'FF-B5', role: 'employee', password: 'pass123', active: true },
  { empId: 'piyushr', name: 'Piyush Rawal', department: 'Lab', floor: 'FF-B3', role: 'employee', password: 'pass123', active: true },
  { empId: 'rkbhai', name: 'RK bhai', department: 'Xray', floor: 'FF-B5', role: 'employee', password: 'pass123', active: true },
  { empId: 'jatin', name: 'Jatin bhai', department: 'Stock control', floor: 'FF-B3', role: 'employee', password: 'pass123', active: true },
  { empId: 'kamlesh', name: 'Kamlesh bhai', department: 'Admin', floor: 'FF-B3', role: 'employee', password: 'pass123', active: true },
  { empId: 'chintan', name: 'Chintan bhai', department: 'Hardware', floor: 'FF-B1', role: 'employee', password: 'pass123', active: true },
  { empId: 'monil', name: 'Monil bhai', department: 'Admin', floor: 'SF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'micky', name: 'Micky bhai', department: 'BMS', floor: 'FF-B4', role: 'employee', password: 'pass123', active: true },
  { empId: 'sandeshr', name: 'Sandesh Rawal', department: 'Program', floor: 'FF-B2', role: 'employee', password: 'pass123', active: true },
  { empId: 'program', name: 'Program', department: 'Admin', floor: 'GF-B3', role: 'employee', password: 'pass123', active: true },
  { empId: 'kirtichand', name: 'Kirti Chand', department: 'HR', floor: 'SF02', role: 'employee', password: 'pass123', active: true },
  { empId: 'jitendra', name: 'Jitendra', department: 'R & D', floor: 'SF-B2', role: 'employee', password: 'pass123', active: true },
];

const DEFAULT_ITEMS = [
  { name: 'Blue Gel Pen', category: 'Stationery', unit: 'pcs', stock: 120, minStock: 20, reservedQty: 0, version: 1 },
  { name: 'A4 Paper Ream', category: 'Stationery', unit: 'reams', stock: 8, minStock: 10, reservedQty: 0, version: 1 },
  { name: 'Sticky Notes', category: 'Stationery', unit: 'packs', stock: 45, minStock: 15, reservedQty: 0, version: 1 },
  { name: 'HDMI Cable 2m', category: 'Electronics', unit: 'pcs', stock: 6, minStock: 5, reservedQty: 0, version: 1 },
  { name: 'USB-C Hub', category: 'Electronics', unit: 'pcs', stock: 3, minStock: 5, reservedQty: 0, version: 1 },
  { name: 'Whiteboard Marker', category: 'Stationery', unit: 'pcs', stock: 0, minStock: 10, reservedQty: 0, version: 1 },
  { name: 'Hand Sanitizer', category: 'Hygiene', unit: 'bottles', stock: 30, minStock: 10, reservedQty: 0, version: 1 },
  { name: 'Laptop Stand', category: 'Electronics', unit: 'pcs', stock: 12, minStock: 3, reservedQty: 0, version: 1 },
  { name: 'Diamond Blade 4"', category: 'Tools', unit: 'pcs', stock: 15, minStock: 5, reservedQty: 0, version: 1 },
  { name: 'Polishing Compound', category: 'Consumables', unit: 'tubes', stock: 22, minStock: 8, reservedQty: 0, version: 1 },
  { name: 'Safety Goggles', category: 'Safety', unit: 'pcs', stock: 18, minStock: 10, reservedQty: 0, version: 1 },
  { name: 'Measuring Caliper', category: 'Tools', unit: 'pcs', stock: 4, minStock: 3, reservedQty: 0, version: 1 },
];

const DEFAULT_FLAGS = [
  { key: 'csvExport', value: true },
  { key: 'tooltips', value: true },
  { key: 'reporting', value: true },
  { key: 'barcode', value: false },
];

// Centralized config moved to src/lib/github.ts

async function fetchGitHubData<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(getGitHubRawUrl(fileName), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {
    // fetch failed — use fallback
  }
  return fallback;
}

export async function POST(request: NextRequest) {
  // 1. Seed endpoint is disabled in production — check first before any auth bypass
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  // 2. If users already exist, require admin auth to prevent credential reset
  const userCount = await db.user.count();
  if (userCount > 0) {
    const auth = await authorize(request, ['admin'], { rootOnly: true });
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  }

  try {
    // Attempt to pull latest data from GitHub, fall back to hardcoded defaults
    const usersToSeed = await fetchGitHubData(GITHUB_CONFIG.FILES.USERS, DEFAULT_USERS);
    const itemsToSeed = await fetchGitHubData(GITHUB_CONFIG.FILES.ITEMS, DEFAULT_ITEMS);

    // Hash all passwords BEFORE the transaction — PBKDF2 is slow (~300ms each)
    // and doing 31 hashes inside a transaction causes SQLite timeout
    const hashedUsers = await Promise.all(
      usersToSeed.map(async (user: any) => ({
        ...user,
        password: await hashPassword(user.password || 'pass123'),
      }))
    );

    await db.$transaction(async (tx) => {
      // Upsert users with pre-hashed passwords
      for (const user of hashedUsers) {
        await tx.user.upsert({
          where: { empId: user.empId },
          update: { password: user.password },
          create: user,
        });
      }

      // Create items only if no record exists at all (including soft-deleted)
      for (const item of itemsToSeed) {
        const existing = await tx.item.findFirst({
          where: { name: item.name, category: item.category },
        });
        if (!existing) {
          await tx.item.create({ data: item });
        }
      }

      // Upsert feature flags
      for (const flag of DEFAULT_FLAGS) {
        await tx.featureFlag.upsert({
          where: { key: flag.key },
          update: {},
          create: flag,
        });
      }

      // Mark as seeded
      const existingFlag = await tx.seedFlag.findFirst();
      if (existingFlag) {
        await tx.seedFlag.update({ where: { id: existingFlag.id }, data: { seeded: true } });
      } else {
        await tx.seedFlag.create({ data: { seeded: true } });
      }
    }, { timeout: 120_000, maxWait: 20_000 }); // remote Postgres (Neon) latency makes the default 5s timeout too tight

    return NextResponse.json({ message: 'Database seeded successfully', seeded: true });
  } catch (error: unknown) {
    console.error('[seed] Failed:', error instanceof Error ? error.message : error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
