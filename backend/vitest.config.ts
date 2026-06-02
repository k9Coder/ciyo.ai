import { defineConfig } from 'vitest/config'
import { readFileSync } from 'fs'
import { join } from 'path'

function loadDotEnv(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(join(process.cwd(), file), 'utf-8')
        .split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
        .map(l => {
          const idx = l.indexOf('=')
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
        })
    )
  } catch {
    return {}
  }
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    fileParallelism: false,
    env: loadDotEnv('.env.test'),
  },
})
