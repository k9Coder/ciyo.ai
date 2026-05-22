import { test, expect, chromium } from '@playwright/test'
import path from 'path'
import { getSeedState } from '../helpers/seed-state.js'

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')
const MOCK_PAGE      = path.resolve(__dirname, '../fixtures/chatgpt-mock.html')

test('extension fetches seeded policy and enforces ACME_SECRET block rule', async () => {
  const { orgToken } = getSeedState()
  const backendUrl   = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })

  // Inject test org token + point extension at test backend (not production)
  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')

  await background.evaluate(
    ([token, url]) => {
      chrome.storage.local.set({ orgToken: token, backendUrl: url })
    },
    [orgToken, backendUrl] as [string, string]
  )

  // Give the extension time to sync the policy from the test backend
  await new Promise(r => setTimeout(r, 3_000))

  const page = await context.newPage()
  await page.goto(`file://${MOCK_PAGE}`)

  // Type the keyword from the seeded block rule
  await page.locator('#prompt-textarea').fill('This is ACME_SECRET data')
  await page.locator('#send-button').click()

  // Block modal should appear — proves the extension fetched the live seeded policy
  const modal = page.locator('pierce/#ps-react-root')
  await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

  await context.close()
})
