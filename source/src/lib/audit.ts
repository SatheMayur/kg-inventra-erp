import { db } from './db';
import { AuthUser } from './auth';

export const AuditAction = {
  LOGIN: 'LOGIN',
  CREATE_ITEM: 'CREATE_ITEM',
  UPDATE_ITEM: 'UPDATE_ITEM',
  DELETE_ITEM: 'DELETE_ITEM',
  CREATE_REQUEST: 'CREATE_REQUEST',
  APPROVE_REQUEST: 'APPROVE_REQUEST',
  APPROVE_REQUEST_PARTIAL: 'APPROVE_REQUEST_PARTIAL',
  REJECT_REQUEST: 'REJECT_REQUEST',
  ISSUE_REQUEST: 'ISSUE_REQUEST',
  READY_REQUEST: 'READY_REQUEST',
  CANCEL_REQUEST: 'CANCEL_REQUEST',
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  BULK_IMPORT: 'BULK_IMPORT',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  CREATE_VARIANT: 'CREATE_VARIANT',
  CREATE_PO: 'CREATE_PO',
  APPROVE_PO: 'APPROVE_PO',
  SEND_PO: 'SEND_PO',
  RECEIVE_PO: 'RECEIVE_PO',
  CREATE_GRN: 'CREATE_GRN',
  CONFIRM_GRN: 'CONFIRM_GRN',
  CREATE_INVOICE: 'CREATE_INVOICE',
  VERIFY_INVOICE: 'VERIFY_INVOICE',
  CREATE_TRANSFER: 'CREATE_TRANSFER',
  CONFIRM_TRANSFER: 'CONFIRM_TRANSFER',
  RECONCILE_TRANSFER: 'RECONCILE_TRANSFER',
  GRN_RECEIVED: 'GRN_RECEIVED',
  ADJUST_STOCK: 'ADJUST_STOCK',
  RETURN_ITEM: 'RETURN_ITEM',
  CREATE_MAINTENANCE: 'CREATE_MAINTENANCE',
} as const;
export type AuditAction = typeof AuditAction[keyof typeof AuditAction];

/** Typed metadata — no more `any`. */
export type AuditMetadata = Record<string, string | number | boolean | null | undefined>;

export async function createAuditLog({
  action,
  user,
  targetId,
  targetName,
  metadata,
  ip,
}: {
  action: AuditAction;
  user?: AuthUser;
  targetId?: string;
  targetName?: string;
  metadata?: AuditMetadata;
  ip?: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        userId: user?.id,
        userName: user?.name,
        targetId,
        targetName,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ip,
      },
    });
  } catch (error) {
    // Audit failures must never crash the main request
    console.error('[AUDIT_LOG_ERROR]', error);
  }
}
