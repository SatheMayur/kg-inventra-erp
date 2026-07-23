type ResolveDatabaseUrlOptions = {
  allowSqlite?: boolean
}

function envAllowsSqlite() {
  return process.env.ALLOW_SQLITE_DATABASE_URL === 'true'
}

export function resolveDatabaseUrl(rawUrl?: string, options: ResolveDatabaseUrlOptions = {}) {
  const dbUrl = rawUrl?.trim() ?? ''
  const allowSqlite = options.allowSqlite ?? envAllowsSqlite()

  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL for PostgreSQL datasource.')
  }

  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    return dbUrl
  }

  if (dbUrl.startsWith('file:') && allowSqlite) {
    return dbUrl
  }

  throw new Error(
    [
      'Invalid DATABASE_URL for the current Prisma schema.',
      'This application is configured with a PostgreSQL datasource, so DATABASE_URL must start with "postgresql://" or "postgres://".',
      'Set ALLOW_SQLITE_DATABASE_URL=true only for explicit local SQLite compatibility work.',
    ].join(' '),
  )
}

