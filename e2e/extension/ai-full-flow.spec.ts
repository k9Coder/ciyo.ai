import { test, expect, chromium, request as playwrightRequest } from '@playwright/test'
import path from 'path'
import { adminHeaders } from '../helpers/admin-headers.js'
import { orgHeaders } from '../helpers/org-headers.js'
import { getSeedState } from '../helpers/seed-state.js'

const BACKEND  = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
const FIXTURES = 'http://localhost:9876'
const EXT_PATH = path.resolve(__dirname, '../../extension/dist')

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

  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')

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
