import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { db } from './db';
import { POST } from '@/app/api/v1/wa/inbound/route';
import { NextRequest } from 'next/server';
import { parseWhatsAppMessage } from './whatsapp-parser';

vi.mock('@/lib/whatsapp-parser', () => ({
  parseWhatsAppMessage: vi.fn(),
}));

describe('WhatsApp Inbound Webhook E2E Intent Processing', () => {
  const employeePhone = '919000000001';
  const adminPhone = '919000000002';
  const supplierPhone = '919000000003';

  beforeAll(async () => {
    process.env.BRIDGE_API_KEY = 'test-secret';
    // Clean up first
    await db.whatsAppMessage.deleteMany({
      where: {
        phone: {
          in: [
            `${employeePhone}@s.whatsapp.net`,
            `${adminPhone}@s.whatsapp.net`,
            `${supplierPhone}@s.whatsapp.net`,
          ],
        },
      },
    });
    await db.requestLine.deleteMany({
      where: { itemId: 'test-item-id' },
    });
    await db.request.deleteMany({
      where: { userId: { in: ['test-employee-id', 'test-admin-id'] } },
    });
    await db.notification.deleteMany({
      where: { userId: { in: ['test-employee-id', 'test-admin-id'] } },
    });
    await db.user.deleteMany({
      where: { id: { in: ['test-employee-id', 'test-admin-id'] } },
    });
    await db.item.deleteMany({
      where: { id: 'test-item-id' },
    });
    await db.supplier.deleteMany({
      where: { id: 'test-supplier-id' },
    });

    // Create seed test records
    await db.user.createMany({
      data: [
        {
          id: 'test-employee-id',
          empId: 'EMP-WA-1',
          name: 'WA Employee',
          department: 'IT',
          role: 'employee',
          phone: employeePhone,
          password: 'password',
        },
        {
          id: 'test-admin-id',
          empId: 'EMP-WA-2',
          name: 'WA Admin',
          department: 'Admin',
          role: 'admin',
          phone: adminPhone,
          password: 'password',
        },
      ],
    });

    await db.supplier.create({
      data: {
        id: 'test-supplier-id',
        name: 'WA Supplier',
        phone: supplierPhone,
      },
    });

    await db.item.create({
      data: {
        id: 'test-item-id',
        name: 'WA Test Item',
        category: 'Test',
        unit: 'pcs',
        stock: 50,
        reservedQty: 0,
        minStock: 10,
        price: 150,
        preferredSupplierId: 'test-supplier-id',
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await db.whatsAppMessage.deleteMany({
      where: {
        phone: {
          in: [
            `${employeePhone}@s.whatsapp.net`,
            `${adminPhone}@s.whatsapp.net`,
            `${supplierPhone}@s.whatsapp.net`,
          ],
        },
      },
    });
    await db.requestLine.deleteMany({
      where: { itemId: 'test-item-id' },
    });
    await db.request.deleteMany({
      where: { userId: { in: ['test-employee-id', 'test-admin-id'] } },
    });
    await db.notification.deleteMany({
      where: { userId: { in: ['test-employee-id', 'test-admin-id'] } },
    });
    await db.user.deleteMany({
      where: { id: { in: ['test-employee-id', 'test-admin-id'] } },
    });
    await db.item.deleteMany({
      where: { id: 'test-item-id' },
    });
    await db.supplier.deleteMany({
      where: { id: 'test-supplier-id' },
    });
  });

  it('handles stock_query intent and responds with available quantities', async () => {
    vi.mocked(parseWhatsAppMessage).mockResolvedValueOnce({
      intent: 'stock_query',
      language: 'english',
      reply_language: 'english',
      item_name: 'WA Test Item',
      item_alias_used: 'wa item',
      quantity: null,
      unit: 'pcs',
      department: '',
      vendor: '',
      invoice_no: '',
      po_no: '',
      transaction_reference: '',
      approval_action: '',
      remarks: '',
      confidence: 0.95,
      missing_fields: [],
      requires_confirmation: false,
      suggested_reply: 'The stock check for WA Test Item:',
    });

    const req = new NextRequest('http://localhost/api/v1/wa/inbound', {
      method: 'POST',
      headers: { 'x-bridge-key': 'test-secret' },
      body: JSON.stringify({
        message: {
          key: { remoteJid: `${employeePhone}@s.whatsapp.net` },
          message: { conversation: 'wa item stock' },
          pushName: 'WA Employee',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify outbound message was queued
    const queuedMessage = await db.whatsAppMessage.findFirst({
      where: {
        phone: `${employeePhone}@s.whatsapp.net`,
        direction: 'OUTBOUND',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(queuedMessage).toBeDefined();
    expect(queuedMessage!.message).toContain('Available for Request: 50 pcs');
    expect(queuedMessage!.message).toContain('Physical Stock: 50 pcs');
  });

  it('handles create_item_request and sets up a requisition with stock reservation', async () => {
    vi.mocked(parseWhatsAppMessage).mockResolvedValueOnce({
      intent: 'create_item_request',
      language: 'english',
      reply_language: 'english',
      item_name: 'WA Test Item',
      item_alias_used: 'wa item',
      quantity: 15,
      unit: 'pcs',
      department: 'IT',
      vendor: '',
      invoice_no: '',
      po_no: '',
      transaction_reference: '',
      approval_action: '',
      remarks: 'WhatsApp request',
      confidence: 0.95,
      missing_fields: [],
      requires_confirmation: true,
      suggested_reply: 'Drafting request for 15 pcs of WA Test Item.',
    });

    const req = new NextRequest('http://localhost/api/v1/wa/inbound', {
      method: 'POST',
      headers: { 'x-bridge-key': 'test-secret' },
      body: JSON.stringify({
        message: {
          key: { remoteJid: `${employeePhone}@s.whatsapp.net` },
          message: { conversation: 'Need 15 wa item' },
          pushName: 'WA Employee',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify requisition created
    const requisition = await db.request.findFirst({
      where: { userId: 'test-employee-id' },
      include: { lines: true },
    });

    expect(requisition).toBeDefined();
    expect(requisition!.status).toBe('SUBMITTED');
    expect(requisition!.lines[0].requestedQty).toBe(15);

    // Verify stock is reserved
    const item = await db.item.findUnique({ where: { id: 'test-item-id' } });
    expect(item!.reservedQty).toBe(15);

    // Verify outbound message was queued back to employee
    const employeeReply = await db.whatsAppMessage.findFirst({
      where: {
        phone: `${employeePhone}@s.whatsapp.net`,
        direction: 'OUTBOUND',
        status: 'PENDING',
        message: { contains: 'Request Created Successfully' },
      },
    });
    expect(employeeReply).toBeDefined();

    // Verify admin alert was queued
    const adminAlert = await db.whatsAppMessage.findFirst({
      where: {
        phone: `${adminPhone}@s.whatsapp.net`,
        direction: 'OUTBOUND',
        status: 'PENDING',
        message: { contains: 'New Requisition Request' },
      },
    });
    expect(adminAlert).toBeDefined();
  });

  it('handles approve_transaction intent when triggered by an admin', async () => {
    // Locate the request created in the previous step
    const requisition = await db.request.findFirst({
      where: { userId: 'test-employee-id' },
    });
    expect(requisition).toBeDefined();

    const reqRef = `REQ-${requisition!.id.slice(-6).toUpperCase()}`;

    vi.mocked(parseWhatsAppMessage).mockResolvedValueOnce({
      intent: 'approve_transaction',
      language: 'english',
      reply_language: 'english',
      item_name: '',
      item_alias_used: '',
      quantity: null,
      unit: '',
      department: '',
      vendor: '',
      invoice_no: '',
      po_no: '',
      transaction_reference: reqRef,
      approval_action: 'approve',
      remarks: '',
      confidence: 0.98,
      missing_fields: [],
      requires_confirmation: false,
      suggested_reply: `Approving request ${reqRef}`,
    });

    const req = new NextRequest('http://localhost/api/v1/wa/inbound', {
      method: 'POST',
      headers: { 'x-bridge-key': 'test-secret' },
      body: JSON.stringify({
        message: {
          key: { remoteJid: `${adminPhone}@s.whatsapp.net` },
          message: { conversation: `APPROVE ${reqRef}` },
          pushName: 'WA Admin',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify request status is updated
    const approvedRequisition = await db.request.findUnique({
      where: { id: requisition!.id },
    });
    expect(approvedRequisition!.status).toBe('Approved');

    // Verify employee notification was sent
    const employeeAlert = await db.whatsAppMessage.findFirst({
      where: {
        phone: `${employeePhone}@s.whatsapp.net`,
        direction: 'OUTBOUND',
        status: 'PENDING',
        message: { contains: 'Request Approved' },
      },
    });
    expect(employeeAlert).toBeDefined();
  });
});
