import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const FIXTURES = 'http://localhost:9876'
const EXT_PATH = path.resolve(__dirname, '../../dist')

async function launchWithExtension() {
  const extPath  = EXT_PATH
  const context  = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
  })

  // Inject a token string so isAuthenticated() returns true.
  // No policyDoc means the DEFAULT_POLICY (built-in API key / JWT rules) is used.
  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')
  await background.evaluate(() => {
    void chrome.storage.local.set({ orgToken: 'e2e-fake-token' })
  })

  return context
}

test.describe('Extension detection', () => {
  test('block modal appears when API key is typed and send is clicked', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/chatgpt-mock.html`)

    await page.locator('#prompt-textarea').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
    await page.locator('#send-button').click()

    const modal = page.locator('#ciyo-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 5_000 })

    // Block action: only "Edit prompt" is shown (no "Looks fine, send it")
    await modal.getByRole('button', { name: 'Edit prompt' }).click()
    await expect(page.locator('#output')).toHaveText('No message sent yet.')

    await context.close()
  })

  test('warn modal — Looks fine, send it — sends the message', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/chatgpt-mock.html`)

    // JWT token triggers a warn action (not block), enabling the "Looks fine, send it" button
    const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fake_sig_AABBCCDDEE'
    await page.locator('#prompt-textarea').fill(`Token: ${fakeJwt}`)
    await page.locator('#send-button').click()

    const modal = page.locator('#ciyo-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 5_000 })

    // Warn action: "Looks fine, send it" button is present — clicking sends immediately
    await modal.getByRole('button', { name: 'Looks fine, send it' }).click()

    await expect(page.locator('#output')).toContainText('SENT:')
    await context.close()
  })

  test('block modal appears on claude-style (.ProseMirror) composer', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/claude-mock.html`)

    await page.locator('.ProseMirror').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
    await page.locator('button[aria-label="Send Message"]').click()

    const modal = page.locator('#ciyo-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 5_000 })
    await modal.getByRole('button', { name: 'Edit prompt' }).click()

    await context.close()
  })

  test('block modal appears on gemini-style (.ql-editor) composer', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/gemini-mock.html`)

    await page.locator('.ql-editor').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
    await page.locator('button[aria-label="Send message"]').click()

    const modal = page.locator('#ciyo-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 5_000 })
    await modal.getByRole('button', { name: 'Edit prompt' }).click()

    await context.close()
  })

  test('text matching no rule triggers no modal', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/chatgpt-mock.html`)

    await page.locator('#prompt-textarea').fill('Hello, can you help me write a cover letter?')
    await page.locator('#send-button').click()

    // Modal must NOT appear within 2s
    await expect(
      page.locator('#ciyo-overlay-host').locator('#ps-react-root').getByText('Sensitive content detected')
    ).not.toBeVisible({ timeout: 2_000 })

    await context.close()
  })
})
