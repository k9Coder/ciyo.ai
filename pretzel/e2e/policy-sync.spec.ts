import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const FIXTURES = 'http://localhost:9876'
const EXT_PATH = path.resolve(__dirname, '../dist')

// Mirrors the policyDoc shape produced by GET /v1/policy on the test tenant.
// We inject it directly so no backend sync (or a hardcoded VITE_API_BASE) is needed.
const TEST_POLICY_DOC = {
  version:     1,
  tenantId:    'e2etenant',
  subjects: [
    {
      id:   'acme-confidential',
      name: 'ACME Confidential',
      rules: [
        {
          id:          'acme-secret-block',
          kind:        'keyword',
          keywords:    ['ACME_SECRET'],
          pattern:     null,
          destinations: [],
          action:      'block',
          message:     null,
          reportLevel: 'medium',
        },
      ],
    },
  ],
  siteConfigs: {},
}

test('extension enforces ACME_SECRET block rule and dispatches an audit event', async () => {
  const extPath = EXT_PATH

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
  })

  // Inject token + policy doc so the extension has the ACME rules without backend sync
  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')
  await background.evaluate(async (doc) => {
    await chrome.storage.local.set({ orgToken: 'e2e-fake-token', policyDoc: doc })
  }, TEST_POLICY_DOC)

  // Intercept the event dispatch. The service worker POSTs to API_BASE/v1/events
  // (fire-and-forget). We capture the request body to verify it.
  const capturedEvents: string[] = []
  await context.route('**/v1/events', async route => {
    capturedEvents.push(route.request().postData() ?? '')
    await route.fulfill({ status: 200, body: '{"ok":true}', contentType: 'application/json' })
  })

  const page = await context.newPage()
  await page.goto(`${FIXTURES}/chatgpt-mock.html`)

  // Type the blocked keyword
  await page.locator('#prompt-textarea').fill('This is ACME_SECRET data')
  await page.locator('#send-button').click()

  // Modal must appear — proves the injected policy is being enforced
  const modal = page.locator('#ciyo-overlay-host').locator('#ps-react-root')
  await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

  // Wait for the fire-and-forget event dispatch to reach the route handler.
  // Using expect.poll is deterministic: it returns as soon as the event arrives
  // and fails with a clear message if it does not arrive within 8 s — much better
  // than a hard 2 s sleep that is either too short (flaky) or too long (slow).
  await expect
    .poll(() => capturedEvents.length, {
      message: 'Expected at least one audit event to be dispatched within 8 s',
      timeout:  8_000,
    })
    .toBeGreaterThanOrEqual(1)

  // Verify that an event was dispatched with action="block"
  const body = JSON.parse(capturedEvents[0]!) as Record<string, unknown>
  expect(body['action']).toBe('block')

  await context.close()
})
