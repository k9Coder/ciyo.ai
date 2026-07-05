import { defineConfig, devices } from '@playwright/test'
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
  timeout: 30_000,
  use: {
    // CI Clerk JWT refreshes over the network (extra latency). Give assertions
    // 15 s instead of the default 5 s so the first API call has time to land.
    assertionTimeout: 15_000,
  },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'test-results',
  projects: [
    // ── API project ─────────────────────────────────────────────────────────
    // Backend REST API specs from backend/e2e/. No browser; parallel-safe.
    {
      name: 'api',
      use: { baseURL: process.env.E2E_BACKEND_URL ?? 'http://localhost:3000' },
      testDir: path.resolve(__dirname, '../backend/e2e'),
      testMatch: '**/*.spec.ts',
      // API tests hit a real HTTP server — safe to parallelise.
      workers: 4,
    },

    // ── Extension project ────────────────────────────────────────────────────
    // Loads the built Pretzel extension in real Chromium.
    // Specs live in pretzel/e2e/.
    {
      name: 'extension',
      use: {
        channel: 'chromium',
        // Playwright's headless:true passes --headless=old which breaks MV3 extension
        // service workers. headless:false suppresses that flag; we add --headless=new
        // manually so the browser is still headless but service workers work correctly.
        headless: false,
        launchOptions: {
          args: [
            '--headless=new',
            `--disable-extensions-except=${DIST_PATH}`,
            `--load-extension=${DIST_PATH}`,
          ],
        },
      },
      testDir: path.resolve(__dirname, '../pretzel/e2e'),
      testMatch: '**/*.spec.ts',
      // Must be serial: extension service workers share state across tests.
      workers: 1,
    },

    // ── Cross-service project ────────────────────────────────────────────────
    // AI rule → policy publish → extension enforces full flow.
    // Specs live in e2e/extension/ (root cross-cutting suite).
    {
      name: 'cross-service',
      use: {
        channel: 'chromium',
        // Same headless:false + --headless=new reasoning as the extension project.
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
      // Must be serial: extension service workers share state across tests.
      workers: 1,
    },

    // ── Admin setup (auth state) ─────────────────────────────────────────────
    // Runs Clerk login once and persists browser storage state so the admin
    // project can reuse the authenticated session without re-logging in.
    {
      name: 'admin-setup',
      testDir: path.resolve(__dirname, '../pretzel-console/e2e'),
      testMatch: '**/auth.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // ── Admin project ────────────────────────────────────────────────────────
    // Admin web app UI flows. Specs live in pretzel-console/e2e/.
    // Depends on admin-setup to have a valid .auth/admin.json storage state.
    {
      name: 'admin',
      dependencies: ['admin-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(__dirname, '.auth/admin.json'),
        baseURL: process.env.E2E_ADMIN_URL ?? 'http://localhost:5173',
      },
      testDir: path.resolve(__dirname, '../pretzel-console/e2e'),
      testMatch: '**/*.spec.ts',
      // Admin UI tests are parallelisable (each test gets its own browser context).
      workers: 2,
    },
  ],
})
