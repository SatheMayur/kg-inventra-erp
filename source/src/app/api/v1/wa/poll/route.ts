import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { handleApiError, validateBridgeKey } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  try {
    validateBridgeKey(req);
    const pendingMessages = await db.whatsAppMessage.findMany({
      where: {
        direction: 'OUTBOUND',
        status: 'PENDING'
      },
      take: 20
    });

    if (pendingMessages.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    await db.whatsAppMessage.updateMany({
      where: {
        id: { in: pendingMessages.map(m => m.id) }
      },
      data: { status: 'PROCESSING' }
    });

    const mappedMessages = pendingMessages.map(m => {
      const toJid = m.phone.includes('@') ? m.phone : `${m.phone}@s.whatsapp.net`;
      return {
        id: m.id,
        to: toJid,
        text: m.message
      };
    });

    return NextResponse.json({ messages: mappedMessages });
  } catch (err) {
    return handleApiError(err);
  }
}
