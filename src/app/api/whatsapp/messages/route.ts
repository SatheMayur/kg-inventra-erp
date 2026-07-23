import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { emitWhatsAppMessageChanged } from '@/lib/realtime';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (phone) {
      // Get full thread for a specific phone number with ERP requirement context
      const messages = await db.whatsAppMessage.findMany({
        where: { phone },
        include: {
          supplier: true,
          dailyBatch: {
            include: { lines: true }
          },
          dailyConversation: {
            include: {
              lines: { include: { item: true } }
            }
          }
        },
        orderBy: { createdAt: 'asc' },
        take: 100
      });

      // Search thread text for Store Requisition (REQ-XXXXXX) or Purchase Order (PO-XXXXXX) references
      let linkedRequest: any = null;
      let linkedPO: any = null;

      for (const m of messages) {
        if (!linkedRequest) {
          const reqMatch = m.message.match(/REQ-([A-Z0-9]+)/i);
          if (reqMatch?.[1]) {
            const ref = reqMatch[1].trim();
            const foundReq = await db.request.findFirst({
              where: {
                OR: [
                  { id: ref },
                  { id: { endsWith: ref } },
                  { requestNumber: `REQ-${ref}` }
                ]
              },
              include: {
                lines: { include: { item: true } },
                user: true
              }
            });
            if (foundReq) linkedRequest = foundReq;
          }
        }

        if (!linkedPO) {
          const poMatch = m.message.match(/PO-([A-Z0-9-]+)/i);
          if (poMatch?.[1]) {
            const ref = poMatch[1].trim();
            const foundPO = await db.purchaseOrder.findFirst({
              where: {
                OR: [
                  { poNumber: `PO-${ref}` },
                  { poNumber: ref },
                  { id: ref }
                ]
              },
              include: {
                items: { include: { item: true } },
                supplier: true
              }
            });
            if (foundPO) linkedPO = foundPO;
          }
        }
      }

      // Resolve contact against User model
      const cleanPhone = phone.split('@')[0].replace(/\D/g, '');
      let matchedUser: any = null;
      if (cleanPhone) {
        const users = await db.user.findMany({
          where: { phone: { not: null } },
          select: { id: true, name: true, empId: true, department: true, role: true, isDeptHead: true, phone: true }
        });
        matchedUser = users.find(u => {
          const uPhone = u.phone ? u.phone.replace(/\D/g, '') : '';
          return uPhone && (cleanPhone.endsWith(uPhone) || uPhone.endsWith(cleanPhone));
        }) || null;
      }

      return NextResponse.json({
        messages,
        linkedRequest,
        linkedPO,
        userContact: matchedUser
      });
    } else {
      // Get all recent messages to build the inbox sidebar
      const recentMessages = await db.whatsAppMessage.findMany({
        include: {
          supplier: true,
          dailyBatch: true,
          dailyConversation: true
        },
        orderBy: { createdAt: 'desc' },
        take: 500
      });

      // Query active users with phones to match non-supplier contacts
      const users = await db.user.findMany({
        where: { phone: { not: null } },
        select: { id: true, name: true, empId: true, department: true, role: true, phone: true }
      });

      const threadsMap = new Map();
      for (const m of recentMessages) {
        if (!threadsMap.has(m.phone)) {
          const cleanPhone = m.phone.split('@')[0].replace(/\D/g, '');
          const matchedUser = cleanPhone
            ? users.find(u => {
                const uPhone = u.phone ? u.phone.replace(/\D/g, '') : '';
                return uPhone && (cleanPhone.endsWith(uPhone) || uPhone.endsWith(cleanPhone));
              })
            : null;

          threadsMap.set(m.phone, { ...m, userContact: matchedUser });
        } else {
          // If the latest message lacks a senderName (e.g. it was an outbound reply),
          // propagate the senderName from an older inbound message.
          const existing = threadsMap.get(m.phone);
          if (!existing.senderName && m.senderName) {
            existing.senderName = m.senderName;
          }
        }
      }

      const threads = Array.from(threadsMap.values());
      
      return NextResponse.json({ threads });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const allowedRoles = ['admin', 'STORE_ADMIN', 'STORE_OPERATOR', 'PURCHASE_USER', 'DEPT_HEAD', 'DEPT_USER', 'ACCOUNTS_USER', 'MANAGEMENT'];
    if (!allowedRoles.includes(auth.user?.role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 });
    }

    // Resolve senderName for outbound messages to keep threads clean
    let senderName: string | null = null;
    const cleanPhone = phone.split('@')[0].replace(/\D/g, '');

    try {
      if (cleanPhone) {
        // Match user
        const users = await db.user.findMany({
          where: { phone: { not: null } },
          select: { name: true, phone: true }
        });
        const matchedUser = users.find(u => {
          const uPhone = u.phone ? u.phone.replace(/\D/g, '') : '';
          return uPhone && (cleanPhone.endsWith(uPhone) || uPhone.endsWith(cleanPhone));
        });

        if (matchedUser) {
          senderName = `${matchedUser.name} (Employee)`;
        } else {
          // Match supplier
          const suppliers = await db.supplier.findMany({
            where: { phone: { not: null } },
            select: { name: true, phone: true }
          });
          const matchedSupplier = suppliers.find(s => {
            const sPhone = s.phone ? s.phone.replace(/\D/g, '') : '';
            return sPhone && (cleanPhone.endsWith(sPhone) || sPhone.endsWith(cleanPhone));
          });
          if (matchedSupplier) {
            senderName = `${matchedSupplier.name} (Supplier)`;
          }
        }
      }

      // If still not resolved, lookup the last inbound message from this sender
      if (!senderName) {
        const lastInbound = await db.whatsAppMessage.findFirst({
          where: {
            phone,
            direction: 'INBOUND',
            senderName: { not: null }
          },
          orderBy: { createdAt: 'desc' },
          select: { senderName: true }
        });
        if (lastInbound) {
          senderName = lastInbound.senderName;
        }
      }
    } catch (resolveErr) {
      console.error('⚠️ Failed to resolve name for outbound message:', resolveErr);
    }

    const newMessage = await db.whatsAppMessage.create({
      data: {
        phone,
        message,
        direction: 'OUTBOUND',
        status: 'PENDING',
        senderName
      }
    });

    emitWhatsAppMessageChanged({
      phone: newMessage.phone,
      messageId: newMessage.id,
      direction: newMessage.direction,
      status: newMessage.status,
      reason: 'created',
    });

    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
