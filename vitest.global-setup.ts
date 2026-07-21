import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const absoluteTestDbPath = path.resolve(__dirname, 'prisma', 'test.db').replace(/\\/g, '/')

export function setup() {
  const databaseUrl = `file:${absoluteTestDbPath}`
  const prismaCli = path.join(__dirname, 'node_modules', 'prisma', 'build', 'index.js')

  for (const suffix of ['', '-shm', '-wal']) {
    rmSync(`${absoluteTestDbPath}${suffix}`, { force: true })
  }

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
