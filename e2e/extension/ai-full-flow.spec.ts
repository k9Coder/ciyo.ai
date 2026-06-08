import { test, expect, chromium, request as playwrightRequest } from '@playwright/test'
import path from 'path'
import { adminHeaders } from '../helpers/admin-headers.js'
import { orgHeaders } from '../helpers/org-headers.js'
import { getSeedState } from '../helpers/seed-state.js'

const BACKEND  = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
const FIXTURES = 'http://localhost:9876'
// Extension is built to pretzel/dist — two levels up from e2e/extension/
const EXT_PATH = path.resolve(__dirname, '../../pretzel/dist')

test.afterAll(async () => {
  // Clean up the E2E_AI_FLOW rule created (or already present) from the apply step.
  // This prevents state pollution across runs: GET /v1/policy will not contain the
  // E2E_AI_FLOW keyword on subsequent test runs that rely on a known policy shape.
  const api = await playwrightRequest.newContext()
  try {
    // Fetch the current policy to find the E2E_AI_FLOW rule
    const policyRes = await api.get(`${BACKEND}/v1/policy`, { headers: orgHeaders() })
    if (policyRes.status() === 200) {
      const { policy } = await policyRes.json() as {
        policy: {
          subjects?: Array<{
            rules?: Array<{ id: string; keywords?: string[] }>
          }>
        }
      }
      // Find any rule that contains the E2E_AI_FLOW keyword and delete it
      for (const subject of policy?.subjects ?? []) {
        for (const rule of subject.rules ?? []) {
          if (rule.keywords?.includes('E2E_AI_FLOW')) {
            await api.delete(`${BACKEND}/v1/rules/${rule.id}`, { headers: adminHeaders() })
          }
        }
      }
    }
  } finally {
    await api.dispose()
  }
})

test('AI-created rule is enforced by the extension after policy publish', async () => {
  const { assistantFlowMessageId } = getSeedState()

  // ── 1. Apply the AI-suggested create_rule action ─────────────────────────
  const api = await playwrightRequest.newContext()

  const applyRes = await api.post(`${BACKEND}/v1/assistant/apply`, {
    headers: adminHeaders(),
    data:    { messageId: assistantFlowMessageId },
  })
  // 200 on first run; 409 if already applied (still fine — rule exists in DB)
  expect([200, 409]).toContain(applyRes.status())

  // ── 2. Publish updated policy ─────────────────────────────────────────────
  const publishRes = await api.post(`${BACKEND}/v1/policy/publish`, { headers: adminHeaders() })
  expect(publishRes.status()).toBe(200)

  // ── 3. Fetch the compiled policy doc ─────────────────────────────────────
  const policyRes = await api.get(`${BACKEND}/v1/policy`, { headers: orgHeaders() })
  expect(policyRes.status()).toBe(200)
  const { policy: policyDoc } = await policyRes.json() as { policy: unknown }

  await api.dispose()

  // ── 4. Launch extension and inject token + fresh policyDoc ────────────────
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  })

  // Guard against a race where the service worker is not yet registered at launch
  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker', { timeout: 15_000 })

  // Absorb fire-and-forget event POSTs so they don't hit the real backend and
  // produce noise or auth errors in the event log during this test
  await context.route('**/v1/events', (route: { fulfill: (opts: { status: number; body: string; contentType: string }) => Promise<void> }) =>
    route.fulfill({ status: 200, body: '{"ok":true}', contentType: 'application/json' })
  )

  await background.evaluate(({ token, doc }) => {
    void chrome.storage.local.set({ orgToken: token, policyDoc: doc })
  }, { token: 'e2e-fake-token', doc: policyDoc })

  // ── 5. Type the AI-created keyword and verify the extension blocks it ─────
  const page = await context.newPage()
  await page.goto(`${FIXTURES}/chatgpt-mock.html`)

  await page.locator('#prompt-textarea').fill('Please review E2E_AI_FLOW data')
  await page.locator('#send-button').click()

  const modal = page.locator('#ciyo-overlay-host').locator('#ps-react-root')
  await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

  // block action — no "Looks fine, send it"
  await expect(modal.getByRole('button', { name: 'Looks fine, send it' })).not.toBeVisible()
  await expect(modal.getByText('Your policy does not allow sending this content.')).toBeVisible()

  await context.close()
})
