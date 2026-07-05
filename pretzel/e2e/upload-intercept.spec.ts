/**
 * E2E tests for the fetch/XHR file-upload interception path.
 *
 * The MAIN world fetch-interceptor overrides window.fetch. When a file is
 * uploaded via FormData, the interceptor extracts the file content and sends
 * it for detection before allowing (or blocking) the upload.
 *
 * These tests use upload-mock.html, which POSTs to /upload with FormData.
 * We route /upload in the test so it returns 200 if the request reaches the
 * server (i.e. was NOT blocked by the interceptor).
 */

import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const FIXTURES = 'http://localhost:9876'
const EXT_PATH = path.resolve(__dirname, '../dist')

async function launchWithExtension() {
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
  await background.evaluate(async () => {
    await chrome.storage.local.set({ orgToken: 'e2e-fake-token' })
  })

  // Route /upload so it returns 200 when the fetch is not blocked.
  await context.route('**/upload', (route) =>
    route.fulfill({ status: 200, body: '{"ok":true}', contentType: 'application/json' })
  )

  return context
}

test.describe('File upload fetch interception', () => {
  test('blocks upload of file containing API key', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/upload-mock.html`)

    // Upload a text file containing an OpenAI API key (triggers block rule)
    await page.locator('#file-input').setInputFiles({
      name:     'secrets.txt',
      mimeType: 'text/plain',
      buffer:   Buffer.from('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno'),
    })
    await page.locator('button[aria-label="Upload file"]').click()

    // The block modal must appear from the fetch interceptor path
    const modal = page.locator('#ciyo-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

    // Block action: "Edit prompt" only, no "Looks fine, send it"
    await expect(modal.getByRole('button', { name: 'Edit prompt' })).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Looks fine, send it' })).not.toBeVisible()

    // Dismiss and confirm upload was aborted (output unchanged from initial state)
    await modal.getByRole('button', { name: 'Edit prompt' }).click()
    await expect(page.locator('#output')).toContainText('BLOCKED:')

    await context.close()
  })

  test('allows upload of safe file with no findings', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/upload-mock.html`)

    // Upload a plain safe text file — no detection rule should match
    await page.locator('#file-input').setInputFiles({
      name:     'notes.txt',
      mimeType: 'text/plain',
      buffer:   Buffer.from('Meeting notes: discuss Q3 roadmap and team velocity.'),
    })
    await page.locator('button[aria-label="Upload file"]').click()

    // No modal should appear; upload proceeds to the server
    await expect(page.locator('#output')).toContainText('UPLOADED:', { timeout: 8_000 })

    // Confirm the modal never appeared
    await expect(
      page.locator('#ciyo-overlay-host').locator('#ps-react-root').getByText('Sensitive content detected'),
      'Safe file must not trigger a block/warn modal'
    ).not.toBeVisible({ timeout: 500 })

    await context.close()
  })

  test('warns on upload of file containing JWT token', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`${FIXTURES}/upload-mock.html`)

    const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fake_sig_AABBCCDDEE'
    await page.locator('#file-input').setInputFiles({
      name:     'token.txt',
      mimeType: 'text/plain',
      buffer:   Buffer.from(`Authorization: Bearer ${fakeJwt}`),
    })
    await page.locator('button[aria-label="Upload file"]').click()

    const modal = page.locator('#ciyo-overlay-host').locator('#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

    // Warn action: "Looks fine, send it" IS available
    await expect(modal.getByRole('button', { name: 'Looks fine, send it' })).toBeVisible()

    // Click through — upload should proceed
    await modal.getByRole('button', { name: 'Looks fine, send it' }).click()
    await expect(page.locator('#output')).toContainText('UPLOADED:', { timeout: 5_000 })

    await context.close()
  })
})
