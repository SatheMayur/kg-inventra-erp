import { describe, expect, it } from 'vitest'
import { resolveDatabaseUrl } from './database-url'

describe('resolveDatabaseUrl', () => {
  it('requires DATABASE_URL', () => {
    expect(() => resolveDatabaseUrl(undefined)).toThrow(/Missing DATABASE_URL/)
    expect(() => resolveDatabaseUrl('')).toThrow(/Missing DATABASE_URL/)
  })

  it('accepts PostgreSQL URLs', () => {
    expect(resolveDatabaseUrl('postgresql://example.invalid/store')).toBe('postgresql://example.invalid/store')
    expect(resolveDatabaseUrl('postgres://example.invalid/store')).toBe('postgres://example.invalid/store')
  })

  it('rejects SQLite file URLs by default', () => {
    expect(() => resolveDatabaseUrl('file:./prisma/dev.db')).toThrow(/PostgreSQL datasource/)
  })

  it('allows SQLite only with an explicit compatibility override', () => {
    expect(resolveDatabaseUrl('file:./prisma/dev.db', { allowSqlite: true })).toBe('file:./prisma/dev.db')
  })

  it('rejects unsupported database providers', () => {
    expect(() => resolveDatabaseUrl('mysql://example.invalid/store')).toThrow(/PostgreSQL datasource/)
  })
})
