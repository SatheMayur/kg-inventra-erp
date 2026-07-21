import path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveDatabaseUrl } from './database-url'

const expectedDbUrl = `file:${path.resolve('/app', 'prisma', 'dev.db').replace(/\\/g, '/')}`

describe('resolveDatabaseUrl', () => {
  it('uses the local SQLite database when DATABASE_URL is empty', () => {
    expect(resolveDatabaseUrl(undefined, { nodeEnv: 'production', baseDir: '/app' })).toBe(expectedDbUrl)
    expect(resolveDatabaseUrl('', { nodeEnv: 'production', baseDir: '/app' })).toBe(expectedDbUrl)
  })

  it('normalizes SQLite file URLs for Windows paths', () => {
    expect(resolveDatabaseUrl('file:.\\prisma\\dev.db', { nodeEnv: 'production', baseDir: '/app' })).toBe(
      expectedDbUrl,
    )
  })

  it('falls back to SQLite for accidental non-file URLs outside production', () => {
    expect(resolveDatabaseUrl('postgresql://example.invalid/store', { nodeEnv: 'development', baseDir: '/app' })).toBe(
      expectedDbUrl,
    )
  })

  it('fails fast for incompatible production database providers', () => {
    expect(() =>
      resolveDatabaseUrl('postgresql://example.invalid/store', { nodeEnv: 'production' }),
    ).toThrow(/configured with a SQLite datasource/)
  })

  it('allows an explicit non-SQLite override for intentional future migrations', () => {
    expect(
      resolveDatabaseUrl('postgresql://example.invalid/store', {
        nodeEnv: 'production',
        allowNonSqlite: true,
      }),
    ).toBe('postgresql://example.invalid/store')
  })
})
