import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND     = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
const TEST_DOMAIN = 'e2e-test-site.internal'

test.describe('Site configs', () => {
  test.afterEach(async () => {
    const api = await playwrightRequest.newContext()
    await api.delete(`${BACKEND}/v1/site-configs/${TEST_DOMAIN}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('can edit site config selectors', async ({ page }) => {
    const EDIT_DOMAIN = 'e2e-edit-site.internal'

    // Create the config via API first
    const api = await playwrightRequest.newContext()
    await api.post(`${BACKEND}/v1/site-configs`, {
      headers: adminHeaders(),
      data: { domain: EDIT_DOMAIN, inputSelector: '#old-input', sendButtonSelector: '#old-btn' },
    })
    await api.dispose()

    await page.goto('/sites')
    await page.getByText(EDIT_DOMAIN).waitFor()

    // Edit button is a plain <button> in each row's action cell
    await page.getByRole('button', { name: 'Edit' }).first().click()

    const inputField  = page.getByRole('dialog').getByLabel(/input selector/i)
    const buttonField = page.getByRole('dialog').getByLabel(/send.?button selector/i)

    await inputField.clear()
    await inputField.fill('#new-input')
    await buttonField.clear()
    await buttonField.fill('#new-btn')

    await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()

    // Domain row is still visible with updated config
    await expect(page.getByText(EDIT_DOMAIN)).toBeVisible()

    // Cleanup
    const cleanupApi = await playwrightRequest.newContext()
    await cleanupApi.delete(`${BACKEND}/v1/site-configs/${EDIT_DOMAIN}`, { headers: adminHeaders() })
    await cleanupApi.dispose()
  })

  test('can create a site config', async ({ page }) => {
    await page.goto('/sites')

    await page.getByRole('button', { name: /add site|new site|\+/i }).click()

    await page.getByLabel(/domain/i).fill(TEST_DOMAIN)
    await page.getByLabel(/input selector/i).fill('#prompt-input')
    await page.getByLabel(/send.?button selector/i).fill('#send-btn')
    await page.getByRole('button', { name: /create|save/i }).click()

    await expect(page.getByText(TEST_DOMAIN)).toBeVisible()
  })
})
