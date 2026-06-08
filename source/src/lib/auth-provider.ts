/**
 * Password hashing using PBKDF2 with a random salt.
 * Replaces the previous SHA-256 implementation which was unsalted and trivially reversible.
 *
 * Format stored in DB: pbkdf2:<salt_hex>:<hash_hex>
 * - 32-byte random salt (64 hex chars)
 * - 64-byte PBKDF2-SHA512 output (128 hex chars)
 * - 100,000 iterations
 *
 * Backward-compatible: if the stored value does NOT start with "pbkdf2:" it is
 * treated as a legacy SHA-256 hash and compared accordingly, so existing accounts
 * continue to work until their password is next reset.
 */
import { randomBytes, pbkdf2Sync, createHash } from 'crypto';

const ITERATIONS = 100_000;
const KEY_LEN = 64;
const DIGEST = 'sha512';
const PREFIX = 'pbkdf2:';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  return `${PREFIX}${salt}:${hash}`;
}

export async function comparePassword(password: string, stored: string): Promise<boolean> {
  // Legacy SHA-256 path — allows existing accounts to log in
  if (!stored.startsWith(PREFIX)) {
    const legacy = createHash('sha256').update(password).digest('hex');
    return legacy === stored;
  }

  const [, salt, expectedHash] = stored.split(':');
  if (!salt || !expectedHash) return false;

  const actualHash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(actualHash, expectedHash);
}

/** Constant-time string comparison (same length assumed for hex digests). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
