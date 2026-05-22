import { test, expect } from '@playwright/test'

test.describe('Publish', () => {
  test('publish succeeds and version increments', async ({ page }) => {
    await page.goto('/publish')

    // Read current version label before publishing
    const versionText    = await page.getByText(/version/i).first().textContent()
    const currentVersion = parseInt(versionText?.match(/\d+/)?.[0] ?? '0', 10)

    await page.getByRole('button', { name: /publish/i }).click()

    // Success indicator appears
    const successIndicator = page.getByText(/published|success/i)
    await expect(successIndicator).toBeVisible({ timeout: 10_000 })

    // Version should have incremented
    const updatedText = await page.getByText(/version/i).first().textContent()
    const newVersion  = parseInt(updatedText?.match(/\d+/)?.[0] ?? '0', 10)
    expect(newVersion).toBeGreaterThan(currentVersion)
  })
})
