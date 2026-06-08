import { NextRequest } from 'next/server';
import * as jose from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is missing. Authentication cannot initialize.');
}
const secret = new TextEncoder().encode(JWT_SECRET);

export interface AuthUser {
  id: string;
  empId: string;
  name: string;
  department: string;
  role: 'admin' | 'employee';
}

export async function generateToken(user: AuthUser): Promise<string> {
  return await new jose.SignJWT({ 
    id: user.id, 
    empId: user.empId, 
    name: user.name, 
    department: user.department, 
    role: user.role 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  // 1. Try Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return await verifyToken(token);
  }

  // 2. Try 'sh_token' cookie (set during login)
  const cookieToken = req.cookies.get('sh_token')?.value;
  if (cookieToken) {
    return await verifyToken(cookieToken);
  }

  return null;
}

export async function authorize(req: NextRequest, roles?: ('admin' | 'employee')[], options?: { rootOnly?: boolean }) {
  const user = await getAuthUser(req);
  if (!user) {
    return { error: 'Unauthorized', status: 401 };
  }
  if (roles && !roles.includes(user.role)) {
    return { error: 'Forbidden', status: 403 };
  }
  if (options?.rootOnly && user.empId !== 'software') {
    return { error: 'Forbidden', status: 403 };
  }
  return { user };
}
