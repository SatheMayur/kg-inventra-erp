import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser';
import { releaseReservation } from '@/lib/stock';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { flattenRequest, deriveFulfillmentStatus } from '@/lib/request-fulfillment';
import { startApproval, approveStep, rejectStep } from '@/lib/approvals/engine';
import crypto from 'crypto';
import { handleApiError, validateBridgeKey } from '@/lib/api-utils';
import { normalizeWhatsAppPhone } from '@/lib/daily-procurement';
import { DAILY_CONVERSATION_STATUS, parseVendorSupplyReply } from '@/lib/daily-conversations';

export async function POST(req: NextRequest) {
  try {
    validateBridgeKey(req);
    const body = await req.json();
    const msg = body.message;

    if (!msg || !msg.key || !msg.key.remoteJid) {
      return NextResponse.json({ success: false, error: 'Invalid message payload' }, { status: 400 });
    }

    const remoteJid = msg.key.remoteJid;
    // Extract raw digits for matching in database
    const cleanPhone = remoteJid.split('@')[0].replace(/\D/g, '');

    // Resolve senderName and matched user
    let senderName = msg.pushName || null;
    let matchedUser: any = null;
    let matchedSupplier: any = null;

    try {
      if (cleanPhone) {
        // Query users with phone numbers
        const users = await db.user.findMany({
          where: {
            phone: { not: null }
          }
        });

        matchedUser = users.find(u => {
          const uPhone = u.phone ? u.phone.replace(/\D/g, '') : '';
          return uPhone && (cleanPhone.endsWith(uPhone) || uPhone.endsWith(cleanPhone));
        });

        if (matchedUser) {
          senderName = `${matchedUser.name} (Employee)`;
        } else {
          // Query suppliers with phone numbers
          const suppliers = await db.supplier.findMany({
            where: {
              phone: { not: null }
            }
          });

          matchedSupplier = suppliers.find(s => {
            const sPhone = s.phone ? s.phone.replace(/\D/g, '') : '';
            return sPhone && (cleanPhone.endsWith(sPhone) || sPhone.endsWith(cleanPhone));
          });

          if (matchedSupplier) {
            senderName = `${matchedSupplier.name} (Supplier)`;
          }
        }
      }
    } catch (dbErr) {
      console.error('⚠️ Error matching contact in database:', dbErr);
    }

    // Extract text content
    let content = '';
    if (msg.message?.conversation) {
      content = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
      content = msg.message.extendedTextMessage.text;
    } else if (msg.message?.imageMessage?.caption) {
      content = msg.message.imageMessage.caption;
    } else {
      content = '[Non-text message]';
    }

    const providerMessageId = msg.key.id || null;
    const providerTimestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();
    const attachment = msg.message?.imageMessage
      ? { type: 'image', mimetype: msg.message.imageMessage.mimetype, caption: msg.message.imageMessage.caption }
      : msg.message?.documentMessage
        ? { type: 'document', mimetype: msg.message.documentMessage.mimetype, fileName: msg.message.documentMessage.fileName }
        : msg.message?.audioMessage
          ? { type: 'audio', mimetype: msg.message.audioMessage.mimetype, seconds: msg.message.audioMessage.seconds, ptt: msg.message.audioMessage.ptt }
          : null;

    const existingInbound = providerMessageId
      ? await db.whatsAppMessage.findUnique({ where: { providerMessageId } })
      : null;
    if (existingInbound) return NextResponse.json({ success: true, duplicate: true });

    // Supplier replies belong to Daily Procurement before the generic ERP chatbot.
    if (matchedSupplier) {
      const normalizedPhone = normalizeWhatsAppPhone(cleanPhone);
      const candidates = await db.dailyProcurementConversation.findMany({
        where: {
          supplierId: matchedSupplier.id,
          status: { notIn: [DAILY_CONVERSATION_STATUS.CLOSED, DAILY_CONVERSATION_STATUS.CANCELLED] },
        },
        include: { batch: true, lines: { include: { item: true } } },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
      });
      const explicit = candidates.filter((candidate) =>
        content.toLowerCase().includes(candidate.batch.batchNumber.toLowerCase()),
      );
      const matchedConversation = explicit.length === 1
        ? explicit[0]
        : explicit.length === 0 && candidates.length === 1
          ? candidates[0]
          : null;
      const parsedSuggestion = matchedConversation && content !== '[Non-text message]'
        ? parseVendorSupplyReply(content, matchedConversation.lines.map((line) => ({
            batchLineId: line.batchLineId,
            itemName: line.item.name,
            requestedQty: line.requestedQty,
          })))
        : null;
      const verificationStatus = matchedConversation ? 'PENDING' : 'NEEDS_REVIEW';
      const saved = await db.whatsAppMessage.create({
        data: {
          phone: normalizedPhone || remoteJid,
          message: content,
          direction: 'INBOUND',
          status: 'RECEIVED',
          senderName,
          messageType: 'VENDOR_REPLY',
          providerMessageId,
          providerTimestamp,
          rawMessage: content,
          rawPayload: msg,
          attachmentMetadata: (attachment as any) || undefined,
          supplierId: matchedSupplier.id,
          dailyBatchId: matchedConversation?.batchId ?? null,
          dailyConversationId: matchedConversation?.id ?? null,
          parsedSuggestion: parsedSuggestion as any,
          parsingConfidence: parsedSuggestion?.confidence ?? null,
          verificationStatus,
        },
      });
      if (matchedConversation) {
        await db.dailyProcurementConversation.update({
          where: { id: matchedConversation.id },
          data: {
            status: parsedSuggestion?.confidence && parsedSuggestion.confidence >= 0.8
              ? DAILY_CONVERSATION_STATUS.REPLY_RECEIVED
              : DAILY_CONVERSATION_STATUS.NEEDS_REVIEW,
            unreadCount: { increment: 1 },
            lastMessageAt: providerTimestamp,
          },
        });
      }
      return NextResponse.json({
        success: true,
        messageId: saved.id,
        linked: Boolean(matchedConversation),
        needsReview: !matchedConversation || (parsedSuggestion?.confidence ?? 0) < 0.8,
      });
    }

    // Preserve non-text inbound messages in the generic inbox as well.
    if (content === '[Non-text message]') {
      await db.whatsAppMessage.create({
        data: {
          phone: normalizeWhatsAppPhone(cleanPhone) || remoteJid,
          message: content,
          direction: 'INBOUND',
          status: 'RECEIVED',
          senderName,
          providerMessageId,
          providerTimestamp,
          rawMessage: content,
          rawPayload: msg,
          attachmentMetadata: (attachment as any) || undefined,
          verificationStatus: 'UNLINKED',
        },
      });
      return NextResponse.json({ success: true });
    }

    // 1. Call Gemini NLP parser to understand intent & extract entities
    let parseResult;
    try {
      parseResult = await parseWhatsAppMessage(content);
    } catch (parseErr: any) {
      console.error('⚠️ Gemini parsing failed for inbound message:', parseErr);
      const errorMessage = `⚠️ Sorry, I encountered a temporary error processing your request. Please try again in a few moments.`;
      await db.whatsAppMessage.create({
        data: {
          phone: remoteJid,
          message: errorMessage,
          direction: 'OUTBOUND',
          status: 'PENDING'
        }
      });
      return NextResponse.json({ success: true });
    }

    // Filter out unrelated messages (unknown intent)
    if (!parseResult || parseResult.intent === 'unknown') {
      console.log(`ℹ️ Replying with fallback menu for unknown inbound message from ${senderName || remoteJid}: "${content}"`);
      const welcomeMessage = `👋 Hello! I am the *KG Store Agent*.\n\nI can help you interact with our Store ERP directly from WhatsApp. Here are the things I can help you with:\n\n1. 📊 *Check Stock:* Ask me something like _"Is Blue Gel Pen in stock?"_ or _"Check stock of HDMI Cable"_.\n2. 📝 *Request Items:* Ask me _"Need 15 Blue Gel Pens"_ or _"Request 5 USB-C Hubs"_.\n3. ✅ *Approve Requests:* Admins can approve or reject requests by typing _"Approve REQ-XXXX"_ or _"Reject REQ-XXXX"_.\n\nHow can I help you today?`;
      await db.whatsAppMessage.create({
        data: {
          phone: remoteJid,
          message: welcomeMessage,
          direction: 'OUTBOUND',
          status: 'PENDING'
        }
      });
      return NextResponse.json({ success: true });
    }

    // Save inbound message only after validating it is related to the store
    await db.whatsAppMessage.create({
      data: {
        phone: remoteJid, // Store full JID to support Linked Devices (@lid)
        message: content,
        direction: 'INBOUND',
        status: 'PROCESSED',
        senderName: senderName,
        providerMessageId,
        providerTimestamp,
        rawMessage: content,
        rawPayload: msg,
        attachmentMetadata: (attachment as any) || undefined,
        verificationStatus: 'UNLINKED'
      }
    });

    console.log(`✅ Saved store-related inbound message from ${senderName || remoteJid}: ${content}`);

    // 2. Perform DB operations or enhance answer based on intent
    let replyText = parseResult.suggested_reply;

    if (parseResult.intent === 'stock_query') {
      if (parseResult.item_name) {
        const item = await db.item.findFirst({
          where: { name: parseResult.item_name, deletedAt: null, active: true }
        });
        if (item) {
          const availableStock = item.stock - item.reservedQty;
          replyText = `${parseResult.suggested_reply}\n\n📊 *Real-time Stock Details:*\n• Item: ${item.name}\n• Available for Request: ${availableStock} ${item.unit} (Physical Stock: ${item.stock} ${item.unit}, Reserved: ${item.reservedQty} ${item.unit})\n• Location: Rack ${item.rack || '-'}, Shelf ${item.shelf || '-'}, Bin ${item.bin || '-'}`;
        } else {
          replyText = `${parseResult.suggested_reply}\n\n⚠️ System message: Item "${parseResult.item_name}" not found in catalog.`;
        }
      } else {
        replyText = `${parseResult.suggested_reply}\n\n⚠️ Please specify a valid item name to check stock.`;
      }

      await db.whatsAppMessage.create({
        data: {
          phone: remoteJid,
          message: replyText,
          direction: 'OUTBOUND',
          status: 'PENDING'
        }
      });

    } else if (parseResult.intent === 'create_item_request') {
      if (!matchedUser) {
        replyText = `❌ Sorry, your phone number (${cleanPhone}) is not registered in our ERP system. Please contact your administrator to register your phone number first.`;
      } else if (!parseResult.item_name || !parseResult.quantity || parseResult.quantity <= 0) {
        replyText = `❌ Please specify a valid item name and quantity (e.g., "Need 10 Blue Gel Pens").`;
      } else {
        try {
          const item = await db.item.findFirst({
            where: { name: parseResult.item_name, deletedAt: null, active: true }
          });

          if (!item) {
            replyText = `❌ Item "${parseResult.item_name}" not found in our catalog.`;
          } else {
            // Replicate Web request creation logic in a transaction
            const result = await db.$transaction(async (tx) => {
              const available = Math.max(0, item.stock - item.reservedQty);
              const requested = parseResult.quantity!;
              
              let fulfillmentStatus = "PENDING_CHECK";
              let lineAvailableQty = 0;
              let linePendingPurchaseQty = 0;
              let reserveQty = 0;
              let hasDeficit = false;

              if (available <= 0) {
                // Case 2: stock = 0 or negative
                fulfillmentStatus = "PURCHASE_REQUIRED";
                lineAvailableQty = 0;
                linePendingPurchaseQty = requested;
                reserveQty = 0;
                hasDeficit = true;
              } else if (requested <= available) {
                // Case 1: requested <= stock
                fulfillmentStatus = "AVAILABLE";
                lineAvailableQty = requested;
                linePendingPurchaseQty = 0;
                reserveQty = requested;
              } else {
                // Case 3: requested > stock
                fulfillmentStatus = "PARTIALLY_AVAILABLE";
                lineAvailableQty = available;
                linePendingPurchaseQty = requested - available;
                reserveQty = available;
                hasDeficit = true;
              }

              if (reserveQty > 0) {
                await tx.item.update({
                  where: { id: item.id },
                  data: { reservedQty: { increment: reserveQty }, version: { increment: 1 } },
                });
              }

              const status = hasDeficit ? 'UNDER_REVIEW' : 'SUBMITTED';

              const lineData: any[] = [];
              lineData.push({
                itemId: item.id,
                itemName: item.name,
                requestedQty: requested,
                availableQtySnapshot: Math.max(0, item.stock),
                availableQty: lineAvailableQty,
                pendingPurchaseQty: linePendingPurchaseQty,
                fulfillmentStatus: fulfillmentStatus,
                unit: item.unit,
                status: status
              });

              // Create Request
              const req = await tx.request.create({
                data: {
                  userId: matchedUser.id,
                  employee: matchedUser.name,
                  department: matchedUser.department,
                  note: `WhatsApp Request: ${parseResult.remarks || 'No remarks'}`,
                  status,
                  lines: { create: lineData }
                },
                include: { lines: true }
              });

              return req;
            });

            const reqRef = `REQ-${result.id.slice(-6).toUpperCase()}`;
            replyText = `${parseResult.suggested_reply}\n\n✅ *Request Created Successfully!*\n• Reference ID: *${reqRef}*\n• Item: ${item.name}\n• Quantity: ${parseResult.quantity} ${item.unit}\n• Status: ${result.status}`;

            // Create Web notification for employee
            await createNotification({
              userId: matchedUser.id,
              title: 'Requisition Created via WhatsApp',
              message: `Your request for ${item.name} (${parseResult.quantity} ${item.unit}) was successfully submitted. Status: ${result.status}`,
              type: 'info',
              link: 'requests'
            });

            // Notify all admins of the new request for approval
            const admins = await db.user.findMany({
              where: { role: 'admin', active: true, phone: { not: null } }
            });
            for (const admin of admins) {
              const adminPhone = admin.phone!.replace(/\D/g, '');
              if (adminPhone) {
                await db.whatsAppMessage.create({
                  data: {
                    phone: `${adminPhone}@s.whatsapp.net`,
                    message: `🔔 *New Requisition Request!*\n• Employee: ${matchedUser.name} (${matchedUser.department})\n• Item: ${item.name}\n• Quantity: ${parseResult.quantity} ${item.unit}\n• Reference: *${reqRef}*\n• Status: ${result.status}\n\nTo approve or reject, reply with:\n*"APPROVE ${reqRef}"* or *"REJECT ${reqRef}"*`,
                    direction: 'OUTBOUND',
                    status: 'PENDING'
                  }
                });
              }
            }
          }
        } catch (txnErr) {
          console.error('⚠️ Transaction failed during WhatsApp request creation:', txnErr);
          replyText = `❌ Internal error: Failed to submit request in the database. Please try again.`;
        }
      }

      await db.whatsAppMessage.create({
        data: {
          phone: remoteJid,
          message: replyText,
          direction: 'OUTBOUND',
          status: 'PENDING'
        }
      });

    } else if (parseResult.intent === 'approve_transaction' || parseResult.intent === 'reject_transaction') {
      if (!matchedUser || matchedUser.role !== 'admin') {
        replyText = `❌ Unauthorized: Only administrators can approve or reject requests.`;
      } else if (!parseResult.transaction_reference) {
        replyText = `❌ Please specify the request reference ID to approve/reject (e.g., "APPROVE REQ-9GIP3").`;
      } else {
        const ref = parseResult.transaction_reference.replace(/^REQ-/, '').trim();
        const isApprove = parseResult.intent === 'approve_transaction';

        try {
          const reqs = await db.request.findMany({
            include: { lines: true, user: true }
          });
          const req = reqs.find(r => {
            const idUpper = r.id.toUpperCase();
            const refUpper = ref.toUpperCase();
            return idUpper === refUpper || idUpper.endsWith(refUpper);
          });

          if (!req) {
            replyText = `❌ Request with reference "${parseResult.transaction_reference}" not found.`;
          } else {
            const pendingStatuses = [
              'PENDING',
              'SUBMITTED',
              'UNDER_REVIEW',
              'PENDING DEPARTMENT APPROVAL',
              'PENDING_DEPT_APPROVAL'
            ];
            const isPending = pendingStatuses.includes(req.status.toUpperCase());
            const isApproved = req.status.toUpperCase() === 'APPROVED';
            const targetStatus = isApprove ? 'APPROVED' : 'REJECTED';

            if (isApprove && !isPending) {
              replyText = `❌ Only pending requests can be approved. Current status: ${req.status}`;
            } else if (!isApprove && !isPending && !isApproved) {
              replyText = `❌ Only pending or approved requests can be rejected. Current status: ${req.status}`;
            } else {
              const updatedReq = await db.$transaction(async (tx) => {
                // Find or start approval workflow instance
                let instance = await tx.approvalInstance.findFirst({
                  where: { moduleName: 'STORE_REQUISITION', documentId: req.id },
                  orderBy: { createdAt: 'desc' },
                  include: { steps: true },
                });

                if (!instance) {
                  let totalAmount = 0;
                  const flags: string[] = [];
                  for (const line of req.lines) {
                    const item = await tx.item.findUnique({ where: { id: line.itemId } });
                    if (item) {
                      totalAmount += (item.price ?? 0) * line.requestedQty;
                      if (item.category && item.category.trim().toLowerCase().includes('asset')) {
                        if (!flags.includes('isAsset')) flags.push('isAsset');
                      }
                    }
                  }
                  instance = await startApproval(tx, {
                    moduleName: 'STORE_REQUISITION',
                    documentType: 'STORE_REQUISITION',
                    documentId: req.id,
                    createdById: req.userId,
                    ctx: { amount: totalAmount, flags },
                  });
                }

                if (isApprove) {
                  // An empty workflow is approved immediately by startApproval.
                  // Only ask the engine to advance when there is an actual pending step.
                  let updatedInstance = instance;
                  if (instance.status !== 'APPROVED') {
                    const approvalResult = await approveStep(tx, {
                      instanceId: instance.id,
                      user: { id: matchedUser.id, role: matchedUser.role, isDeptHead: matchedUser.isDeptHead },
                      remarks: 'Approved via WhatsApp',
                    });
                    updatedInstance = approvalResult.instance;
                  }

                  // Replicate approval transaction if fully approved
                  if (updatedInstance.status === 'APPROVED') {
                    for (const line of req.lines) {
                      const approvedQty = line.requestedQty;
                      const available = line.availableQty || 0;
                      const newAvailableQty = Math.min(available, approvedQty);
                      const newPendingPurchaseQty = approvedQty - newAvailableQty;
                      const releaseQty = available - newAvailableQty;

                      await tx.requestLine.update({
                        where: { id: line.id },
                        data: {
                          approvedQty,
                          status: 'Approved',
                          availableQty: newAvailableQty,
                          pendingPurchaseQty: newPendingPurchaseQty,
                          fulfillmentStatus: deriveFulfillmentStatus(
                            {
                              requestedQty: line.requestedQty,
                              approvedQty,
                              issuedQty: line.issuedQty,
                              availableQty: newAvailableQty,
                              pendingPurchaseQty: newPendingPurchaseQty,
                              status: 'APPROVED',
                            },
                            false,
                          ),
                        },
                      });

                      if (releaseQty > 0) {
                        await tx.item.update({
                          where: { id: line.itemId },
                          data: { reservedQty: { decrement: releaseQty }, version: { increment: 1 } },
                        });
                      }

                      await tx.item.updateMany({
                        where: { id: line.itemId, active: false, sourceChannel: 'REQUISITION' },
                        data: { active: true },
                      });
                    }

                    return await tx.request.update({
                      where: { id: req.id },
                      data: { status: 'Approved' },
                      include: { lines: true, user: true }
                    });
                  }

                  // Partially approved (more steps remaining in multi-step workflow)
                  return req;
                } else {
                  // Replicate rejection transaction
                  await rejectStep(tx, {
                    instanceId: instance.id,
                    user: { id: matchedUser.id, role: matchedUser.role, isDeptHead: matchedUser.isDeptHead },
                    remarks: 'Rejected via WhatsApp',
                  });

                  for (const line of req.lines) {
                    const approvedBase = line.approvedQty > 0 ? line.approvedQty : line.requestedQty;
                    const held = Math.max(0, Math.min(approvedBase, line.availableQty || 0) - line.issuedQty);
                    if (held > 0) {
                      await releaseReservation(tx, line.itemId, held);
                    }
                    await tx.requestLine.update({
                      where: { id: line.id },
                      data: { status: 'Rejected', fulfillmentStatus: 'CANCELLED' }
                    });
                    await tx.item.updateMany({
                      where: { id: line.itemId, active: false, sourceChannel: 'REQUISITION', stock: 0 },
                      data: { deletedAt: new Date() },
                    });
                  }
                  return await tx.request.update({
                    where: { id: req.id },
                    data: { status: 'Rejected' },
                    include: { lines: true, user: true }
                  });
                }
              });

              const flat = flattenRequest(updatedReq);
              const isFullyApproved = updatedReq.status === 'Approved';

              if (isApprove) {
                if (isFullyApproved) {
                  await createAuditLog({
                    action: 'APPROVE_REQUEST',
                    user: {
                      id: matchedUser.id,
                      empId: matchedUser.empId,
                      name: matchedUser.name,
                      role: matchedUser.role,
                      department: matchedUser.department
                    },
                    targetId: req.id,
                    targetName: flat.itemName,
                    metadata: { employee: req.employee, source: 'WHATSAPP' }
                  });

                  await createNotification({
                    userId: req.userId,
                    title: 'Request Approved',
                    message: `Your request (${flat.itemName}) has been approved. You can collect it from the store.`,
                    type: 'success',
                    link: 'requests'
                  });

                  replyText = `${parseResult.suggested_reply}\n\n✅ *Request ${parseResult.transaction_reference} fully APPROVED.*`;

                  if (req.user && req.user.phone) {
                    const requesterPhone = req.user.phone.replace(/\D/g, '');
                    if (requesterPhone) {
                      await db.whatsAppMessage.create({
                        data: {
                          phone: `${requesterPhone}@s.whatsapp.net`,
                          message: `🔔 *Request Approved!*\nYour request for "${flat.itemName}" has been approved. You can collect it from the store.`,
                          direction: 'OUTBOUND',
                          status: 'PENDING'
                        }
                      });
                    }
                  }
                } else {
                  await createAuditLog({
                    action: 'APPROVE_REQUEST',
                    user: {
                      id: matchedUser.id,
                      empId: matchedUser.empId,
                      name: matchedUser.name,
                      role: matchedUser.role,
                      department: matchedUser.department
                    },
                    targetId: req.id,
                    targetName: flat.itemName,
                    metadata: { employee: req.employee, source: 'WHATSAPP', stepStatus: 'PENDING_NEXT_STEP' }
                  });

                  replyText = `${parseResult.suggested_reply}\n\n✅ *Request ${parseResult.transaction_reference} step approved successfully (Pending next step).*`;
                }
              } else {
                await createAuditLog({
                  action: 'REJECT_REQUEST',
                  user: {
                    id: matchedUser.id,
                    empId: matchedUser.empId,
                    name: matchedUser.name,
                    role: matchedUser.role,
                    department: matchedUser.department
                  },
                  targetId: req.id,
                  targetName: flat.itemName,
                  metadata: { employee: req.employee, source: 'WHATSAPP' }
                });

                await createNotification({
                  userId: req.userId,
                  title: 'Request Rejected',
                  message: `Your request (${flat.itemName}) has been rejected by the administrator.`,
                  type: 'error',
                  link: 'requests'
                });

                replyText = `${parseResult.suggested_reply}\n\n❌ *Request ${parseResult.transaction_reference} REJECTED successfully.*`;

                if (req.user && req.user.phone) {
                  const requesterPhone = req.user.phone.replace(/\D/g, '');
                  if (requesterPhone) {
                    await db.whatsAppMessage.create({
                      data: {
                        phone: `${requesterPhone}@s.whatsapp.net`,
                        message: `🔔 *Request Rejected*\nYour request for "${flat.itemName}" has been rejected by the administrator.`,
                        direction: 'OUTBOUND',
                        status: 'PENDING'
                      }
                    });
                  }
                }
              }
            }
          }
        } catch (txnErr) {
          console.error('⚠️ Transaction failed during WhatsApp approve/reject:', txnErr);
          replyText = `❌ Internal error: Failed to process approval/rejection in the database.`;
        }
      }

      await db.whatsAppMessage.create({
        data: {
          phone: remoteJid,
          message: replyText,
          direction: 'OUTBOUND',
          status: 'PENDING'
        }
      });

    } else {
      // Fallback/Unknown intent handler: Send the suggested AI reply
      if (replyText) {
        await db.whatsAppMessage.create({
          data: {
            phone: remoteJid,
            message: replyText,
            direction: 'OUTBOUND',
            status: 'PENDING'
          }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
