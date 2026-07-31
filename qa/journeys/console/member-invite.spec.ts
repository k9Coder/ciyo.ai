import { test, expect } from '@playwright/test'

test.describe('Members', () => {
  test('admin can generate an open invite link', async ({ page }) => {
    await page.goto('/members')

    await page.getByRole('button', { name: /invite member/i }).click()
    await page.locator('form').getByRole('button', { name: /generate link/i }).click()

    await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible({ timeout: 15_000 })
    const urlInput = page.locator('input[readonly]')
    await expect(urlInput).toHaveValue(/\/invite\/[a-f0-9]{64}/)
    // An unaccepted open invite creates no member row — nothing to clean up.
  })
})
