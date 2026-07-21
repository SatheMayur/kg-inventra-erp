import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { runInventoryAlerts } from '@/lib/alert-runner';
import { z } from 'zod';

const bodySchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const { email } = bodySchema.parse(body);

    const result = await runInventoryAlerts({ notificationUserId: auth.user!.id, email });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
