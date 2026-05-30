import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, 'e2e/.env.e2e') })

const DIST_PATH = path.resolve(__dirname, 'dist')

export default defineConfig({
  globalSetup:    './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
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
        storageState: 'e2e/.auth/admin.json',
        baseURL: process.env.E2E_ADMIN_URL ?? 'http://localhost:5173',
      },
      testMatch: 'e2e/admin/**/*.spec.ts',
    },
    {
      name: 'extension',
      use: {
        channel: 'chromium',
        headless: false,
        launchOptions: {
          args: [
            '--headless=new',
            `--disable-extensions-except=${DIST_PATH}`,
            `--load-extension=${DIST_PATH}`,
          ],
        },
      },
      testMatch: 'e2e/extension/**/*.spec.ts',
    },
    {
      name: 'api',
      use: { baseURL: process.env.E2E_BACKEND_URL ?? 'http://localhost:3000' },
      testMatch: 'e2e/api/**/*.spec.ts',
    },
  ],
})
