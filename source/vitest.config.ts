import { defineConfig } from 'vitest/config'
import path from 'path'

const absoluteTestDbPath = path.resolve(__dirname, 'prisma', 'test.db').replace(/\\/g, '/')

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    env: {
      DATABASE_URL: `file:${absoluteTestDbPath}`
    },
    include: ['src/**/*.test.ts'],
    sequence: {
      concurrent: false
    },
    fileParallelism: false
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
