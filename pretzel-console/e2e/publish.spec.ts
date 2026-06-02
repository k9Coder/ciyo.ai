import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Publish', () => {
  test('publish succeeds and version increments', async ({ page }) => {
    await page.goto('/publish')

    // Read current version label before publishing
    const versionText    = await page.getByText(/version/i).first().textContent()
    const currentVersion = parseInt(versionText?.match(/\d+/)?.[0] ?? '0', 10)

    const publishDone = page.waitForResponse(r => r.url().includes('/v1/policy/publish'))
    await page.getByRole('button', { name: /publish/i }).click()
    await publishDone

    // Wait for the UI to reflect the new version
    await expect(async () => {
      const updatedText = await page.getByText(/version/i).first().textContent() ?? ''
      const newVersion  = parseInt(updatedText.match(/\d+/)?.[0] ?? '0', 10)
      expect(newVersion).toBeGreaterThan(currentVersion)
    }).toPass({ timeout: 10_000 })
  })

  test('policy history table shows published versions', async ({ page }) => {
    await page.goto('/publish')

    // The seeded tenant always has v1 in history
    await expect(page.getByText('Published versions')).toBeVisible()
    await expect(page.getByText(/v\d+/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rollback to this' }).first()).toBeVisible()
  })

  test('rollback to a previous version increments the version number', async ({ page }) => {
    // Ensure there are at least 2 versions: publish once via API to create v2 (seed has v1)
    const api = await playwrightRequest.newContext()
    await api.post(`${BACKEND}/v1/policy/publish`, { headers: adminHeaders() })
    await api.dispose()

    await page.goto('/publish')

    // Read current version before rollback
    const versionText    = await page.getByText(/version \d+/i).first().textContent()
    const currentVersion = parseInt(versionText?.match(/\d+/)?.[0] ?? '0', 10)

    // Rollback to the earliest version shown (last row)
    await page.getByRole('button', { name: 'Rollback to this' }).last().click()
    // ConfirmModal appears — wait for the rollback API response
    const rollbackDone = page.waitForResponse(
      r => r.url().includes('/v1/policy/rollback') && r.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Delete' }).click()
    await rollbackDone

    // Wait for the UI to update (invalidateQueries triggers a background refetch)
    await expect(async () => {
      const updatedText = await page.getByText(/version \d+/i).first().textContent() ?? ''
      const newVersion  = parseInt(updatedText.match(/\d+/)?.[0] ?? '0', 10)
      expect(newVersion).toBeGreaterThan(currentVersion)
    }).toPass({ timeout: 10_000 })
  })
})
