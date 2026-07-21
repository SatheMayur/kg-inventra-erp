import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const workflowCreateSchema = z.object({
  moduleName: z.enum([
    'STORE_REQUISITION',
    'PURCHASE_REQUIREMENT',
    'PURCHASE_ORDER',
    'DAILY_PROCUREMENT',
    'INVOICE',
    'TRANSFER',
    'STOCK_ADJUSTMENT',
    'ASSET_REQUEST',
  ]),
  conditionType: z.enum(['ALWAYS', 'AMOUNT_LT', 'AMOUNT_GTE', 'FLAG_TRUE']),
  conditionValue: z.string().nullable().optional(),
  approverRole: z.string().min(1, 'Approver role is required'),
  sequence: z.number().int().positive('Sequence must be a positive integer'),
  active: z.boolean().default(true),
});

const workflowUpdateSchema = z.object({
  id: z.string().min(1),
  conditionType: z.enum(['ALWAYS', 'AMOUNT_LT', 'AMOUNT_GTE', 'FLAG_TRUE']).optional(),
  conditionValue: z.string().nullable().optional(),
  approverRole: z.string().min(1).optional(),
  sequence: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

const reorderSchema = z.object({
  reorder: z.array(
    z.object({
      id: z.string().min(1),
      sequence: z.number().int().positive(),
    })
  ),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const moduleName = searchParams.get('moduleName');

    const where: any = {};
    if (moduleName) where.moduleName = moduleName;

    const workflows = await db.approvalWorkflow.findMany({
      where,
      orderBy: [
        { moduleName: 'asc' },
        { sequence: 'asc' },
      ],
    });

    return NextResponse.json({ workflows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = workflowCreateSchema.parse(body);

    const workflow = await db.approvalWorkflow.create({
      data: {
        moduleName: validated.moduleName,
        conditionType: validated.conditionType,
        conditionValue: validated.conditionValue ?? null,
        approverRole: validated.approverRole,
        sequence: validated.sequence,
        active: validated.active,
      },
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    if ('reorder' in body) {
      const { reorder } = reorderSchema.parse(body);
      await db.$transaction(
        reorder.map((item) =>
          db.approvalWorkflow.update({
            where: { id: item.id },
            data: { sequence: item.sequence },
          })
        )
      );
      return NextResponse.json({ success: true });
    }

    const validated = workflowUpdateSchema.parse(body);
    const data: any = {};
    if (validated.conditionType !== undefined) data.conditionType = validated.conditionType;
    if (validated.conditionValue !== undefined) data.conditionValue = validated.conditionValue;
    if (validated.approverRole !== undefined) data.approverRole = validated.approverRole;
    if (validated.sequence !== undefined) data.sequence = validated.sequence;
    if (validated.active !== undefined) data.active = validated.active;

    const workflow = await db.approvalWorkflow.update({
      where: { id: validated.id },
      data,
    });

    return NextResponse.json({ workflow });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');

    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      throw new ApiError(400, 'Workflow step ID is required', 'BAD_REQUEST');
    }

    await db.approvalWorkflow.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
