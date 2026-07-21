import * as jose from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is missing');
}
if (JWT_SECRET === 'ChangeThisToA64CharRandomString' || JWT_SECRET.includes('placeholder')) {
  throw new Error('JWT_SECRET must not use a insecure placeholder value');
}
const secret = new TextEncoder().encode(JWT_SECRET);

export type LegacyRole = 'admin' | 'employee';
export type StoreRole =
  | 'STORE_ADMIN'
  | 'STORE_OPERATOR'
  | 'DEPT_USER'
  | 'DEPT_HEAD'
  | 'PURCHASE_USER'
  | 'ACCOUNTS_USER'
  | 'MANAGEMENT';

export type AuthRole = LegacyRole | StoreRole;

export interface AuthUser {
  id: string;
  empId: string;
  name: string;
  department: string;
  role: AuthRole;
  isDeptHead?: boolean;
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
