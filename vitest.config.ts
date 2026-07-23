import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:65432/kg_inventra_test',
    },
    include: ['src/**/*.test.ts'],
    sequence: {
      concurrent: false
    },
    fileParallelism: false
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
