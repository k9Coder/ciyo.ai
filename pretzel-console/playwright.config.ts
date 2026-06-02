import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

config({ path: path.join(__dirname, 'e2e/.env.e2e') })

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'e2e/test-results',
  projects: [
    {
      name: 'admin-setup',
      testMatch: '**/auth.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      dependencies: ['admin-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/admin.json',
        baseURL: process.env.E2E_ADMIN_URL ?? 'http://localhost:5173',
      },
      testMatch: 'e2e/**/*.spec.ts',
    },
  ],
})
