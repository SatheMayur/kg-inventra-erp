import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function setup() {
  const databaseUrl = process.env.TEST_DATABASE_URL
  if (!databaseUrl) {
    return
  }

  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error('TEST_DATABASE_URL must be a PostgreSQL URL.')
  }

  const prismaCli = path.join(__dirname, 'node_modules', 'prisma', 'build', 'index.js')

  execFileSync(
    process.execPath,
    [
      prismaCli,
      'db',
      'push',
      '--skip-generate',
      '--schema',
      'prisma/schema.prisma',
    ],
    {
      cwd: __dirname,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    }
  )
}
