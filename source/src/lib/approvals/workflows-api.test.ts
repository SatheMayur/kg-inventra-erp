import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db';
import { generateToken } from '../jwt';
import { GET, POST, PATCH, DELETE } from '@/app/api/settings/workflows/route';
import { NextRequest } from 'next/server';

describe('Settings Workflows API Endpoints', () => {
  const adminUser = {
    id: 'test-wf-admin',
    empId: 'EMP-WF-ADMIN',
    name: 'Workflow Admin',
    department: 'IT',
    role: 'admin' as const,
    password: 'password',
  };

  const employeeUser = {
    id: 'test-wf-emp',
    empId: 'EMP-WF-EMP',
    name: 'Workflow Employee',
    department: 'Sales',
    role: 'employee' as const,
    password: 'password',
  };

  let adminToken: string;
  let employeeToken: string;
  let createdStepId: string;

  beforeAll(async () => {
    // Clean up if exist
    await db.approvalWorkflow.deleteMany({
      where: { moduleName: 'ASSET_REQUEST' },
    });
    await db.user.deleteMany({
      where: { id: { in: [adminUser.id, employeeUser.id] } },
    });

    // Create users
    await db.user.createMany({
      data: [adminUser, employeeUser],
    });

    // Generate tokens
    adminToken = await generateToken({
      id: adminUser.id,
      empId: adminUser.empId,
      name: adminUser.name,
      department: adminUser.department,
      role: adminUser.role,
    });

    employeeToken = await generateToken({
      id: employeeUser.id,
      empId: employeeUser.empId,
      name: employeeUser.name,
      department: employeeUser.department,
      role: employeeUser.role,
    });
  });

  afterAll(async () => {
    // Clean up
    await db.approvalWorkflow.deleteMany({
      where: { moduleName: 'ASSET_REQUEST' },
    });
    await db.user.deleteMany({
      where: { id: { in: [adminUser.id, employeeUser.id] } },
    });
  });

  it('GET /api/settings/workflows - 401 Unauthorized when token missing', async () => {
    const req = new NextRequest('http://localhost/api/settings/workflows');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('GET /api/settings/workflows - 403 Forbidden for employee role', async () => {
    const req = new NextRequest('http://localhost/api/settings/workflows', {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('POST /api/settings/workflows - 201 Created workflow step', async () => {
    const payload = {
      moduleName: 'ASSET_REQUEST',
      conditionType: 'AMOUNT_GTE',
      conditionValue: '25000',
      approverRole: 'MANAGEMENT',
      sequence: 1,
      active: true,
    };

    const req = new NextRequest('http://localhost/api/settings/workflows', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.workflow).toBeDefined();
    expect(data.workflow.moduleName).toBe('ASSET_REQUEST');
    expect(data.workflow.conditionType).toBe('AMOUNT_GTE');
    expect(data.workflow.conditionValue).toBe('25000');
    expect(data.workflow.approverRole).toBe('MANAGEMENT');
    expect(data.workflow.sequence).toBe(1);

    createdStepId = data.workflow.id;
  });

  it('GET /api/settings/workflows - 200 OK returns workflows list', async () => {
    const req = new NextRequest('http://localhost/api/settings/workflows?moduleName=ASSET_REQUEST', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.workflows).toBeDefined();
    expect(data.workflows.length).toBeGreaterThanOrEqual(1);
    expect(data.workflows[0].id).toBe(createdStepId);
  });

  it('PATCH /api/settings/workflows - 200 OK updates rule details', async () => {
    const updatePayload = {
      id: createdStepId,
      conditionType: 'ALWAYS',
      conditionValue: null,
      active: false,
    };

    const req = new NextRequest('http://localhost/api/settings/workflows', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.workflow.conditionType).toBe('ALWAYS');
    expect(data.workflow.conditionValue).toBeNull();
    expect(data.workflow.active).toBe(false);
  });

  it('PATCH /api/settings/workflows (reorder) - 200 OK processes batch reorder', async () => {
    // Create a second step first
    const step2 = await db.approvalWorkflow.create({
      data: {
        moduleName: 'ASSET_REQUEST',
        conditionType: 'ALWAYS',
        approverRole: 'ACCOUNTS_USER',
        sequence: 2,
        active: true,
      },
    });

    const reorderPayload = {
      reorder: [
        { id: createdStepId, sequence: 2 },
        { id: step2.id, sequence: 1 },
      ],
    };

    const req = new NextRequest('http://localhost/api/settings/workflows', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reorderPayload),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);

    const step1Db = await db.approvalWorkflow.findUnique({ where: { id: createdStepId } });
    const step2Db = await db.approvalWorkflow.findUnique({ where: { id: step2.id } });

    expect(step1Db!.sequence).toBe(2);
    expect(step2Db!.sequence).toBe(1);

    // Clean up step 2
    await db.approvalWorkflow.delete({ where: { id: step2.id } });
  });

  it('DELETE /api/settings/workflows - 200 OK deletes workflow step', async () => {
    const req = new NextRequest(`http://localhost/api/settings/workflows?id=${createdStepId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);

    const deleted = await db.approvalWorkflow.findUnique({ where: { id: createdStepId } });
    expect(deleted).toBeNull();
  });
});
