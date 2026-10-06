import { test, expect } from '@playwright/test'

test.describe('Console smoke', () => {
  test('an authenticated admin can reach the dashboard with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)
    await expect(page.getByRole('heading')).toBeVisible()

    expect(errors, `console.error() calls on load: ${errors.join('; ')}`).toEqual([])
  })
})
