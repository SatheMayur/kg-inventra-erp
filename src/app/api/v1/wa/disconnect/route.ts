import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { handleApiError, validateBridgeKey } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  try {
    validateBridgeKey(req);
    await db.whatsAppSession.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        status: 'DISCONNECTED',
        qrCode: null,
      },
      update: {
        status: 'DISCONNECTED',
        qrCode: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
