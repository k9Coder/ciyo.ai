import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('loads without error and renders metric cards', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)

    // Page heading
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()

    // Metric cards should render (values may be zero)
    await expect(page.getByText(/incidents/i)).toBeVisible()
    await expect(page.getByText(/sites/i)).toBeVisible()
  })

  test('unauthenticated visit to /dashboard redirects to login', async ({ browser }) => {
    // New context with NO stored auth
    const context = await browser.newContext({ storageState: undefined })
    const page    = await context.newPage()

    await page.goto(process.env.E2E_ADMIN_URL + '/dashboard')
    await expect(page).toHaveURL(/login|\/$/i)
    await context.close()
  })
})
