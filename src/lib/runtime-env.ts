import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { resolveDatabaseUrl } from './database-url'

let runtimeEnvLoaded = false

function getProjectRoot() {
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return /* turbopackIgnore: true */ process.cwd()
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(/* turbopackIgnore: true */ moduleDir, '..', '..')
}

function parseEnvLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const eqIndex = trimmed.indexOf('=')
  if (eqIndex <= 0) return null

  const key = trimmed.slice(0, eqIndex).trim()
  let value = trimmed.slice(eqIndex + 1).trim()

  if (!key) return null

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

export function ensureRuntimeEnv() {
  if (runtimeEnvLoaded) return
  runtimeEnvLoaded = true

  const projectRoot = getProjectRoot()
  const candidates = [
    path.resolve(/* turbopackIgnore: true */ projectRoot, '.env'),
    path.resolve(/* turbopackIgnore: true */ projectRoot, '.env.local'),
  ]

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue

    const contents = readFileSync(filePath, 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const parsed = parseEnvLine(line)
      if (!parsed) continue
      if (process.env[parsed.key] === undefined || process.env[parsed.key] === '') {
        process.env[parsed.key] = parsed.value
      }
    }
  }

  process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL)
}
