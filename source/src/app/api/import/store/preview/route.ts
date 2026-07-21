import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { parseExcelBuffer } from '@/lib/historical-importer';
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

    // Parse sheets using helper
    const { departmentsRaw, itemsRaw, transactionsRaw } = parseExcelBuffer(buffer);

    // Calculate transaction summaries
    let totalQuantity = 0;
    let totalAmount = 0;

    for (const tx of transactionsRaw) {
      const qty = Number(tx.quantity);
      if (!isNaN(qty) && qty > 0) {
        totalQuantity += qty;
      }
      const amt = Number(tx.amount);
      if (!isNaN(amt) && amt > 0) {
        totalAmount += amt;
      }
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      sheets: ['Department_Master_Seed', 'Item_Master_Seed', 'Issue_Transactions'],
      departmentsCount: departmentsRaw.length,
      itemsCount: itemsRaw.length,
      transactionsCount: transactionsRaw.length,
      totalQuantity,
      totalAmount: parseFloat(totalAmount.toFixed(2))
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to parse file' }, { status: 400 });
  }
}
