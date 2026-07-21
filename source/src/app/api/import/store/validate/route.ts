import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { parseExcelBuffer, validateHistoricalData } from '@/lib/historical-importer';
import { assertSpreadsheetSize } from '@/lib/upload-limits';

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    assertSpreadsheetSize(file);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Parse sheets
    const { departmentsRaw, itemsRaw, transactionsRaw } = parseExcelBuffer(buffer);

    // 2. Perform validation
    const errors = await validateHistoricalData(file.name, departmentsRaw, itemsRaw, transactionsRaw);

    const errorCount = errors.filter(e => e.type === 'ERROR').length;
    const totalRows = departmentsRaw.length + itemsRaw.length + transactionsRaw.length;
    const validRows = totalRows - errorCount;

    // Determine initial status
    const status = errorCount > 0 ? 'FAILED' : 'VALIDATED';

    // 3. Create ImportBatch row
    const batch = await db.importBatch.create({
      data: {
        fileName: file.name,
        status,
        totalRows,
        validRows,
        errorRows: errorCount,
        startedAt: new Date(),
        createdBy: auth.user?.name || auth.user?.empId || 'unknown'
      }
    });

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      status: batch.status,
      totalRows,
      validRows,
      errorRows: errorCount,
      errors
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to validate file' }, { status: 400 });
  }
}
