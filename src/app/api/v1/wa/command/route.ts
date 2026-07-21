import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { handleApiError, validateBridgeKey } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  try {
    validateBridgeKey(req);
    const session = await db.whatsAppSession.findUnique({
      where: { id: 'default' },
    });

    if (session && session.command) {
      // Clear command immediately
      await db.whatsAppSession.update({
        where: { id: 'default' },
        data: { command: null },
      });
      return NextResponse.json({ command: session.command });
    }

    return NextResponse.json({ command: null });
  } catch (error) {
    return handleApiError(error);
  }
}
