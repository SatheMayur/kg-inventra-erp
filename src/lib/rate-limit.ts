/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for single-instance deployments (SQLite / standalone Next.js).
 * For multi-instance deployments, replace with Redis-backed solution.
 */

interface Window {
  count: number
  resetAt: number
}

const store = new Map<string, Window>()

// Prune expired entries every 5 minutes to prevent memory leaks
const interval = setInterval(() => {
  const now = Date.now()
  for (const [key, win] of store.entries()) {
    if (win.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

if (typeof interval.unref === 'function') {
  interval.unref()
}

/**
 * @param key      Unique identifier (e.g. IP address or empId)
 * @param limit    Max requests allowed in the window
 * @param windowMs Window duration in milliseconds
 * @returns        { allowed: boolean; remaining: number; resetAt: number }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  let win = store.get(key)

  if (!win || win.resetAt < now) {
    win = { count: 0, resetAt: now + windowMs }
    store.set(key, win)
  }

  win.count++
  const remaining = Math.max(0, limit - win.count)
  const allowed = win.count <= limit

  return { allowed, remaining, resetAt: win.resetAt }
}
