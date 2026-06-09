import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is missing.')
}

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
        url: process.env.DATABASE_URL,
      },
    },
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

// Reuse the client across hot-reloads in development to avoid
// exhausting the connection limit
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
