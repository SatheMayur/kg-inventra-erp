import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { handleApiError, validateBridgeKey } from '@/lib/api-utils';
import { emitWhatsAppMessageChanged } from '@/lib/realtime';

function getPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function GET(req: NextRequest) {
  try {
    validateBridgeKey(req);
    const maxAttempts = getPositiveIntEnv('WHATSAPP_MAX_SEND_ATTEMPTS', 3);

    const pendingMessages = await db.whatsAppMessage.findMany({
      where: {
        direction: 'OUTBOUND',
        status: 'PENDING',
        sendAttempts: { lt: maxAttempts },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (pendingMessages.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    const now = new Date();
    const claimedMessages = (await Promise.all(pendingMessages.map(async (message) => {
      const claim = await db.whatsAppMessage.updateMany({
        where: {
          id: message.id,
          direction: 'OUTBOUND',
          status: 'PENDING',
          sendAttempts: { lt: maxAttempts },
        },
        data: {
          status: 'PROCESSING',
          sendAttempts: { increment: 1 },
          lastDequeuedAt: now,
          lastSendAttemptAt: now,
          error: null,
        },
      });

      if (claim.count !== 1) return null;
      return db.whatsAppMessage.findUnique({ where: { id: message.id } });
    }))).filter((message) => message !== null);

    if (claimedMessages.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    claimedMessages.forEach((message) => {
      emitWhatsAppMessageChanged({
        messageId: message.id,
        phone: message.phone,
        direction: message.direction,
        status: message.status,
        reason: 'bridge-polled',
        updatedAt: message.updatedAt.toISOString(),
      });
    });

    const mappedMessages = claimedMessages.map(m => {
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
