import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { handleApiError, ApiError, validateBridgeKey } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  try {
    validateBridgeKey(req);
    const body = await req.json();
    const { id, status, error } = body;

    if (!id || !status) {
      throw new ApiError(400, 'Missing required fields', 'BAD_REQUEST');
    }

    const normalizedStatus = status.toUpperCase();
    await db.$transaction(async (tx) => {
      await tx.whatsAppMessage.update({
      where: { id },
      data: { 
        status: normalizedStatus,
        error: error || null 
      }
      });

      // Delivery/read acknowledgements are transport state only. They must never
      // confirm supply or advance procurement business state.
      await tx.dailyRateEnquiry.updateMany({
        where: { whatsappMessageId: id },
        data: { messageStatus: normalizedStatus },
      });
      await tx.dailySupplyOrder.updateMany({
        where: { whatsappMessageId: id },
        data: { messageStatus: normalizedStatus },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
