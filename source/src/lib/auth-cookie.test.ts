import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { authCookieOptions, shouldUseSecureAuthCookie } from './auth-cookie'

function req(url: string, headers?: Record<string, string>) {
  return new NextRequest(url, { headers })
}

describe('auth cookie security policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not mark localhost HTTP cookies secure during local production smoke runs', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(shouldUseSecureAuthCookie(req('http://127.0.0.1:4015/api/auth/login'))).toBe(false)
    expect(shouldUseSecureAuthCookie(req('http://localhost:4015/api/auth/login'))).toBe(false)
  })

  it('marks HTTPS cookies secure', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(shouldUseSecureAuthCookie(req('https://inventra.example/api/auth/login'))).toBe(true)
  })

  it('trusts x-forwarded-proto for HTTPS behind a proxy', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(
      shouldUseSecureAuthCookie(
        req('http://inventra.example/api/auth/login', { 'x-forwarded-proto': 'https' }),
      ),
    ).toBe(true)
  })

  it('keeps non-local production hosts secure when protocol is unavailable', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(
      shouldUseSecureAuthCookie(
        req('ftp://inventra.example/api/auth/login', { host: 'inventra.example' }),
      ),
    ).toBe(true)
  })

  it('uses consistent options for login and logout cookies', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(authCookieOptions(req('http://127.0.0.1:4015/api/auth/logout'), 0)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
  })
})
