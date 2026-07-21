import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db';
import { startApproval, approveStep, rejectStep, isApproved } from './engine';
import { SR_STATUS, LINE_STATUS } from '../sr-status';
import { PO_STATUS } from '../po-status';

describe('Approval Engine Route Integration Flow tests', () => {
  const userId = 'integration-test-user';
  const itemId = 'integration-test-item';
  const deptHeadId = 'integration-test-dept-head';
  const financeId = 'integration-test-finance';
  let createdRequisitionId: string;

  beforeAll(async () => {
    // Clean up in correct foreign key order
    await db.approvalStep.deleteMany({});
    await db.approvalInstance.deleteMany({});
    await db.approvalWorkflow.deleteMany({});
    await db.itemCheckout.deleteMany({});
    await db.notification.deleteMany({});
    await db.goodsReceiptItem.deleteMany({});
    await db.goodsReceipt.deleteMany({});
    await db.purchaseInvoice.deleteMany({});
    await db.deliveryChallan.deleteMany({});
    await db.approvalLog.deleteMany({});
    await db.transaction.deleteMany({});
    await db.pOItem.deleteMany({});
    await db.purchaseOrder.deleteMany({});
    await db.requestLine.deleteMany({});
    await db.request.deleteMany({});
    await db.itemVariant.deleteMany({});
    await db.itemImage.deleteMany({});
    await db.itemTag.deleteMany({});
    await db.stockTransferItem.deleteMany({});
    await db.pickListItem.deleteMany({});
    await db.maintenanceSchedule.deleteMany({});
    await db.item.deleteMany({});
    await db.supplier.deleteMany({});
    await db.user.deleteMany({});

    // Create User (Requester/Employee)
    await db.user.create({
      data: {
        id: userId,
        empId: 'REQ-EMP-1',
        name: 'Requester',
        department: 'IT',
        role: 'employee',
        password: 'password',
        active: true,
      },
    });

    // Create Dept Head (IT Dept)
    await db.user.create({
      data: {
        id: deptHeadId,
        empId: 'HEAD-EMP-1',
        name: 'IT Manager',
        department: 'IT',
        role: 'DEPT_HEAD',
        isDeptHead: true,
        password: 'password',
        active: true,
      },
    });

    // Create Finance User
    await db.user.create({
      data: {
        id: financeId,
        empId: 'FIN-EMP-1',
        name: 'Finance Head',
        department: 'Finance',
        role: 'ACCOUNTS_USER',
        password: 'password',
        active: true,
      },
    });

    // Create Store Admin User
    await db.user.create({
      data: {
        id: 'integration-test-store-admin',
        empId: 'STORE-ADMIN-1',
        name: 'Store Admin',
        department: 'Store',
        role: 'STORE_ADMIN',
        password: 'password',
        active: true,
      },
    });

    // Create Item
    await db.item.create({
      data: {
        id: itemId,
        name: 'High End Laptop',
        category: 'Assets',
        unit: 'pcs',
        stock: 5,
        price: 75000,
        active: true,
      },
    });
  });

  it('Requisition multi-step approval flow should require all approvals before completing', async () => {
    // 1. Setup multi-step rules: STORE_REQUISITION:
    // Step 1: ALWAYS -> DEPT_HEAD
    // Step 2: AMOUNT_GTE 10000 -> ACCOUNTS_USER
    await db.approvalWorkflow.createMany({
      data: [
        { moduleName: 'STORE_REQUISITION', conditionType: 'ALWAYS', approverRole: 'DEPT_HEAD', sequence: 1, active: true },
        { moduleName: 'STORE_REQUISITION', conditionType: 'AMOUNT_GTE', conditionValue: '10000', approverRole: 'ACCOUNTS_USER', sequence: 2, active: true },
      ],
    });

    // 2. Simulate SR POST creation route handler
    const qty = 1;
    const item = await db.item.findUnique({ where: { id: itemId } });
    const totalAmount = (item?.price ?? 0) * qty; // 75000
    const flags = ['isAsset']; // Asset category

    const req = await db.$transaction(async (tx) => {
      const createdReq = await tx.request.create({
        data: {
          userId,
          requestNumber: 'SR-INTEG-1',
          employee: 'Requester',
          department: 'IT',
          status: 'Pending',
          lines: {
            create: [{
              itemId,
              itemName: item!.name,
              requestedQty: qty,
              availableQtySnapshot: 5,
              availableQty: qty,
              pendingPurchaseQty: 0,
              fulfillmentStatus: 'READY_FOR_ISSUE',
              unit: item!.unit,
              status: 'Pending',
            }],
          },
        },
        include: { lines: true },
      });

      const approval = await startApproval(tx, {
        moduleName: 'STORE_REQUISITION',
        documentType: 'STORE_REQUISITION',
        documentId: createdReq.id,
        createdById: userId,
        ctx: { amount: totalAmount, flags },
      });

      expect(approval.status).toBe('PENDING_APPROVAL');
      expect(approval.steps).toHaveLength(2);
      expect(approval.steps[0].approverRole).toBe('DEPT_HEAD');
      expect(approval.steps[1].approverRole).toBe('ACCOUNTS_USER');

      createdRequisitionId = createdReq.id;
      return createdReq;
    });

    expect(req.status).toBe('Pending');

    // 3. Step 1 Approval: Dept Head
    const step1Result = await db.$transaction(async (tx) => {
      const instance = await tx.approvalInstance.findFirst({
        where: { moduleName: 'STORE_REQUISITION', documentId: req.id, status: 'PENDING_APPROVAL' },
        include: { steps: true },
      });
      expect(instance).toBeDefined();

      const { instance: updatedInstance } = await approveStep(tx, {
        instanceId: instance!.id,
        user: { id: deptHeadId, role: 'DEPT_HEAD' },
        remarks: 'Approved by Dept Head',
      });

      // Assert that it is not yet approved in the engine, but step is advanced
      expect(updatedInstance.status).toBe('PENDING_APPROVAL');
      expect(updatedInstance.currentStep).toBe(2);

      return updatedInstance;
    });

    // Requisition should still be pending final approval
    let currentReq = await db.request.findUnique({ where: { id: req.id }, include: { lines: true } });
    expect(currentReq!.status).toBe('Pending');
    expect(currentReq!.lines[0].status).toBe('Pending'); // Line not approved yet

    // 4. Step 2 Approval: Finance (ACCOUNTS_USER)
    await db.$transaction(async (tx) => {
      const { instance: updatedInstance } = await approveStep(tx, {
        instanceId: step1Result.id,
        user: { id: financeId, role: 'ACCOUNTS_USER' },
        remarks: 'Finance signoff',
      });

      expect(updatedInstance.status).toBe('APPROVED');

      // Final status flip
      await tx.request.update({
        where: { id: req.id },
        data: { status: 'Approved' },
      });
      await tx.requestLine.updateMany({
        where: { requestId: req.id },
        data: { status: 'Approved' },
      });
    });

    currentReq = await db.request.findUnique({ where: { id: req.id }, include: { lines: true } });
    expect(currentReq!.status).toBe('Approved');
    expect(currentReq!.lines[0].status).toBe('Approved');

    const approved = await isApproved('STORE_REQUISITION', req.id);
    expect(approved).toBe(true);
  });

  it('Purchase Order multi-step approval flow should require all approvals before completing', async () => {
    // 1. Setup multi-step rules: PURCHASE_ORDER:
    // Step 1: ALWAYS -> STORE_ADMIN
    // Step 2: AMOUNT_GTE 100000 -> ACCOUNTS_USER
    await db.approvalWorkflow.createMany({
      data: [
        { moduleName: 'PURCHASE_ORDER', conditionType: 'ALWAYS', approverRole: 'STORE_ADMIN', sequence: 1, active: true },
        { moduleName: 'PURCHASE_ORDER', conditionType: 'AMOUNT_GTE', conditionValue: '100000', approverRole: 'ACCOUNTS_USER', sequence: 2, active: true },
      ],
    });

    // Create supplier
    const supplierId = 'integration-test-supplier';
    await db.supplier.create({
      data: {
        id: supplierId,
        name: 'Ambika Traders',
        gstNumber: '24AAAAC1234A1Z1',
        phone: '919876543210',
        paymentTerms: 'Net 30',
        status: 'ACTIVE',
        active: true,
      },
    });

    // 2. Simulate PO creation
    const poAmount = 150000;
    const po = await db.$transaction(async (tx) => {
      const createdPo = await tx.purchaseOrder.create({
        data: {
          poNumber: 'PO-INTEG-1',
          supplierId,
          linkedSrId: createdRequisitionId,
          totalAmount: poAmount,
          status: 'DRAFT',
          createdBy: 'IT Manager',
        },
      });

      const approval = await startApproval(tx, {
        moduleName: 'PURCHASE_ORDER',
        documentType: 'PURCHASE_ORDER',
        documentId: createdPo.id,
        createdById: userId,
        ctx: { amount: poAmount },
      });

      expect(approval.status).toBe('PENDING_APPROVAL');
      expect(approval.steps).toHaveLength(2);
      expect(approval.steps[0].approverRole).toBe('STORE_ADMIN');
      expect(approval.steps[1].approverRole).toBe('ACCOUNTS_USER');

      return createdPo;
    });

    // Approve Step 1: Store Admin
    const step1Result = await db.$transaction(async (tx) => {
      const instance = await tx.approvalInstance.findFirst({
        where: { moduleName: 'PURCHASE_ORDER', documentId: po.id, status: 'PENDING_APPROVAL' },
        include: { steps: true },
      });
      expect(instance).toBeDefined();

      const { instance: updatedInstance } = await approveStep(tx, {
        instanceId: instance!.id,
        user: { id: 'integration-test-store-admin', role: 'STORE_ADMIN' },
        remarks: 'Approved step 1',
      });

      expect(updatedInstance.status).toBe('PENDING_APPROVAL');
      expect(updatedInstance.currentStep).toBe(2);
      return updatedInstance;
    });

    let currentPo = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(currentPo!.status).toBe('DRAFT'); // status remains draft or pending

    // Approve Step 2: Finance
    await db.$transaction(async (tx) => {
      const { instance: updatedInstance } = await approveStep(tx, {
        instanceId: step1Result.id,
        user: { id: financeId, role: 'ACCOUNTS_USER' },
        remarks: 'Approved step 2',
      });

      expect(updatedInstance.status).toBe('APPROVED');

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: 'APPROVED' },
      });
    });

    currentPo = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(currentPo!.status).toBe('APPROVED');
  });
});
