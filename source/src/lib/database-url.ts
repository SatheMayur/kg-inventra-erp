import path from 'path'

const fallbackSqliteUrl = 'file:./prisma/dev.db'

type ResolveDatabaseUrlOptions = {
  nodeEnv?: string
  allowNonSqlite?: boolean
  baseDir?: string
}

function envAllowsNonSqlite() {
  return process.env.ALLOW_NON_SQLITE_DATABASE_URL === 'true'
}

export function resolveDatabaseUrl(rawUrl?: string, options: ResolveDatabaseUrlOptions = {}) {
  const dbUrl = rawUrl?.trim() ?? ''
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  const allowNonSqlite = options.allowNonSqlite ?? envAllowsNonSqlite()
  const baseDir = options.baseDir ?? process.cwd()

  let targetUrl = dbUrl
  if (!targetUrl) {
    targetUrl = fallbackSqliteUrl
  } else if (!targetUrl.startsWith('file:') && nodeEnv !== 'production' && !allowNonSqlite) {
    targetUrl = fallbackSqliteUrl
  }

  if (targetUrl.startsWith('file:')) {
    const normalized = targetUrl.replace(/\\/g, '/')
    const filePath = normalized.slice(5)
    if (path.isAbsolute(filePath)) {
      return `file:${filePath}`
    }
    const cleanRelative = filePath.replace(/^\.\//, '').replace(/^prisma\//, '')
    const absolutePath = path.resolve(baseDir, 'prisma', cleanRelative).replace(/\\/g, '/')
    return `file:${absolutePath}`
  }

  if (allowNonSqlite) {
    return targetUrl
  }

  if (nodeEnv !== 'production') {
    return fallbackSqliteUrl
  }

  throw new Error(
    [
      'Invalid DATABASE_URL for the current Prisma schema.',
      'This application is currently configured with a SQLite datasource, so DATABASE_URL must start with "file:".',
      'Set ALLOW_NON_SQLITE_DATABASE_URL=true only after the Prisma datasource provider has been migrated intentionally.',
    ].join(' '),
  )
}

