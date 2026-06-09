import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEFS_FILE = path.join(process.cwd(), 'prisma', 'custom-field-defs.json');

export interface FieldDef {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  required: boolean;
}

function readDefs(): FieldDef[] {
  try {
    if (!fs.existsSync(DEFS_FILE)) return [];
    return JSON.parse(fs.readFileSync(DEFS_FILE, 'utf-8')) as FieldDef[];
  } catch {
    return [];
  }
}

function writeDefs(defs: FieldDef[]): void {
  const tmp = path.join(os.tmpdir(), `custom-field-defs-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(defs, null, 2), 'utf-8');
  fs.renameSync(tmp, DEFS_FILE);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    return NextResponse.json({ fields: readDefs() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { name, type, required } = body as { name?: string; type?: string; required?: boolean };

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ApiError(400, 'name is required', 'BAD_REQUEST');
    }
    if (!['text', 'number', 'date', 'boolean'].includes(type as string)) {
      throw new ApiError(400, 'type must be one of: text, number, date, boolean', 'BAD_REQUEST');
    }

    const defs = readDefs();
    const newDef: FieldDef = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type: type as FieldDef['type'],
      required: required === true,
    };
    defs.push(newDef);
    writeDefs(defs);

    return NextResponse.json({ field: newDef }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { id } = body as { id?: string };

    if (!id || typeof id !== 'string') {
      throw new ApiError(400, 'id is required', 'BAD_REQUEST');
    }

    const defs = readDefs();
    const idx = defs.findIndex((d) => d.id === id);
    if (idx === -1) throw new ApiError(404, 'Field definition not found', 'NOT_FOUND');

    defs.splice(idx, 1);
    writeDefs(defs);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
