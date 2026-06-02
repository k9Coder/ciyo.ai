import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const EXTENSION_PATH = path.resolve(__dirname, '../dist')

async function launchAndGetOptionsUrl() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })

  const sw = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')

  // Extract the extension ID from the service worker URL
  const extId = new URL(sw.url()).hostname
  const optionsUrl = `chrome-extension://${extId}/src/options/index.html`

  return { context, optionsUrl }
}

test.describe('Extension options page', () => {
  test('all three tabs are visible', async () => {
    const { context, optionsUrl } = await launchAndGetOptionsUrl()
    const page = await context.newPage()
    await page.goto(optionsUrl)

    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Audit Log' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'About' })).toBeVisible()

    await context.close()
  })

  test('Account tab shows sign-in form when not authenticated', async () => {
    const { context, optionsUrl } = await launchAndGetOptionsUrl()
    const page = await context.newPage()
    await page.goto(optionsUrl)

    // Account is the default tab — Clerk sign-in renders when unauthenticated
    await expect(page.locator('.cl-signIn-root, [data-clerk-id], form').first())
      .toBeVisible({ timeout: 8_000 })

    await context.close()
  })

  test('Audit Log tab renders without crashing', async () => {
    const { context, optionsUrl } = await launchAndGetOptionsUrl()
    const page = await context.newPage()
    await page.goto(optionsUrl)

    await page.getByRole('button', { name: 'Audit Log' }).click()

    // Either a table or the empty-state message should appear
    await expect(
      page.getByText(/audit log|no audit events/i).first()
    ).toBeVisible({ timeout: 5_000 })

    await context.close()
  })

  test('About tab shows version number', async () => {
    const { context, optionsUrl } = await launchAndGetOptionsUrl()
    const page = await context.newPage()
    await page.goto(optionsUrl)

    await page.getByRole('button', { name: 'About' }).click()

    await expect(page.getByText(/version/i)).toBeVisible()

    await context.close()
  })
})
