import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

const DEFAULT_DEPARTMENTS = [
  'Admin', 'Account', 'Auto_Polish', 'BMS', 'CLV', 'DNA', 'Fancy', 'Galaxy',
  'Hardware', 'HR', 'HRD', 'Lab', 'Laser', 'Manual Round', 'Marketing',
  'Program', 'R & D', 'Recut', 'Rough analysis', 'Security', 'Software',
  'SPC_IT', 'Stock control', 'Store Manager', 'Xray',
];

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin', 'employee']);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const dbDepts = await db.department.findMany({
      where: { active: true },
      select: { name: true }
    });

    const dbDeptNames = dbDepts.map(d => d.name.trim());
    
    // Merge defaults and DB items, remove duplicates, sort alphabetically
    const combined = Array.from(new Set([...DEFAULT_DEPARTMENTS, ...dbDeptNames])).sort();

    return NextResponse.json({ departments: combined });
  } catch (error) {
    return handleApiError(error);
  }
}
