import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { comparePassword } from '@/lib/auth-provider';
import { createAuditLog } from '@/lib/audit';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { AUTH_COOKIE_NAME, authCookieOptions } from '@/lib/auth-cookie';

const DUMMY_PASSWORD_HASH = `pbkdf2:${'0'.repeat(64)}:${'0'.repeat(128)}`;

function rateLimitResponse(resetAt: number) {
  const retryAfterSecs = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: 'Too many login attempts. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSecs),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 attempts per IP per 15 minutes.
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const { allowed, resetAt } = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);

    if (!allowed) {
      return rateLimitResponse(resetAt);
    }

    const body = await request.json();
    const { empId, password } = body;

    if (typeof empId !== 'string' || !empId.trim() || typeof password !== 'string' || !password) {
      throw new ApiError(400, 'empId and password are required', 'BAD_REQUEST');
    }

    const normalizedEmpId = empId.trim();
    const accountLimit = rateLimit(`login-account:${normalizedEmpId.toLowerCase()}`, 10, 15 * 60 * 1000);
    if (!accountLimit.allowed) {
      return rateLimitResponse(accountLimit.resetAt);
    }

    const user = await db.user.findUnique({ where: { empId: normalizedEmpId } });

    // Always perform the expensive password check so unknown employee IDs do not
    // have a measurably faster response than valid accounts.
    const passwordValid = await comparePassword(password, user?.password ?? DUMMY_PASSWORD_HASH);

    if (!user || !passwordValid) {
      throw new ApiError(401, 'Invalid credentials', 'UNAUTHORIZED');
    }

    if (!user.active) {
      throw new ApiError(403, 'Account is deactivated', 'FORBIDDEN');
    }

    const { password: _pw, ...userWithoutPassword } = user;

    const token = await generateToken({
      id: userWithoutPassword.id,
      empId: userWithoutPassword.empId,
      name: userWithoutPassword.name,
      department: userWithoutPassword.department,
      role: userWithoutPassword.role as any,
      isDeptHead: userWithoutPassword.isDeptHead,
    });

    const auditIp = ip !== 'unknown' ? ip : undefined;
    await createAuditLog({
      action: 'LOGIN',
      user: {
        id: userWithoutPassword.id,
        empId: userWithoutPassword.empId,
        name: userWithoutPassword.name,
        department: userWithoutPassword.department,
        role: userWithoutPassword.role as any,
        isDeptHead: userWithoutPassword.isDeptHead,
      },
      ip: auditIp,
    });

    const response = NextResponse.json({ user: userWithoutPassword, token });
    response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(request, 60 * 60 * 8));

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
