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
