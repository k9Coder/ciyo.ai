import { defineConfig } from '@playwright/test'
import path from 'path'
import { env } from './env'

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 15_000 },
  retries: env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['./support/reporter/qa-report-reporter.ts'],
  ],
  outputDir: 'test-results',
  projects: [
    // ── Unit project ─────────────────────────────────────────────────────────
    // Pure-function tests for the reporter itself. No browser, no credentials.
    {
      name: 'unit',
      testDir: path.resolve(__dirname, 'support/reporter'),
      testMatch: '**/*.test.ts',
    },
  ],
})
