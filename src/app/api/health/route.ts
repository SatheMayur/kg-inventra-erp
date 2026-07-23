import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Verify DB is reachable with a lightweight query
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        commit: process.env.APP_COMMIT_SHA || null,
        buildTime: process.env.APP_BUILD_TIME || null,
        port: process.env.PORT || '3084',
        whatsappBridgeEnabled: process.env.WHATSAPP_BRIDGE_ENABLED !== 'false',
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Database unreachable' },
      { status: 503 }
    );
  }
}
