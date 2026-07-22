import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { handleApiError, validateBridgeKey } from '@/lib/api-utils';
import { emitWhatsAppSessionChanged } from '@/lib/realtime';

export async function POST(request: Request) {
  try {
    validateBridgeKey(request);
    const body = await request.json();
    const { qr, status } = body;

    const session = await db.whatsAppSession.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        status: status || (qr ? 'CONNECTING' : 'DISCONNECTED'),
        qrCode: qr || null,
      },
      update: {
        status: status || (qr ? 'CONNECTING' : 'DISCONNECTED'),
        qrCode: qr || null,
        reconnects: status === 'CONNECTED' ? { increment: 1 } : undefined,
      },
    });

    emitWhatsAppSessionChanged({
      status: session.status,
      qrAvailable: Boolean(session.qrCode),
      reason: 'updated',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
