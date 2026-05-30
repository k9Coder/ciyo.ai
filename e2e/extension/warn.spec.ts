import { test, expect, chromium } from '@playwright/test'
import path from 'path'
import { getSeedState } from '../helpers/seed-state.js'

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')
const MOCK_PAGE      = path.resolve(__dirname, '../fixtures/chatgpt-mock.html')

async function launchWithOrgToken() {
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

  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')

  await background.evaluate(
    ([token, url]) => {
      chrome.storage.local.set({ orgToken: token, backendUrl: url })
    },
    [orgToken, backendUrl] as [string, string]
  )

  // Wait for the extension to sync the seeded policy from the test backend
  await new Promise(r => setTimeout(r, 3_000))

  return context
}

test.describe('Warn vs block modal behaviour (seeded policy)', () => {
  test('ACME_WARN rule shows "Looks fine, send it" button', async () => {
    const context = await launchWithOrgToken()
    const page    = await context.newPage()
    await page.goto(`file://${MOCK_PAGE}`)

    await page.locator('#prompt-textarea').fill('Please review ACME_WARN data')
    await page.locator('#send-button').click()

    const modal = page.locator('pierce/#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

    // Warn action — "Looks fine, send it" must be present
    await expect(modal.getByRole('button', { name: 'Looks fine, send it' })).toBeVisible()

    await context.close()
  })

  test('ACME_SECRET block rule does NOT show "Looks fine, send it"', async () => {
    const context = await launchWithOrgToken()
    const page    = await context.newPage()
    await page.goto(`file://${MOCK_PAGE}`)

    await page.locator('#prompt-textarea').fill('This contains ACME_SECRET credentials')
    await page.locator('#send-button').click()

    const modal = page.locator('pierce/#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

    // Block action — "Looks fine, send it" must NOT appear
    await expect(modal.getByRole('button', { name: 'Looks fine, send it' })).not.toBeVisible()
    await expect(modal.getByText('Your policy does not allow sending this content.')).toBeVisible()

    await context.close()
  })
})
