import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const pendingReqs = await db.request.findMany({
      where: {
        status: {
          notIn: ['Issued', 'Rejected', 'Cancelled', 'CONVERTED_TO_PO', 'COMPLETED', 'DEPARTMENT_ACKNOWLEDGED']
        }
      },
      include: {
        lines: {
          include: { item: true }
        },
        user: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const now = new Date();

    const requisitions = pendingReqs.map(req => {
      const ageInMs = now.getTime() - new Date(req.createdAt).getTime();
      const ageInDays = Math.max(0, Math.floor(ageInMs / (1000 * 60 * 60 * 24)));

      const totalItemsRequested = req.lines.reduce((acc, line) => acc + line.requestedQty, 0);
      const totalItemsIssued = req.lines.reduce((acc, line) => acc + line.issuedQty, 0);
      const estimatedValue = req.lines.reduce((acc, line) => acc + (line.requestedQty * (line.item?.price || 0)), 0);

      return {
        id: req.id,
        requestNumber: req.requestNumber || `REQ-${req.id.slice(-6).toUpperCase()}`,
        employee: req.employee,
        department: req.department,
        machine: req.machine || 'N/A',
        createdAt: req.createdAt,
        ageInDays,
        status: req.status,
        totalItemsRequested,
        totalItemsIssued,
        estimatedValue: parseFloat(estimatedValue.toFixed(2)),
        priority: req.priority
      };
    });

    return NextResponse.json({ requisitions });
  } catch (error) {
    return handleApiError(error);
  }
}
