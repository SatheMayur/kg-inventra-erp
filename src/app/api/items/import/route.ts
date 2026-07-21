import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { assertSpreadsheetSize } from '@/lib/upload-limits';

// Normalise a header string: lowercase, strip spaces/underscores
function normaliseKey(k: string): string {
  return String(k).toLowerCase().replace(/[\s_-]+/g, '');
}

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  itemname: 'name',
  category: 'category',
  unit: 'unit',
  stock: 'stock',
  qty: 'stock',
  quantity: 'stock',
  minstock: 'minStock',
  minimumstock: 'minStock',
  reorderpoint: 'minStock',
  price: 'price',
  rate: 'price',
  unitprice: 'price',
};

interface ParsedRow {
  name: string;
  category?: string;
  unit?: string;
  stock?: number;
  minStock?: number;
  price?: number;
}

interface RowError {
  row: number;
  message: string;
}

function parseNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    assertSpreadsheetSize(file);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    const validRows: ParsedRow[] = [];
    const errors: RowError[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const rowNum = i + 2; // 1-indexed + header row

      // Map raw keys to canonical names
      const mapped: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        const canonical = COLUMN_MAP[normaliseKey(k)];
        if (canonical) mapped[canonical] = v;
      }

      // Required: name
      const name = mapped.name ? String(mapped.name).trim() : '';
      if (!name) {
        errors.push({ row: rowNum, message: 'name is required' });
        continue;
      }

      // Optional numerics — validate if present
      let stock: number | undefined;
      let minStock: number | undefined;
      let price: number | undefined;

      if (mapped.stock !== undefined && mapped.stock !== '') {
        const n = parseNumber(mapped.stock);
        if (n === null || n < 0) {
          errors.push({ row: rowNum, message: `stock must be a valid non-negative number (got: ${mapped.stock})` });
          continue;
        }
        stock = Math.round(n);
      }

      if (mapped.minStock !== undefined && mapped.minStock !== '') {
        const n = parseNumber(mapped.minStock);
        if (n === null || n < 0) {
          errors.push({ row: rowNum, message: `minStock must be a valid non-negative number (got: ${mapped.minStock})` });
          continue;
        }
        minStock = Math.round(n);
      }

      if (mapped.price !== undefined && mapped.price !== '') {
        const n = parseNumber(mapped.price);
        if (n === null || n < 0) {
          errors.push({ row: rowNum, message: `price must be a valid non-negative number (got: ${mapped.price})` });
          continue;
        }
        price = n;
      }

      validRows.push({
        name,
        category: mapped.category ? String(mapped.category).trim() : undefined,
        unit: mapped.unit ? String(mapped.unit).trim() : undefined,
        stock,
        minStock,
        price,
      });
    }

    let imported = 0;
    let skipped = 0;

    await db.$transaction(async (tx) => {
      for (const row of validRows) {
        const existing = await tx.item.findFirst({
          where: { name: row.name, deletedAt: null },
        });
        if (existing) {
          skipped++;
          continue;
        }

        await tx.item.create({
          data: {
            name: row.name,
            category: row.category ?? 'General',
            unit: row.unit ?? 'pcs',
            stock: row.stock ?? 0,
            minStock: row.minStock ?? 0,
            price: row.price ?? 0,
            reservedQty: 0,
            version: 1,
          },
        });
        imported++;
      }
    });

    await createAuditLog({
      action: 'BULK_IMPORT',
      user: auth.user,
      metadata: { imported, skipped, errors: errors.length, source: 'file_import' },
    });

    return NextResponse.json({ imported, skipped, errors }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
