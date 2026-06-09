import net from 'net';
import { lookup } from 'dns/promises';
import { ApiError } from './api-utils';

/** True for loopback, private, link-local (incl. cloud metadata 169.254.169.254) and ULA ranges. */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice('::ffff:'.length));
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  return false;
}

/**
 * SSRF guard. Validates a user-supplied outbound URL (webhooks, integration test
 * endpoints) before the server fetches it: enforces http(s), blocks obvious local
 * hostnames, and resolves DNS to reject any address in a private/loopback/
 * link-local range (e.g. http://169.254.169.254/ cloud metadata, internal services).
 * Throws ApiError(400) on any violation. Centralised so every server-side fetch
 * of a user URL is guarded the same way.
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(400, 'Invalid URL', 'BAD_REQUEST');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(400, 'Only http(s) URLs are allowed', 'BAD_REQUEST');
  }

  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ApiError(400, 'URL host is not allowed', 'BAD_REQUEST');
  }

  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((r) => r.address);
    } catch {
      throw new ApiError(400, 'Could not resolve URL host', 'BAD_REQUEST');
    }
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new ApiError(400, 'URL resolves to a private or internal address', 'BAD_REQUEST');
    }
  }
}
