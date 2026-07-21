import { PrismaClient } from '@prisma/client'
import { resolveDatabaseUrl } from './database-url'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL)

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
    // SQLite doesn't support connection pooling, but this config
    // is forward-compatible when migrating to PostgreSQL
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (databaseUrl.startsWith('file:')) {
  db.$queryRawUnsafe('PRAGMA journal_mode=WAL;').catch((err) => {
    console.error('Failed to set WAL mode:', err);
  });
  db.$queryRawUnsafe('PRAGMA busy_timeout=5000;').catch((err) => {
    console.error('Failed to set busy timeout:', err);
  });
}

// Reuse the client across hot-reloads in development to avoid
// exhausting the connection limit
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
