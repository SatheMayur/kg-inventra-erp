import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { authorize } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { requestCreateSchema } from '@/lib/validation';
import { flattenRequest } from '@/lib/request-fulfillment';
import { SR_STATUS, LINE_STATUS } from '@/lib/sr-status';
import { getKolkataDateString } from '@/lib/date-utils';
import { startApproval } from '@/lib/approvals/engine';
import { nextSequentialNumber } from '@/lib/stock';

const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'status'] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const sortBy = searchParams.get('sortBy') || 'createdAt_desc';

    const user = auth.user!;
    const isDeptHead = user.role === 'DEPT_HEAD' || user.isDeptHead;
    const isStore = user.role === 'STORE_ADMIN' || user.role === 'STORE_OPERATOR';
    const isPurchase = user.role === 'PURCHASE_USER';
    const isManagement = user.role === 'admin' || user.role === 'MANAGEMENT';

    const where: Prisma.RequestWhereInput = {};

    // Strict role-based visibility matrix
    if (isManagement) {
      if (userId) {
        where.userId = userId;
      }
    } else if (isStore) {
      // Store: Only see approved / issuable / closed requests
      where.status = {
        in: [
          SR_STATUS.APPROVED,
          SR_STATUS.PARTIALLY_ISSUED,
          SR_STATUS.READY_FOR_PICKUP,
          SR_STATUS.ISSUED,
          SR_STATUS.CONVERTED_TO_PO,
          SR_STATUS.PENDING_STORE_REVIEW,
          SR_STATUS.STOCK_AVAILABLE,
          SR_STATUS.ISSUE_PENDING,
          SR_STATUS.COMPLETED
        ]
      };
      if (userId) {
        where.userId = userId;
      }
    } else if (isPurchase) {
      // Purchase: Only see requests requiring procurement
      where.OR = [
        {
          status: {
            in: [
              SR_STATUS.APPROVED,
              SR_STATUS.PURCHASE_REQUIRED,
              SR_STATUS.CONVERTED_TO_PO
            ]
          }
        },
        { lines: { some: { pendingPurchaseQty: { gt: 0 } } } }
      ];
      if (userId) {
        where.userId = userId;
      }
    } else if (isDeptHead) {
      // Department Head: Only see requests awaiting approval in their own department
      where.department = user.department;
      where.status = {
        in: [
          SR_STATUS.SUBMITTED,
          SR_STATUS.PENDING_DEPT_APPROVAL,
          SR_STATUS.UNDER_REVIEW,
          'Pending'
        ]
      };
      if (userId) {
        where.userId = userId;
      }
    } else {
      // Employee / Department User: Only see their own requests
      where.userId = user.id;
    }

    if (status) {
      // If filtering by specific status, make sure it is within their permitted statuses
      if (isStore && !['Approved', 'PartiallyIssued', 'ReadyForPickup', 'Issued', 'CONVERTED_TO_PO', 'PENDING_STORE_REVIEW', 'STOCK_AVAILABLE', 'ISSUE_PENDING', 'COMPLETED'].includes(status)) {
        return NextResponse.json({ requests: [] });
      }
      if (isPurchase && !['Approved', 'PURCHASE_REQUIRED', 'CONVERTED_TO_PO'].includes(status)) {
        return NextResponse.json({ requests: [] });
      }
      if (isDeptHead && !['Pending', 'SUBMITTED', 'PENDING_DEPT_APPROVAL', 'UNDER_REVIEW', 'Pending Department Approval'].includes(status)) {
        return NextResponse.json({ requests: [] });
      }

      if (status === 'Pending') {
        where.status = {
          in: [
            'Pending',
            SR_STATUS.SUBMITTED,
            SR_STATUS.PENDING_DEPT_APPROVAL,
            SR_STATUS.UNDER_REVIEW
          ]
        };
      } else if (status === 'Approved') {
        where.status = {
          in: [
            'Approved',
            SR_STATUS.APPROVED,
            SR_STATUS.PENDING_STORE_REVIEW,
            SR_STATUS.STOCK_AVAILABLE,
            SR_STATUS.ISSUE_PENDING,
            SR_STATUS.PARTIALLY_ISSUED,
            SR_STATUS.READY_FOR_PICKUP
          ]
        };
      } else {
        where.status = status;
      }
    }

    const [rawField, rawDir] = sortBy.split('_');
    const safeField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(rawField)
      ? rawField
      : 'createdAt';
    const safeDir = rawDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [safeField]: safeDir } as Prisma.RequestOrderByWithRelationInput;

    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '500')));
    const requests = await db.request.findMany({
      where,
      orderBy,
      take: limit,
      include: { lines: true },
    });

    const requestIds = requests.map((r) => r.id);
    const instances = await db.approvalInstance.findMany({
      where: {
        moduleName: 'STORE_REQUISITION',
        documentId: { in: requestIds },
      },
      orderBy: { createdAt: 'desc' },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    // Reduce to find the latest instance per documentId
    const latestInstancesMap = new Map<string, typeof instances[0]>();
    for (const inst of instances) {
      if (!latestInstancesMap.has(inst.documentId)) {
        latestInstancesMap.set(inst.documentId, inst);
      }
    }

    const activeUsers = await db.user.findMany({
      where: { active: true },
      select: {
        id: true,
        role: true,
        department: true,
        isDeptHead: true,
      },
    });

    const deptHeadsMap = new Map<string, string>();
    const roleUsersMap = new Map<string, string>();
    for (const u of activeUsers) {
      if (u.role === 'DEPT_HEAD' || u.isDeptHead) {
        deptHeadsMap.set(u.department, u.id);
      }
      if (!roleUsersMap.has(u.role)) {
        roleUsersMap.set(u.role, u.id);
      }
    }

    const enrichedRequests = requests.map((req) => {
      const flat = flattenRequest(req);
      const instance = latestInstancesMap.get(req.id);

      let currentApproverRole: string | null = null;
      let currentApproverUserId: string | null = null;

      if (instance && instance.status === 'PENDING_APPROVAL') {
        const currentStepObj = instance.steps.find((s) => s.sequence === instance.currentStep);
        if (currentStepObj) {
          currentApproverRole = currentStepObj.approverRole;
          if (currentApproverRole === 'DEPT_HEAD') {
            currentApproverUserId = deptHeadsMap.get(req.department) || null;
          } else {
            currentApproverUserId = roleUsersMap.get(currentApproverRole) || null;
          }
        }
      }

      return {
        ...flat,
        currentApproverRole,
        currentApproverUserId,
        createdBy: req.userId,
        departmentId: req.department,
      };
    });

    return NextResponse.json({ requests: enrichedRequests });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();

    // Back-compat: a legacy single { itemId, qty } body becomes one line.
    const normalized = {
      userId: body.userId,
      requiredDate: typeof body.requiredDate === 'string' ? body.requiredDate : undefined,
      machine: typeof body.machine === 'string' ? body.machine : undefined,
      concernPerson: typeof body.concernPerson === 'string' ? body.concernPerson : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
      priority: typeof body.priority === 'string' ? body.priority : 'MEDIUM',
      purpose: typeof body.purpose === 'string' ? body.purpose : undefined,
      remarks: typeof body.remarks === 'string' ? body.remarks : undefined,
      attachments: typeof body.attachments === 'string' ? body.attachments : undefined,
      lines: Array.isArray(body.lines)
        ? body.lines
        : body.itemId
          ? [{ itemId: body.itemId, qty: body.qty }]
          : [],
    };
    const { userId, requiredDate, machine, concernPerson, note, priority, purpose, remarks, attachments, lines } = requestCreateSchema.parse(normalized);

    const canCreateForOthers = ['admin', 'STORE_ADMIN', 'STORE_OPERATOR'].includes(auth.user!.role);

    // Requesters and approval/procurement roles may not impersonate another employee.
    if (!canCreateForOthers && userId !== auth.user!.id) {
      throw new ApiError(403, 'You can only create requests for yourself', 'FORBIDDEN');
    }
    const effectiveUserId = canCreateForOthers ? userId : auth.user!.id;

    // Aggregate requested qty per catalog item so duplicate lines don't over-reserve
    // stock. Custom (off-catalog) lines have no itemId yet and are materialized below.
    const qtyByItem = new Map<string, number>();
    for (const l of lines) {
      if (!l.itemId) continue;
      qtyByItem.set(l.itemId, (qtyByItem.get(l.itemId) ?? 0) + l.qty);
    }

    const result = await db.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { id: effectiveUserId } });
      if (!user && auth.user?.empId) {
        user = await tx.user.findUnique({ where: { empId: auth.user.empId } });
      }
      if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

      const lineData: {
        itemId: string;
        itemName: string;
        requestedQty: number;
        availableQtySnapshot: number;
        availableQty: number;
        pendingPurchaseQty: number;
        fulfillmentStatus: string;
        unit: string;
        status: string;
      }[] = [];

      let hasDeficit = false;
      let totalAmount = 0;
      const flags: string[] = [];

      for (const [itemId, totalQty] of qtyByItem) {
        const item = await tx.item.findUnique({ where: { id: itemId } });
        if (!item || item.deletedAt || item.active === false) {
          throw new ApiError(400, `Item is inactive, deleted, or unavailable: ${item?.name || itemId}`, 'BAD_REQUEST');
        }

        totalAmount += (item.price ?? 0) * totalQty;
        if (item.category && item.category.trim().toLowerCase().includes('asset')) {
          if (!flags.includes('isAsset')) flags.push('isAsset');
        }

        // available_qty = free stock (stock - reservedQty)
        const available = Math.max(0, item.stock - item.reservedQty);
        let remainingStock = available;

        // Loop over each line for this item in the request to allocate stock sequentially
        for (const l of lines.filter((x) => x.itemId === itemId)) {
          const requested = l.qty;
          let statusStr = "Pending";
          let fulfillmentStatus = "PENDING_CHECK";
          let lineAvailableQty = 0;
          let linePendingPurchaseQty = 0;
          let reserveQty = 0;

          if (remainingStock <= 0) {
            // Case 2: available_qty = 0
            fulfillmentStatus = "PURCHASE_REQUIRED";
            lineAvailableQty = 0;
            linePendingPurchaseQty = requested;
            reserveQty = 0;
            statusStr = LINE_STATUS.PENDING;
            hasDeficit = true;
          } else if (requested <= remainingStock) {
            // Case 1: requested_qty <= available_qty
            fulfillmentStatus = "READY_FOR_ISSUE";
            lineAvailableQty = requested;
            linePendingPurchaseQty = 0;
            reserveQty = requested;
            remainingStock -= requested;
            statusStr = body.status === 'DRAFT' ? LINE_STATUS.DRAFT : 'SUBMITTED';
          } else {
            // Case 3: requested_qty > available_qty
            fulfillmentStatus = "PARTIALLY_AVAILABLE";
            lineAvailableQty = remainingStock;
            linePendingPurchaseQty = requested - remainingStock;
            reserveQty = remainingStock;
            remainingStock = 0;
            statusStr = body.status === 'DRAFT' ? LINE_STATUS.DRAFT : 'UNDER_REVIEW';
            hasDeficit = true;
          }

          if (reserveQty > 0 && body.status !== 'DRAFT') {
            await tx.item.update({
              where: { id: itemId },
              data: { reservedQty: { increment: reserveQty }, version: { increment: 1 } },
            });
          }

          lineData.push({
            itemId,
            itemName: item.name,
            requestedQty: requested,
            availableQtySnapshot: available,
            availableQty: lineAvailableQty,
            pendingPurchaseQty: linePendingPurchaseQty,
            fulfillmentStatus,
            unit: item.unit,
            status: body.status === 'DRAFT' ? LINE_STATUS.DRAFT : statusStr,
          });
        }
      }

      // Off-catalog (custom) lines: materialize a proposed Item (active:false, hidden
      // from catalog until an admin promotes it on approval) and add a PURCHASE_REQUIRED
      // line. Stock is 0, so nothing is reserved.
      for (const l of lines) {
        if (!l.customItemName) continue;
        const proposed = await tx.item.create({
          data: {
            name: l.customItemName,
            unit: l.unit || 'pcs',
            category: 'Custom Request',
            stock: 0,
            reservedQty: 0,
            reorderQty: 0,
            price: 0,
            active: false,
            sourceChannel: 'REQUISITION',
            createdBy: user.id,
          },
        });
        hasDeficit = true;
        lineData.push({
          itemId: proposed.id,
          itemName: proposed.name,
          requestedQty: l.qty,
          availableQtySnapshot: 0,
          availableQty: 0,
          pendingPurchaseQty: l.qty,
          fulfillmentStatus: 'PURCHASE_REQUIRED',
          unit: proposed.unit,
          status: body.status === 'DRAFT' ? LINE_STATUS.DRAFT : LINE_STATUS.PENDING,
        });
      }

      const status = body.status === 'DRAFT' ? SR_STATUS.DRAFT : (hasDeficit ? SR_STATUS.UNDER_REVIEW : SR_STATUS.SUBMITTED);

      // Generate request number: SR-YYYYMMDD-XXX
      const date = getKolkataDateString().replace(/-/g, '');
      const requestNumber = await nextSequentialNumber(tx, 'request', `SR-${date}`);

      const req = await tx.request.create({
        data: {
          userId: user.id,
          requestNumber,
          employee: user.name,
          department: user.department,
          concernPerson: concernPerson?.trim() || null,
          requiredDate: requiredDate ? new Date(requiredDate) : null,
          machine: machine?.trim() || null,
          note: note?.trim() || null,
          priority,
          purpose: purpose?.trim() || null,
          remarks: remarks?.trim() || null,
          attachments: attachments?.trim() || null,
          status,
          lines: { create: lineData },
        },
        include: { lines: true },
      });

      let finalStatus: string = status;
      if (status !== SR_STATUS.DRAFT) {
        const approval = await startApproval(tx, {
          moduleName: 'STORE_REQUISITION',
          documentType: 'STORE_REQUISITION',
          documentId: req.id,
          createdById: user.id,
          ctx: { amount: totalAmount, flags },
        });

        if (approval.status === 'APPROVED') {
          finalStatus = SR_STATUS.APPROVED;
          await tx.requestLine.updateMany({
            where: { requestId: req.id },
            data: { status: LINE_STATUS.APPROVED },
          });
        } else {
          const firstStep = approval.steps.find((s) => s.sequence === 1);
          if (firstStep?.approverRole === 'DEPT_HEAD') {
            finalStatus = SR_STATUS.PENDING_DEPT_APPROVAL;
          } else {
            finalStatus = SR_STATUS.PENDING;
          }
        }

        if (finalStatus !== status) {
          await tx.request.update({
            where: { id: req.id },
            data: { status: finalStatus },
          });
          req.status = finalStatus;
        }
      }

      return req;
    });

    const instance = await db.approvalInstance.findFirst({
      where: { moduleName: 'STORE_REQUISITION', documentId: result.id },
      orderBy: { createdAt: 'desc' },
      include: { steps: { orderBy: { sequence: 'asc' } } }
    });

    let currentApproverRole: string | null = null;
    let currentApproverUserId: string | null = null;

    if (instance && instance.status === 'PENDING_APPROVAL') {
      const currentStepObj = instance.steps.find(s => s.sequence === instance.currentStep);
      if (currentStepObj) {
        currentApproverRole = currentStepObj.approverRole;
        if (currentApproverRole === 'DEPT_HEAD') {
          const head = await db.user.findFirst({
            where: {
              department: result.department,
              OR: [
                { role: 'DEPT_HEAD' },
                { isDeptHead: true }
              ],
              active: true
            }
          });
          if (head) currentApproverUserId = head.id;
        } else {
          const userWithRole = await db.user.findFirst({
            where: { role: currentApproverRole, active: true }
          });
          if (userWithRole) currentApproverUserId = userWithRole.id;
        }
      }
    }

    const flat = {
      ...flattenRequest(result),
      currentApproverRole,
      currentApproverUserId,
      createdBy: result.userId,
      departmentId: result.department
    };

    return NextResponse.json({ request: flat }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
