import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { authorize } from '@/lib/auth'
import { handleApiError, ApiError } from '@/lib/api-utils'
import { mutateStock } from '@/lib/stock'

const intakePatchSchema = z.object({
  reviewStatus: z.enum(['PENDING', 'NEEDS_REVIEW', 'RESOLVED', 'REJECTED']),
  notes: z.string().max(500).nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorize(request, ['admin'])
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id: intakeId } = await params
    if (!intakeId) throw new ApiError(400, 'Invoice intake id is required', 'BAD_REQUEST')

    const body = await request.json()
    const payload = intakePatchSchema.parse(body)

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.invoiceIntake.findUnique({ where: { id: intakeId } })
      if (!existing) throw new ApiError(404, 'Invoice intake not found', 'NOT_FOUND')

      const intake = await tx.invoiceIntake.update({
        where: { id: intakeId },
        data: {
          reviewStatus: payload.reviewStatus,
          ...(payload.notes !== undefined && { notes: payload.notes }),
        },
        include: { purchaseOrder: true },
      })

      // If resolved by admin, and PO has not finalized stock (status RECEIVED_PENDING_INVOICE or NEEDS_REVIEW),
      // finalize stock and set PO to RECEIVED.
      if (payload.reviewStatus === 'RESOLVED' && intake.purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({
          where: { id: intake.purchaseOrderId },
          include: { items: true }
        });
        if (po && (po.status === 'RECEIVED_PENDING_INVOICE' || po.status === 'NEEDS_REVIEW')) {
          const hasTx = await tx.transaction.findFirst({
            where: { reference: { startsWith: `GRN for ${po.poNumber}` } }
          });
          if (!hasTx) {
            for (const poItem of po.items) {
              await mutateStock(tx, {
                itemId: poItem.itemId,
                delta: poItem.qty,
                reference: `GRN for ${po.poNumber} (3-Way Match Resolved)`,
                userId: auth.user?.id,
                subType: 'PURCHASE',
              });

              if (poItem.unitPrice > 0) {
                await tx.item.update({
                  where: { id: poItem.itemId },
                  data: { price: poItem.unitPrice },
                });
              }
            }
            await tx.purchaseOrder.update({
              where: { id: po.id },
              data: {
                status: 'RECEIVED',
                receivedAt: new Date(),
                notes: `3-Way Match discrepancy resolved by Admin. Verified on ${new Date().toLocaleDateString('en-US')}`,
              }
            });
          }
        }
      }

      return intake;
    });

    return NextResponse.json({
      ...result,
      validationResult: JSON.parse(result.validationJson),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
