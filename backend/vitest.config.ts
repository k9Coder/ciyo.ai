import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    fileParallelism: false,
    env: loadEnv(mode, process.cwd(), ''),
  },
}))
