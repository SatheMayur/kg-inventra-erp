import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { createAuditLog } from '@/lib/audit';
import { parseExcelBuffer, commitHistoricalData } from '@/lib/historical-importer';
import { assertSpreadsheetSize } from '@/lib/upload-limits';

export async function POST(request: NextRequest) {
  let batchId: string | null = null;
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    batchId = formData.get('batchId') as string;

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    assertSpreadsheetSize(file);
    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    // 1. Fetch batch
    const batch = await db.importBatch.findUnique({
      where: { id: batchId }
    });

    if (!batch) {
      return NextResponse.json({ error: `Import batch '${batchId}' not found` }, { status: 404 });
    }

    // Update batch to IMPORTING status
    await db.importBatch.update({
      where: { id: batchId },
      data: { status: 'IMPORTING' }
    });

    // 2. Parse Excel
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { departmentsRaw, itemsRaw, transactionsRaw } = parseExcelBuffer(buffer);

    // 3. Commit transactions
    const result = await commitHistoricalData(
      batchId,
      file.name,
      departmentsRaw,
      itemsRaw,
      transactionsRaw,
      auth.user?.name || auth.user?.empId || 'unknown'
    );

    // 4. Update batch to COMPLETED
    await db.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    // 5. Create system audit log
    await createAuditLog({
      action: 'BULK_IMPORT',
      user: auth.user || undefined,
      metadata: {
        batchId,
        fileName: file.name,
        resultSummary: JSON.stringify(result)
      }
    });

    return NextResponse.json({
      success: true,
      batchId,
      status: 'COMPLETED',
      summary: result
    });

  } catch (error: any) {
    console.error('[commit] error during historical import:', error);

    // Rollback batch status to FAILED or ROLLED_BACK if batchId is known
    if (batchId) {
      try {
        await db.importBatch.update({
          where: { id: batchId },
          data: {
            status: 'ROLLED_BACK',
            completedAt: new Date()
          }
        });
      } catch (dbErr) {
        console.error('Failed to update batch status to ROLLED_BACK:', dbErr);
      }
    }

    return NextResponse.json({ error: error.message || 'Import transaction failed and rolled back.' }, { status: 500 });
  }
}
