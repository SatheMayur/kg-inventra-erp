import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  generateToken,
  verifyToken,
  AuthRole,
  AuthUser,
  LegacyRole,
  StoreRole,
} from './jwt';

export { generateToken, verifyToken };
export type { AuthRole, AuthUser, LegacyRole, StoreRole };

export type AuthorizeResult =
  | { error: string; status: number; user?: undefined }
  | { error?: undefined; status?: undefined; user: AuthUser };

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  let verified: AuthUser | null = null;

  // 1. Try pre-verified payload from middleware header first to avoid duplicate verification
  const payloadHeader = req.headers.get('x-user-payload');
  if (payloadHeader) {
    try {
      verified = JSON.parse(payloadHeader) as AuthUser;
    } catch {
      // Ignore parse errors, fall back to verification
    }
  }

  // 2. Fall back to direct JWT token verification if header is absent
  if (!verified) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      verified = await verifyToken(token);
    }

    if (!verified) {
      const cookieToken = req.cookies.get('sh_token')?.value;
      if (cookieToken) {
        verified = await verifyToken(cookieToken);
      }
    }
  }

  if (!verified) return null;

  // Tokens can outlive DB resets/reseeds. Re-resolve the live user row so
  // downstream routes don't fail on stale IDs from an old session.
  let liveUser = await db.user.findUnique({ where: { id: verified.id } });
  if (!liveUser) {
    liveUser = await db.user.findUnique({ where: { empId: verified.empId } });
  }
  if (!liveUser || !liveUser.active) return null;

  return {
    id: liveUser.id,
    empId: liveUser.empId,
    name: liveUser.name,
    department: liveUser.department,
    role: liveUser.role as AuthRole,
    isDeptHead: liveUser.isDeptHead,
  };
}

export async function authorize(
  req: NextRequest,
  roles?: AuthRole[],
  options?: { rootOnly?: boolean }
): Promise<AuthorizeResult> {
  const user = await getAuthUser(req);
  if (!user) {
    return { error: 'Unauthorized', status: 401 };
  }
  if (roles) {
    const expandedRoles = [...roles];
    if (roles.includes('admin') && !expandedRoles.includes('STORE_ADMIN')) {
      expandedRoles.push('STORE_ADMIN');
    }
    if (roles.includes('employee')) {
      const employeeRoles: AuthRole[] = [
        'STORE_ADMIN',
        'STORE_OPERATOR',
        'DEPT_USER',
        'DEPT_HEAD',
        'PURCHASE_USER',
        'ACCOUNTS_USER',
        'MANAGEMENT'
      ];
      for (const r of employeeRoles) {
        if (!expandedRoles.includes(r)) expandedRoles.push(r);
      }
    }
    if (!expandedRoles.includes(user.role)) {
      return { error: 'Forbidden', status: 403 };
    }
  }
  if (options?.rootOnly && user.empId !== 'software') {
    return { error: 'Forbidden', status: 403 };
  }
  return { user };
}
