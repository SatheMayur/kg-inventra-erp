import type { NextRequest } from 'next/server'

export const AUTH_COOKIE_NAME = 'sh_token'

type CookieRequest = Pick<NextRequest, 'headers' | 'nextUrl'>

function forwardedProto(request: CookieRequest) {
  return request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() || null
}

function requestProtocol(request: CookieRequest) {
  const proto = forwardedProto(request)
  if (proto) return proto
  return request.nextUrl.protocol.replace(':', '').toLowerCase()
}

function requestHost(request: CookieRequest) {
  return (request.headers.get('host') || request.nextUrl.host || '').toLowerCase()
}

function isLocalHttpHost(host: string) {
  const normalized = host.replace(/^\[/, '').replace(/\](:\d+)?$/, '').split(':')[0]
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

export function shouldUseSecureAuthCookie(request: CookieRequest) {
  const protocol = requestProtocol(request)
  if (protocol === 'https') return true
  if (protocol === 'http') return false

  if (process.env.NODE_ENV === 'production') {
    return !isLocalHttpHost(requestHost(request))
  }

  return false
}

export function authCookieOptions(request: CookieRequest, maxAge: number) {
  return {
    httpOnly: true,
    secure: shouldUseSecureAuthCookie(request),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
