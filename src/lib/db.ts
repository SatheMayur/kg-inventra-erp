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
    datasources: {
      db: {
        url: databaseUrl,
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
