import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')
const MOCK_PAGE      = path.resolve(__dirname, '../fixtures/chatgpt-mock.html')

async function launchWithExtension() {
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })
}

test.describe('Extension detection', () => {
  test('block modal appears when API key is typed and send is clicked', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`file://${MOCK_PAGE}`)

    await page.locator('#prompt-textarea').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
    await page.locator('#send-button').click()

    await expect(
      page.locator('pierce/#ps-react-root').getByText('Sensitive content detected')
    ).toBeVisible({ timeout: 5_000 })

    // Cancel — no message sent
    await page.locator('pierce/#ps-react-root').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('#output')).toHaveText('No message sent yet.')

    await context.close()
  })

  test('send anyway with reason sends the message', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`file://${MOCK_PAGE}`)

    await page.locator('#prompt-textarea').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
    await page.locator('#send-button').click()

    const modal = page.locator('pierce/#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 5_000 })

    await modal.getByRole('button', { name: /send anyway/i }).click()
    await modal.locator('#ps-reason').fill('Development test key — not real.')
    await modal.getByRole('button', { name: /confirm send/i }).click()

    await expect(page.locator('#output')).toContainText('SENT:')
    await context.close()
  })

  test('text matching no rule triggers no modal', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`file://${MOCK_PAGE}`)

    await page.locator('#prompt-textarea').fill('Hello, can you help me write a cover letter?')
    await page.locator('#send-button').click()

    // Modal must NOT appear within 2s
    await expect(
      page.locator('pierce/#ps-react-root').getByText('Sensitive content detected')
    ).not.toBeVisible({ timeout: 2_000 })

    await context.close()
  })
})
