import { defineConfig } from '@playwright/test'
import path from 'path'

const DIST_PATH = path.resolve(__dirname, 'dist')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  webServer: {
    command: 'node e2e/fixtures-server.mjs',
    url: 'http://localhost:9876',
    reuseExistingServer: true,
    timeout: 10_000,
  },
  workers: 1,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'e2e/test-results',
  projects: [
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
      testMatch: 'e2e/**/*.spec.ts',
    },
  ],
})
