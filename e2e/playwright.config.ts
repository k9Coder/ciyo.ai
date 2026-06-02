import { defineConfig } from '@playwright/test'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '.env.e2e') })

const DIST_PATH = path.resolve(__dirname, '../pretzel/dist')

export default defineConfig({
  globalSetup:    './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  webServer: {
    command: 'node ../pretzel/e2e/fixtures-server.mjs',
    url: 'http://localhost:9876',
    reuseExistingServer: true,
    timeout: 10_000,
  },
  workers: 1,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'test-results',
  projects: [
    {
      name: 'cross-service',
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
      testMatch: 'extension/**/*.spec.ts',
    },
  ],
})
