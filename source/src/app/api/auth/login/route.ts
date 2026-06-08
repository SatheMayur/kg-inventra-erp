import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { comparePassword } from '@/lib/auth-provider';
import { createAuditLog } from '@/lib/audit';
import { ApiError, handleApiError } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';

const COOKIE_NAME = 'sh_token';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 attempts per IP per 15 minutes
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const { allowed, resetAt } = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);

    if (!allowed) {
      const retryAfterSecs = Math.ceil((resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSecs),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const body = await request.json();
    const { empId, password } = body;

    if (!empId || !password) {
      throw new ApiError(400, 'empId and password are required', 'BAD_REQUEST');
    }

    const user = await db.user.findUnique({ where: { empId } });

    // Constant-time path — same error for "not found" and "wrong password" (prevents user enumeration)
    const passwordValid = user ? await comparePassword(password, user.password) : false;

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
      role: userWithoutPassword.role as 'admin' | 'employee',
    });

    const auditIp = ip !== 'unknown' ? ip : undefined;
    await createAuditLog({
      action: 'LOGIN',
      user: {
        id: userWithoutPassword.id,
        empId: userWithoutPassword.empId,
        name: userWithoutPassword.name,
        department: userWithoutPassword.department,
        role: userWithoutPassword.role as 'admin' | 'employee',
      },
      ip: auditIp,
    });

    const response = NextResponse.json({ user: userWithoutPassword, token });

    // Set httpOnly cookie — inaccessible to JavaScript, survives page refresh
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours — matches JWT expiry
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
